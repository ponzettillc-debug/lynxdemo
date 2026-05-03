import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type GolferRow = { id: string; name: string };

const COUNTRY_SUFFIXES = [
  "United States",
  "South Africa",
  "South Korea",
  "Northern Ireland",
  "New Zealand",
  "England",
  "Scotland",
  "Ireland",
  "Sweden",
  "Norway",
  "Spain",
  "Japan",
  "Australia",
  "Canada",
  "Mexico",
  "France",
  "Germany",
  "Italy",
  "Belgium",
  "Denmark",
  "Austria",
  "Argentina",
  "Chile",
  "Colombia",
  "Poland",
  "Finland",
  "China",
  "India",
  "Thailand",
  "Taiwan",
  "Korea",
  "USA",
];

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s.'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanName(raw: string) {
  let name = raw
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  for (const country of COUNTRY_SUFFIXES) {
    const suffix = new RegExp(`\\s+${country.replace(/\s+/g, "\\s+")}$`, "i");
    name = name.replace(suffix, "").trim();
  }

  return name
    .replace(/^(favorite|player)\s+/i, "")
    .replace(/\s+(profile|bio)$/i, "")
    .trim();
}

function parseNamesFromText(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map(cleanName)
        .filter((name) => /^[A-Za-z][A-Za-z .'-]{2,}$/.test(name))
    )
  );
}

function parseNamesFromPlayersHtml(html: string) {
  const names = new Set<string>();

  for (const match of html.matchAll(/<a[^>]+href=["'][^"']*\/players\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = cleanName(match[1].replace(/<[^>]+>/g, " "));
    if (/^[A-Za-z][A-Za-z .'-]{2,}$/.test(text)) names.add(text);
  }

  if (names.size > 0) return Array.from(names);

  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, "\n");
  return parseNamesFromText(text);
}

function isMissingRosterTable(error: any) {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("tournament_golfers");
}

async function requireAdmin(req: NextRequest) {
  if (!supabaseUrl) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_URL.", 500) };
  if (!supabaseAnonKey) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.", 500) };
  if (!supabaseServiceRoleKey) return { error: jsonError("Missing SUPABASE_SERVICE_ROLE_KEY.", 500) };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: jsonError("Missing auth token.", 401) };

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user?.email) return { error: jsonError("Unauthorized.", 401) };
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return { error: jsonError("Admin access required.", 403) };
  }

  return { supabaseAdmin };
}

async function getTournamentRoster(supabaseAdmin: any, poolId: string, tournamentId: string) {
  const [{ data: golfers, error: golfersError }, { data: roster, error: rosterError }] = await Promise.all([
    supabaseAdmin.from("golfers").select("id,name").eq("pool_id", poolId).order("name", { ascending: true }),
    supabaseAdmin
      .from("tournament_golfers")
      .select("golfer_id,active")
      .eq("pool_id", poolId)
      .eq("tournament_id", tournamentId),
  ]);

  if (golfersError) throw new Error(`Failed to load golfers: ${golfersError.message}`);
  if (rosterError) {
    if (isMissingRosterTable(rosterError)) {
      throw new Error("Missing tournament_golfers table. Apply supabase/tournament_golfers.sql in Supabase first.");
    }
    throw new Error(`Failed to load tournament roster: ${rosterError.message}`);
  }

  const activeIds = new Set((roster ?? []).filter((row: any) => row.active !== false).map((row: any) => String(row.golfer_id)));
  const golferRows = (golfers ?? []) as GolferRow[];

  return {
    golfers: golferRows,
    roster_golfer_ids: Array.from(activeIds),
    roster_golfers: golferRows.filter((g) => activeIds.has(g.id)),
  };
}

async function ensureGolfers(supabaseAdmin: any, poolId: string, names: string[]) {
  const { data, error } = await supabaseAdmin.from("golfers").select("id,name").eq("pool_id", poolId);
  if (error) throw new Error(`Failed to load golfers: ${error.message}`);

  const existing = (data ?? []) as GolferRow[];
  const byName = new Map(existing.map((golfer) => [normalizeName(golfer.name), golfer]));
  const roster: GolferRow[] = [];
  const created: string[] = [];

  for (const name of names) {
    const key = normalizeName(name);
    if (!key) continue;

    const found = byName.get(key);
    if (found) {
      roster.push(found);
      continue;
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("golfers")
      .insert({ pool_id: poolId, name })
      .select("id,name")
      .single();

    if (insertError) throw new Error(`Failed to create golfer "${name}": ${insertError.message}`);
    byName.set(key, inserted);
    roster.push(inserted);
    created.push(name);
  }

  return { roster, created };
}

async function replaceRoster(supabaseAdmin: any, poolId: string, tournamentId: string, golferIds: string[]) {
  const { error: deleteError } = await supabaseAdmin
    .from("tournament_golfers")
    .delete()
    .eq("pool_id", poolId)
    .eq("tournament_id", tournamentId);

  if (deleteError) throw new Error(`Failed to clear roster: ${deleteError.message}`);

  if (golferIds.length === 0) return;

  const rows = golferIds.map((golferId) => ({
    pool_id: poolId,
    tournament_id: tournamentId,
    golfer_id: golferId,
    active: true,
  }));

  const { error: insertError } = await supabaseAdmin.from("tournament_golfers").insert(rows);
  if (insertError) throw new Error(`Failed to save roster: ${insertError.message}`);
}

export async function GET(req: NextRequest) {
  try {
    const check = await requireAdmin(req);
    if ("error" in check) return check.error;

    const { searchParams } = new URL(req.url);
    const poolId = searchParams.get("pool_id") || "";
    const tournamentId = searchParams.get("tournament_id") || "";
    if (!poolId || !tournamentId) return jsonError("pool_id and tournament_id are required.", 400);

    const roster = await getTournamentRoster(check.supabaseAdmin, poolId, tournamentId);
    return NextResponse.json({ ok: true, ...roster });
  } catch (err: any) {
    return jsonError(err?.message || "Server error.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const check = await requireAdmin(req);
    if ("error" in check) return check.error;

    const body = await req.json().catch(() => ({}));
    const poolId = String(body?.pool_id || "");
    const tournamentId = String(body?.tournament_id || "");
    const action = String(body?.action || "");

    if (!poolId || !tournamentId) return jsonError("pool_id and tournament_id are required.", 400);

    if (action === "seed_all") {
      const { data: golfers, error } = await check.supabaseAdmin.from("golfers").select("id").eq("pool_id", poolId);
      if (error) return jsonError(`Failed to load golfers: ${error.message}`, 400);
      await replaceRoster(check.supabaseAdmin, poolId, tournamentId, (golfers ?? []).map((g: any) => String(g.id)));
      const roster = await getTournamentRoster(check.supabaseAdmin, poolId, tournamentId);
      return NextResponse.json({ ok: true, ...roster, imported_count: roster.roster_golfer_ids.length, created: [] });
    }

    let names: string[] = [];

    if (action === "import_url") {
      const sourceUrl = String(body?.url || "");
      if (!/^https?:\/\//i.test(sourceUrl)) return jsonError("A valid source URL is required.", 400);

      const response = await fetch(sourceUrl, {
        headers: {
          "User-Agent": "4PlayGolfRosterImporter/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!response.ok) return jsonError(`Source returned ${response.status}.`, 400);
      names = parseNamesFromPlayersHtml(await response.text());
    } else if (action === "replace_names") {
      names = parseNamesFromText(String(body?.names || ""));
    } else {
      return jsonError("Unsupported action.", 400);
    }

    if (names.length === 0) return jsonError("No player names were found.", 400);

    const { roster, created } = await ensureGolfers(check.supabaseAdmin, poolId, names);
    await replaceRoster(check.supabaseAdmin, poolId, tournamentId, roster.map((golfer) => golfer.id));
    const nextRoster = await getTournamentRoster(check.supabaseAdmin, poolId, tournamentId);

    return NextResponse.json({
      ok: true,
      ...nextRoster,
      imported_count: roster.length,
      created,
      parsed_names: names,
    });
  } catch (err: any) {
    return jsonError(err?.message || "Server error.", 500);
  }
}
