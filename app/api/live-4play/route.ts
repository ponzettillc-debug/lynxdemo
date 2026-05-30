import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SALMON_FORMAT = "Salmon Falls - Regular";
const CMO_FORMAT = "CMO Goes to Point Sebago";
const VALID_FORMATS = new Set(["Points", "Skins", "Ryder Cup", "Coon", SALMON_FORMAT, CMO_FORMAT]);
const VALID_HOLES = new Set([9, 18]);
const VALID_SALMON_SCORING_MODES = new Set(["all", "top3", "top2"]);

type AuthUser = {
  id?: string;
  email?: string | null;
  user_metadata?: {
    display_name?: string;
  };
};

type LiveTournamentRow = {
  id: string;
  name: string;
  format: string;
  holes_count: number;
  team_names: unknown;
  scores: unknown;
  status?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

async function requireUser(req: NextRequest) {
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

  if (error || !user) return { error: jsonError("Unauthorized.", 401) };
  return { supabaseAdmin, user };
}

function isMissingLiveTable(message: string) {
  return /schema cache|does not exist|relation .*live_4play_tournaments|live_4play_tournaments.*does not exist/i.test(message);
}

function emailPrefix(email?: string | null) {
  const clean = String(email || "").trim();
  if (!clean) return "";
  return clean.includes("@") ? clean.split("@")[0] : clean;
}

function authUserLabel(user: AuthUser) {
  return (
    String(user?.user_metadata?.display_name || "").trim() ||
    emailPrefix(user?.email) ||
    `${String(user?.id || "").slice(0, 8)}...`
  );
}

function cleanTeamNames(value: unknown, fallbackCount = 2) {
  const raw = Array.isArray(value) ? value : [];
  const names = raw
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .slice(0, 4);

  const count = Math.max(2, Math.min(4, names.length || fallbackCount));
  return Array.from({ length: count }, (_, index) => names[index] || `Team ${index + 1}`);
}

function cleanScores(value: unknown, teamCount: number, holesCount: number) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from({ length: teamCount }, (_, teamIndex) => {
    const teamScores = Array.isArray(raw[teamIndex]) ? raw[teamIndex] : [];
    return Array.from({ length: holesCount }, (_, holeIndex) => {
      const score = Number(teamScores[holeIndex]);
      return Number.isFinite(score) && score >= 0 ? Math.round(score * 10) / 10 : null;
    });
  });
}

function cleanStringMatrix(value: unknown, teamCount: number) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from({ length: teamCount }, (_, teamIndex) => {
    const teamPlayers = Array.isArray(raw[teamIndex]) ? raw[teamIndex] : [];
    return teamPlayers.map((name) => String(name || "").trim()).filter(Boolean).slice(0, 4);
  });
}

function cleanSalmonScores(value: unknown, teamPlayers: string[][]) {
  const raw = Array.isArray(value) ? value : [];
  return teamPlayers.map((players, teamIndex) => {
    const rawTeam = Array.isArray(raw[teamIndex]) ? raw[teamIndex] : [];
    return players.map((_player, playerIndex) => {
      const rawPlayer = Array.isArray(rawTeam[playerIndex]) ? rawTeam[playerIndex] : [];
      return Array.from({ length: 9 }, (_hole, holeIndex) => {
        const score = Number(rawPlayer[holeIndex]);
        return Number.isFinite(score) && score > 0 ? Math.round(score) : null;
      });
    });
  });
}

function cleanSalmonPayload(value: unknown, teamNames: string[]) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const teamPlayers = cleanStringMatrix(raw.team_players, teamNames.length);
  const playerOptions = Array.isArray(raw.player_options)
    ? raw.player_options.map((name) => String(name || "").trim()).filter(Boolean).slice(0, 200)
    : [];

  return {
    kind: "salmon_falls_regular",
    scoring_mode: VALID_SALMON_SCORING_MODES.has(String(raw.scoring_mode || ""))
      ? String(raw.scoring_mode)
      : "all",
    player_options: Array.from(new Set([...playerOptions, ...teamPlayers.flat()])),
    team_player_counts: teamPlayers.map((players) => Math.max(1, Math.min(4, players.length || 1))),
    team_players: teamPlayers,
    player_scores: cleanSalmonScores(raw.player_scores, teamPlayers),
  };
}

function isSalmonFormat(format: string) {
  return format === SALMON_FORMAT;
}

function cleanCmoPayload(value: unknown, teamNames: string[]) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const teamPlayers = cleanStringMatrix(raw.team_players, teamNames.length);
  const playerOptions = Array.isArray(raw.player_options)
    ? raw.player_options.map((name) => String(name || "").trim()).filter(Boolean).slice(0, 200)
    : [];
  const scrambleScores = cleanScores(raw.scramble_scores, teamNames.length, 6);
  const pointScores = cleanSalmonScores(raw.point_scores, teamPlayers).map((team) => team.map((player) => player.slice(0, 6)));
  const chipInsRaw = Array.isArray(raw.chip_ins) ? raw.chip_ins : [];
  const chipIns = teamPlayers.map((players, teamIndex) => {
    const rawTeam = Array.isArray(chipInsRaw[teamIndex]) ? chipInsRaw[teamIndex] : [];
    return players.map((_player, playerIndex) => {
      const rawPlayer = Array.isArray(rawTeam[playerIndex]) ? rawTeam[playerIndex] : [];
      return Array.from({ length: 6 }, (_hole, holeIndex) => !!rawPlayer[holeIndex]);
    });
  });
  const h2hRaw = Array.isArray(raw.h2h_scores) ? raw.h2h_scores : [];
  const h2hMatchupsRaw = Array.isArray(raw.h2h_matchups) ? raw.h2h_matchups : [];
  const h2hScores = teamPlayers.map((players, teamIndex) => {
    const rawTeam = Array.isArray(h2hRaw[teamIndex]) ? h2hRaw[teamIndex] : [];
    return players.map((_player, playerIndex) => {
      const rawPlayer = Array.isArray(rawTeam[playerIndex]) ? rawTeam[playerIndex] : [];
      return Array.from({ length: 6 }, (_hole, holeIndex) => {
        const score = Number(rawPlayer[holeIndex]);
        return Number.isFinite(score) && score > 0 ? Math.round(score) : null;
      });
    });
  });

  return {
    kind: "cmo_point_sebago",
    player_options: Array.from(new Set([...playerOptions, ...teamPlayers.flat()])),
    team_player_counts: teamPlayers.map((players) => Math.max(1, Math.min(4, players.length || 1))),
    team_players: teamPlayers,
    scramble_scores: scrambleScores,
    point_scores: pointScores,
    chip_ins: chipIns,
    h2h_scores: h2hScores,
    h2h_matchups: Array.from({ length: 4 }, (_match, matchIndex) => {
      const rawMatch = h2hMatchupsRaw[matchIndex] && typeof h2hMatchupsRaw[matchIndex] === "object"
        ? h2hMatchupsRaw[matchIndex] as Record<string, unknown>
        : {};
      return {
        team1: String(rawMatch.team1 || teamPlayers[0]?.[matchIndex] || "").trim(),
        team2: String(rawMatch.team2 || teamPlayers[1]?.[matchIndex] || "").trim(),
      };
    }),
  };
}

function isCmoFormat(format: string) {
  return format === CMO_FORMAT;
}

function isCmoPayload(value: unknown) {
  return !!value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).kind === "cmo_point_sebago";
}

function visibleFormat(row: LiveTournamentRow) {
  return isCmoPayload(row.scores) ? CMO_FORMAT : row.format;
}

function normalizeRow(row: LiveTournamentRow) {
  const teamNames = cleanTeamNames(row.team_names, 2);
  const holesCount = VALID_HOLES.has(Number(row.holes_count)) ? Number(row.holes_count) : 9;
  const format = visibleFormat(row);
  const scores = isSalmonFormat(format)
    ? cleanSalmonPayload(row.scores, teamNames)
    : isCmoFormat(format)
    ? cleanCmoPayload(row.scores, teamNames)
    : cleanScores(row.scores, teamNames.length, holesCount);
  return {
    id: row.id,
    name: row.name,
    format,
    holes_count: holesCount,
    team_names: teamNames,
    scores,
    status: row.status || "live",
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireUser(req);
    if ("error" in authCheck) return authCheck.error;

    const { supabaseAdmin } = authCheck;
    const id = req.nextUrl.searchParams.get("id");
    let query = supabaseAdmin
      .from("live_4play_tournaments")
      .select("id,name,format,holes_count,team_names,scores,status,created_by,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);

    if (id) query = query.eq("id", id).limit(1);

    const { data, error } = await query;

    if (error) {
      const message = error.message || "Failed to load Live 4Play tournaments.";
      if (isMissingLiveTable(message)) {
        return NextResponse.json({ ok: true, storage: "local", tournaments: [] });
      }
      return jsonError(message, 400);
    }

    return NextResponse.json({
      ok: true,
      storage: "supabase",
      tournaments: ((data ?? []) as LiveTournamentRow[]).map(normalizeRow),
    });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Unexpected error.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireUser(req);
    if ("error" in authCheck) return authCheck.error;

    const { supabaseAdmin, user } = authCheck;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "create");

    if (action === "update") {
      const id = String(body?.id || "").trim();
      if (!id) return jsonError("Tournament id is required.", 400);

      const teamNames = cleanTeamNames(body?.team_names, 2);
      const holesCount = VALID_HOLES.has(Number(body?.holes_count)) ? Number(body.holes_count) : 9;
      const format = String(body?.format || "");
      const scores = isSalmonFormat(format)
        ? cleanSalmonPayload(body?.scores, teamNames)
        : isCmoFormat(format)
        ? cleanCmoPayload(body?.scores, teamNames)
        : cleanScores(body?.scores, teamNames.length, holesCount);
      const status = String(body?.status || "live") === "complete" ? "complete" : "live";

      const { data, error } = await supabaseAdmin
        .from("live_4play_tournaments")
        .update({
          team_names: teamNames,
          scores,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id,name,format,holes_count,team_names,scores,status,created_by,created_at,updated_at")
        .single();

      if (error) {
        const message = error.message || "Failed to update Live 4Play tournament.";
        if (isMissingLiveTable(message)) {
          return NextResponse.json({ ok: true, storage: "local", tournament: null });
        }
        return jsonError(message, 400);
      }

      return NextResponse.json({ ok: true, storage: "supabase", tournament: normalizeRow(data as LiveTournamentRow) });
    }

    const name = String(body?.name || "").trim() || "Live 4Play Match";
    const format = String(body?.format || "Points");
    const holesCount = Number(body?.holes_count);
    const teamNames = cleanTeamNames(body?.team_names, Number(body?.team_count) || 2);

    if (!VALID_FORMATS.has(format)) return jsonError("Invalid format.", 400);
    if (format === "Coon") return jsonError("Coon Style is not available until next release.", 400);
    if (!VALID_HOLES.has(holesCount)) return jsonError("Choose 9 or 18 holes.", 400);
    const scores = isSalmonFormat(format)
      ? cleanSalmonPayload(body?.scores, teamNames)
      : isCmoFormat(format)
      ? cleanCmoPayload(body?.scores, teamNames)
      : cleanScores([], teamNames.length, holesCount);

    const insertRow = {
      owner_user_id: user.id,
      created_by: authUserLabel(user),
      name,
      format,
      holes_count: holesCount,
      team_names: teamNames,
      scores,
      status: "live",
    };

    const { data, error } = await supabaseAdmin
      .from("live_4play_tournaments")
      .insert(insertRow)
      .select("id,name,format,holes_count,team_names,scores,status,created_by,created_at,updated_at")
      .single();

    if (error) {
      const message = error.message || "Failed to create Live 4Play tournament.";
      if (isMissingLiveTable(message)) {
        return NextResponse.json({ ok: true, storage: "local", tournament: { ...insertRow, id: "" } });
      }
      if (isCmoFormat(format)) {
        const fallbackRow = { ...insertRow, format: "Ryder Cup" };
        const { data: fallbackData, error: fallbackError } = await supabaseAdmin
          .from("live_4play_tournaments")
          .insert(fallbackRow)
          .select("id,name,format,holes_count,team_names,scores,status,created_by,created_at,updated_at")
          .single();

        if (!fallbackError) {
          return NextResponse.json({ ok: true, storage: "supabase", tournament: normalizeRow(fallbackData as LiveTournamentRow) });
        }
      }
      return jsonError(message, 400);
    }

    return NextResponse.json({ ok: true, storage: "supabase", tournament: normalizeRow(data as LiveTournamentRow) });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Unexpected error.", 500);
  }
}
