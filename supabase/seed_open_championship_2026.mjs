import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const EASY_OFFICE_POOLS_URL = "https://www.easyofficepools.com/british-open-championship-pool-tiers/";
const TOURNAMENT_NAME = "2026 British Open";
const AUTH_PAGE_SIZE = 1000;

const UK_NATIVES = [
  "Sam Bairstow",
  "Matthew Baldwin",
  "Dan Bradbury",
  "Laurie Canter",
  "Joe Dean",
  "Alex Fitzpatrick",
  "Matt Fitzpatrick",
  "Tommy Fleetwood",
  "Harry Hall",
  "Tyrrell Hatton",
  "Matthew Jordan",
  "Aaron Rai",
  "Matthew Southgate",
  "Andy Sullivan",
  "Matt Wallace",
  "Jack McDonald",
  "Robert MacIntyre",
  "Rory McIlroy",
];

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

function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTiers(html) {
  const marker = "window.tiers = ";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Missing Easy Office Pools tier data.");
  const scriptEnd = html.indexOf("</script>", start);
  if (scriptEnd < 0) throw new Error("Missing Easy Office Pools tier script end.");

  let json = html.slice(start + marker.length, scriptEnd).trim();
  if (json.endsWith(";")) json = json.slice(0, -1);
  return JSON.parse(json);
}

function buildFieldNames(tiers) {
  const worldRankTiers = tiers["6 Tiers by World Rank"];
  if (!worldRankTiers) throw new Error("Missing 6 Tiers by World Rank data.");

  const ukNames = new Set(UK_NATIVES.map(normalizeName));
  const numberedNames = Object.values(worldRankTiers)
    .flat()
    .filter((row) => row?.golfer && !/^WITHDRAWN/i.test(row.golfer))
    .filter((row) => !ukNames.has(normalizeName(row.golfer)))
    .map((row) => String(row.golfer).trim());

  return [...UK_NATIVES, ...numberedNames];
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

  const names = buildFieldNames(extractTiers(html));
  if (names.length < 140) throw new Error(`Unexpectedly small British Open field: ${names.length}`);

  const { data: pool, error: poolError } = await admin
    .from("pools")
    .select("id,name")
    .eq("name", poolName)
    .maybeSingle();
  if (poolError) throw poolError;
  if (!pool) throw new Error(`Pool "${poolName}" not found. Run bootstrap first.`);

  const membership = await ensureActiveUsersArePoolMembers(admin, pool.id);

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

  const existingByName = new Map((existingGolfers || []).map((row) => [normalizeName(row.name), row]));
  const missingNames = names.filter((name) => !existingByName.has(normalizeName(name)));

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

  const golferIdByName = new Map((allGolfers || []).map((row) => [normalizeName(row.name), row.id]));
  const rosterRows = names.map((name) => {
    const golferId = golferIdByName.get(normalizeName(name));
    if (!golferId) throw new Error(`Missing golfer after insert: ${name}`);
    return {
      pool_id: pool.id,
      tournament_id: tournament.id,
      golfer_id: golferId,
      active: true,
    };
  });

  const { error: clearRosterError } = await admin
    .from("tournament_golfers")
    .delete()
    .eq("pool_id", pool.id)
    .eq("tournament_id", tournament.id);
  if (clearRosterError) throw clearRosterError;

  const { error: rosterError } = await admin.from("tournament_golfers").insert(rosterRows);
  if (rosterError) throw rosterError;

  console.log(JSON.stringify({
    ok: true,
    pool: pool.name,
    tournament: tournament.name,
    field_count: names.length,
    golfers_added: missingNames.length,
    roster_inserted: rosterRows.length,
    uk_native_count: UK_NATIVES.length,
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
