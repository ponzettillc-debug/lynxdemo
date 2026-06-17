import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const EASY_OFFICE_POOLS_URL = "https://www.easyofficepools.com/us-open-field-listed-by-world-ranking-and-odds-to-win/";
const TOURNAMENT_NAME = "2026 US Open";
const AUTH_PAGE_SIZE = 1000;

function readEnv() {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function extractJson(html, marker, endMarker) {
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Missing marker ${marker}`);
  const jsonStart = start + marker.length;
  const end = html.indexOf(endMarker, jsonStart);
  if (end < 0) throw new Error(`Missing end marker ${endMarker}`);
  return JSON.parse(html.slice(jsonStart, end + endMarker.length - 1));
}

async function listActiveAuthUsers(admin) {
  const users = [];
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw new Error(error.message || "Failed to list users.");

    const pageUsers = data?.users || [];
    users.push(
      ...pageUsers.filter((user) => {
        const hasEmail = Boolean(user.email);
        const isDeleted = Boolean(user.deleted_at);
        const isBanned = Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now());
        return hasEmail && !isDeleted && !isBanned;
      })
    );

    if (pageUsers.length < AUTH_PAGE_SIZE) break;
    page += 1;
  }

  return users;
}

async function ensureActiveUsersArePoolMembers(admin, poolId) {
  const users = await listActiveAuthUsers(admin);
  const shouldWrite = /^true$/i.test(process.env.ADD_ACTIVE_USERS_TO_POOL || "");

  const { data: existingMembers, error: memberError } = await admin
    .from("pool_members")
    .select("user_id")
    .eq("pool_id", poolId);
  if (memberError) throw memberError;

  const existingIds = new Set((existingMembers || []).map((row) => String(row.user_id)));
  const missingUsers = users.filter((user) => !existingIds.has(user.id));

  if (shouldWrite && missingUsers.length) {
    const { error: insertMemberError } = await admin
      .from("pool_members")
      .insert(missingUsers.map((user) => ({
        pool_id: poolId,
        user_id: user.id,
        role: "member",
      })));
    if (insertMemberError) throw insertMemberError;
  }

  return {
    active_users: users.length,
    missing_pool_members: missingUsers.length,
    missing_pool_member_emails: missingUsers.map((user) => user.email).filter(Boolean),
    pool_members_added: shouldWrite ? missingUsers.length : 0,
    membership_write_enabled: shouldWrite,
  };
}

async function main() {
  const env = readEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
  const poolName = env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";

  if (!supabaseUrl || !serviceRole) throw new Error("Missing Supabase env vars.");

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const html = await fetch(EASY_OFFICE_POOLS_URL).then((res) => {
    if (!res.ok) throw new Error(`Easy Office Pools fetch failed: ${res.status}`);
    return res.text();
  });

  const fieldData = extractJson(html, "window.fieldData = ", "];");
  const names = fieldData.map((row) => String(row.golfer || "").trim()).filter(Boolean);
  if (names.length < 100) throw new Error(`Unexpectedly small US Open field: ${names.length}`);

  const { data: pool, error: poolError } = await admin
    .from("pools")
    .select("id,name")
    .eq("name", poolName)
    .maybeSingle();
  if (poolError) throw poolError;
  if (!pool) throw new Error(`Pool "${poolName}" not found. Run bootstrap first.`);

  let { data: tournament, error: tournamentError } = await admin
    .from("tournaments")
    .select("id,name")
    .eq("pool_id", pool.id)
    .eq("name", TOURNAMENT_NAME)
    .maybeSingle();
  if (tournamentError) throw tournamentError;

  if (!tournament) {
    const created = await admin
      .from("tournaments")
      .insert({ pool_id: pool.id, name: TOURNAMENT_NAME })
      .select("id,name")
      .single();
    if (created.error) throw created.error;
    tournament = created.data;
  }

  const { data: existingGolfers, error: existingError } = await admin
    .from("golfers")
    .select("id,name")
    .eq("pool_id", pool.id);
  if (existingError) throw existingError;

  const existingByName = new Map((existingGolfers || []).map((row) => [String(row.name).trim().toLowerCase(), row]));
  const missingNames = names.filter((name) => !existingByName.has(name.toLowerCase()));

  if (missingNames.length) {
    const { error: insertGolfersError } = await admin
      .from("golfers")
      .insert(missingNames.map((name) => ({ pool_id: pool.id, name })));
    if (insertGolfersError) throw insertGolfersError;
  }

  const { data: allGolfers, error: allGolfersError } = await admin
    .from("golfers")
    .select("id,name")
    .eq("pool_id", pool.id);
  if (allGolfersError) throw allGolfersError;

  const golferIdByName = new Map((allGolfers || []).map((row) => [String(row.name).trim().toLowerCase(), row.id]));
  const rosterRows = names.map((name) => {
    const golferId = golferIdByName.get(name.toLowerCase());
    if (!golferId) throw new Error(`Missing golfer after insert: ${name}`);
    return {
      pool_id: pool.id,
      tournament_id: tournament.id,
      golfer_id: golferId,
      active: true,
    };
  });

  const { error: rosterError } = await admin
    .from("tournament_golfers")
    .upsert(rosterRows, { onConflict: "pool_id,tournament_id,golfer_id" });
  if (rosterError) throw rosterError;

  const membership = await ensureActiveUsersArePoolMembers(admin, pool.id);

  console.log(JSON.stringify({
    ok: true,
    pool: pool.name,
    tournament: tournament.name,
    field_count: names.length,
    golfers_added: missingNames.length,
    roster_upserted: rosterRows.length,
    active_users: membership.active_users,
    missing_pool_members: membership.missing_pool_members,
    missing_pool_member_emails: membership.missing_pool_member_emails,
    pool_members_added: membership.pool_members_added,
    membership_write_enabled: membership.membership_write_enabled,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
