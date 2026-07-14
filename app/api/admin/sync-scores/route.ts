import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gunzipSync } from "zlib";

export const runtime = "nodejs";

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];
const PGA_TOUR_API_KEY = "da2-gsrx5bibzbb4njvhl7t37wqyl4";
const PGA_TOUR_GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PUBLIC_LEADERBOARDS = [
  {
    id: "R2026556",
    label: "Cadillac Championship",
    source: "PGA TOUR",
    sourceUrl: "https://www.pgatour.com/leaderboard",
    matches: [/cadillac/i],
  },
  {
    id: "R2026033",
    label: "PGA Championship",
    source: "PGA TOUR",
    sourceUrl: "https://www.pgatour.com/leaderboard",
    matches: [/pga\s*championship/i, /pga\s*-\s*championship/i],
  },
  {
    id: "R2026026",
    label: "2026 US Open",
    par: 70,
    source: "PGA TOUR",
    sourceUrl: "https://www.pgatour.com/leaderboard",
    matches: [/2026\s+u\.?s\.?\s+open/i, /\bu\.?s\.?\s+open\b/i],
  },
  {
    id: "R2026100",
    label: "2026 British Open",
    source: "PGA TOUR",
    sourceUrl: "https://www.pgatour.com/tournaments/2026/the-open-championship/R2026100",
    matches: [/2026\s+british\s+open/i, /open\s+championship/i],
  },
];

type PickRow = {
  golfer_id: string;
  round: number;
};

type GolferRow = {
  id: string;
  name: string;
};

type ScoreRow = {
  pool_id: string;
  tournament_id: string;
  golfer_id: string;
  round: number;
  strokes: number;
  updated_at?: string;
};

type PgaTourPlayer = {
  player?: {
    displayName?: string;
    firstName?: string;
    lastName?: string;
  };
  scoringData?: {
    total?: string;
    score?: string;
    currentRound?: number;
    rounds?: string[];
  };
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isMissingFinalLockColumn(message?: string | null) {
  return /final_lock|schema cache|column/i.test(message || "");
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatchKeys(name: string) {
  const normalized = normalizeName(name);
  const parts = normalized.split(" ").filter(Boolean);
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";
  const keys = new Set<string>([normalized]);

  if (first && last) {
    keys.add(`${first[0]} ${last}`);
    keys.add(`${first.slice(0, 3)} ${last}`);
  }

  return [...keys].filter(Boolean);
}

function buildSourceByName(players: PgaTourPlayer[]) {
  const sourceByName = new Map<string, PgaTourPlayer | null>();

  players.forEach((player) => {
    const displayName =
      player.player?.displayName ||
      `${player.player?.firstName ?? ""} ${player.player?.lastName ?? ""}`;

    nameMatchKeys(displayName).forEach((key) => {
      if (sourceByName.has(key) && sourceByName.get(key) !== player) {
        sourceByName.set(key, null);
      } else {
        sourceByName.set(key, player);
      }
    });
  });

  return sourceByName;
}

function findSourcePlayer(sourceByName: Map<string, PgaTourPlayer | null>, golferName: string) {
  for (const key of nameMatchKeys(golferName)) {
    const player = sourceByName.get(key);
    if (player) return player;
  }

  return null;
}

function parseRelativeScore(value?: string | null) {
  const clean = String(value ?? "").trim();
  if (!clean || clean === "-") return null;
  if (/^e$/i.test(clean)) return 0;
  const parsed = Number(clean.replace(/^\+/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStrokeCount(value?: string | null) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function inferRoundPar(players: PgaTourPlayer[]) {
  const candidates: number[] = [];

  players.forEach((player) => {
    const rounds = player.scoringData?.rounds ?? [];
    const numericRounds = rounds.map(parseStrokeCount).filter((v): v is number => v !== null);
    const total = parseRelativeScore(player.scoringData?.total);

    if (numericRounds.length === 0 || total === null) return;

    const par = (numericRounds.reduce((sum, value) => sum + value, 0) - total) / numericRounds.length;
    if (Number.isInteger(par) && par >= 60 && par <= 80) {
      candidates.push(par);
    }
  });

  return candidates[0] ?? 72;
}

function scoreForRound(player: PgaTourPlayer, round: number, par: number) {
  const roundStroke = parseStrokeCount(player.scoringData?.rounds?.[round - 1]);
  if (roundStroke !== null) {
    return roundStroke - par;
  }

  const currentRound = Number(player.scoringData?.currentRound);
  if (currentRound === round) {
    return parseRelativeScore(player.scoringData?.score);
  }

  return null;
}

function leaderboardConfigForTournament(name: string, explicitId?: string) {
  if (explicitId) {
    return {
      id: explicitId,
      label: name,
      source: "PGA TOUR",
      sourceUrl: "https://www.pgatour.com/leaderboard",
    };
  }

  return PUBLIC_LEADERBOARDS.find((config) =>
    config.matches.some((pattern) => pattern.test(name))
  ) ?? null;
}

function createSupabaseAdmin() {
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

async function requireAuthenticated(req: NextRequest) {
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

  if (error || !user?.email) {
    return { error: jsonError("Unauthorized.", 401) };
  }

  return { supabaseAdmin, user };
}

async function fetchPgaTourLeaderboard(leaderboardId: string) {
  const response = await fetch(PGA_TOUR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
      "x-api-key": PGA_TOUR_API_KEY,
      "x-pgat-platform": "web",
    },
    body: JSON.stringify({
      query: `
        query LeaderboardCompressedV3($leaderboardCompressedV3Id: ID!) {
          leaderboardCompressedV3(id: $leaderboardCompressedV3Id) {
            id
            payload
          }
        }
      `,
      variables: { leaderboardCompressedV3Id: leaderboardId },
    }),
  });

  if (!response.ok) {
    throw new Error(`PGA TOUR leaderboard request failed (${response.status}).`);
  }

  const json = await response.json();
  const payload = json?.data?.leaderboardCompressedV3?.payload;
  if (!payload) {
    throw new Error("PGA TOUR leaderboard payload was empty.");
  }

  return JSON.parse(gunzipSync(Buffer.from(payload, "base64")).toString("utf8"));
}

async function loadTournamentForSync(
  supabaseAdmin: any,
  tournamentId: string,
  poolId?: string
) {
  let query = supabaseAdmin
    .from("tournaments")
    .select("id,name,pool_id,final_lock")
    .eq("id", tournamentId);

  if (poolId) query = query.eq("pool_id", poolId);

  let tournamentResult = await query.maybeSingle();
  let tournament = tournamentResult.data;
  let tournamentError = tournamentResult.error;

  if (tournamentError && isMissingFinalLockColumn(tournamentError.message)) {
    let fallback = supabaseAdmin
      .from("tournaments")
      .select("id,name,pool_id")
      .eq("id", tournamentId);

    if (poolId) fallback = fallback.eq("pool_id", poolId);

    tournamentResult = await fallback.maybeSingle();
    tournament = tournamentResult.data;
    tournamentError = tournamentResult.error;
  }

  if (tournamentError) {
    throw new Error(`Failed to load tournament: ${tournamentError.message}`);
  }

  return tournament;
}

async function syncTournamentScores({
  supabaseAdmin,
  poolId,
  tournamentId,
  explicitLeaderboardId = "",
  allowFinalLocked = false,
}: {
  supabaseAdmin: any;
  poolId: string;
  tournamentId: string;
  explicitLeaderboardId?: string;
  allowFinalLocked?: boolean;
}) {
  if (!poolId || !tournamentId) {
    throw new Error("pool_id and tournament_id are required.");
  }

  const tournament = await loadTournamentForSync(supabaseAdmin, tournamentId, poolId);
  if (!tournament) throw new Error("Tournament was not found.");

  if (tournament.final_lock && !allowFinalLocked) {
    const error = new Error("Tournament is Final/Locked. Uncheck Final/Lock before syncing scores.");
    (error as any).status = 423;
    throw error;
  }

  if (tournament.final_lock && allowFinalLocked) {
    return {
      ok: true,
      skipped: true,
      reason: "Tournament is Final/Locked.",
      tournament: tournament.name,
      written_count: 0,
      matched: [],
      unavailable: [],
    };
  }

  const leaderboardConfig = leaderboardConfigForTournament(tournament.name, explicitLeaderboardId);
  if (!leaderboardConfig) {
    throw new Error("No public leaderboard id is configured for this tournament yet.");
  }
  const leaderboardId = leaderboardConfig.id;

  const [{ data: picks, error: picksError }, { data: golfers, error: golfersError }] = await Promise.all([
    supabaseAdmin
      .from("picks")
      .select("golfer_id,round")
      .eq("pool_id", poolId)
      .eq("tournament_id", tournamentId),
    supabaseAdmin.from("golfers").select("id,name").eq("pool_id", poolId),
  ]);

  if (picksError) throw new Error(`Failed to load picks: ${picksError.message}`);
  if (golfersError) throw new Error(`Failed to load golfers: ${golfersError.message}`);

  const pickedRows = (picks ?? []) as PickRow[];
  const golferRows = (golfers ?? []) as GolferRow[];
  const pickedKeys = new Set(
    pickedRows
      .filter((pick) => [1, 2, 3, 4].includes(Number(pick.round)))
      .map((pick) => `${pick.golfer_id}:${pick.round}`)
  );

  if (pickedKeys.size === 0) {
    throw new Error("No picks were found for this tournament.");
  }

  const golferById = new Map(golferRows.map((golfer) => [golfer.id, golfer]));
  const leaderboard = await fetchPgaTourLeaderboard(leaderboardId);
  const leaderboardPlayers = ((leaderboard.players ?? []) as PgaTourPlayer[]).filter((player) => player.player);
  const configuredPar = "par" in leaderboardConfig ? leaderboardConfig.par : undefined;
  const par = configuredPar ?? inferRoundPar(leaderboardPlayers);
  const sourceByName = buildSourceByName(leaderboardPlayers);

  const rows: ScoreRow[] = [];
  const matched: Array<{ golfer: string; round: number; score: number }> = [];
  const unavailable: Array<{ golfer: string; round: number; reason: string }> = [];
  const syncedAt = new Date().toISOString();

  pickedKeys.forEach((key) => {
    const [golferId, roundText] = key.split(":");
    const round = Number(roundText);
    const golfer = golferById.get(golferId);
    if (!golfer) return;

    const sourcePlayer = findSourcePlayer(sourceByName, golfer.name);
    if (!sourcePlayer) {
      unavailable.push({ golfer: golfer.name, round, reason: "not matched on public leaderboard" });
      return;
    }

    const score = scoreForRound(sourcePlayer, round, par);
    if (score === null) {
      unavailable.push({ golfer: golfer.name, round, reason: "round score not available yet" });
      return;
    }

    rows.push({
      pool_id: poolId,
      tournament_id: tournamentId,
      golfer_id: golferId,
      round,
      strokes: score,
      updated_at: syncedAt,
    });
    matched.push({ golfer: golfer.name, round, score });
  });

  for (const row of rows) {
    const { error: deleteError } = await supabaseAdmin
      .from("scores")
      .delete()
      .eq("pool_id", row.pool_id)
      .eq("tournament_id", row.tournament_id)
      .eq("golfer_id", row.golfer_id)
      .eq("round", row.round);

    if (deleteError) {
      throw new Error(`Failed to replace existing score for ${row.golfer_id} R${row.round}: ${deleteError.message}`);
    }
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("scores").insert(rows);
    if (insertError) throw new Error(`Failed to save synced scores: ${insertError.message}`);
  }

  return {
    ok: true,
    source: leaderboardConfig.source,
    source_label: leaderboardConfig.label,
    source_url: leaderboardConfig.sourceUrl,
    leaderboard_id: leaderboardId,
    tournament: tournament.name,
    leaderboard_round: leaderboard.leaderboardRoundHeader ?? null,
    par,
    synced_at: syncedAt,
    written_count: rows.length,
    matched,
    unavailable,
  };
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAuthenticated(req);
    if ("error" in authCheck) return authCheck.error;
    const { supabaseAdmin, user } = authCheck;

    const body = await req.json().catch(() => ({}));
    const poolId = String(body?.pool_id || "");
    const tournamentId = String(body?.tournament_id || "");
    const explicitLeaderboardId = String(body?.leaderboard_id || "");

    if (!poolId || !tournamentId) {
      return jsonError("pool_id and tournament_id are required.", 400);
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "");
    if (!isAdmin) {
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from("pool_members")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) {
        return jsonError(`Failed to verify pool membership: ${membershipError.message}`, 400);
      }

      if (!membership) {
        return jsonError("You are not a member of this pool.", 403);
      }
    }

    const result = await syncTournamentScores({
      supabaseAdmin,
      poolId,
      tournamentId,
      explicitLeaderboardId,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("sync-scores route error:", err);
    return jsonError(err?.message || "Unexpected score sync error.", err?.status || 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return jsonError("Unauthorized cron request.", 401);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const poolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";

    const { data: pool, error: poolError } = await supabaseAdmin
      .from("pools")
      .select("id,name")
      .eq("name", poolName)
      .maybeSingle();

    if (poolError) return jsonError(`Failed to load pool: ${poolError.message}`, 400);
    if (!pool) return jsonError(`Pool "${poolName}" was not found.`, 404);

    const { data: tournaments, error: tournamentError } = await supabaseAdmin
      .from("tournaments")
      .select("id,name")
      .eq("pool_id", pool.id)
      .ilike("name", "%PGA%Championship%2026%");

    if (tournamentError) {
      return jsonError(`Failed to load PGA tournament: ${tournamentError.message}`, 400);
    }

    const tournament = (tournaments ?? [])[0];
    if (!tournament) {
      return jsonError("PGA Championship - 2026 was not found.", 404);
    }

    const result = await syncTournamentScores({
      supabaseAdmin,
      poolId: pool.id,
      tournamentId: tournament.id,
      allowFinalLocked: true,
    });

    return NextResponse.json({
      ...result,
      cron: true,
    });
  } catch (err: any) {
    console.error("sync-scores cron route error:", err);
    return jsonError(err?.message || "Unexpected score sync cron error.", err?.status || 500);
  }
}
