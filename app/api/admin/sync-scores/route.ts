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
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function leaderboardIdForTournament(name: string, explicitId?: string) {
  if (explicitId) return explicitId;
  if (/cadillac/i.test(name)) return "R2026556";
  return "";
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

  if (error || !user?.email) {
    return { error: jsonError("Unauthorized.", 401) };
  }

  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return { error: jsonError("Admin access required.", 403) };
  }

  return { supabaseAdmin };
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

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;
    const { supabaseAdmin } = adminCheck;

    const body = await req.json().catch(() => ({}));
    const poolId = String(body?.pool_id || "");
    const tournamentId = String(body?.tournament_id || "");
    const explicitLeaderboardId = String(body?.leaderboard_id || "");

    if (!poolId || !tournamentId) {
      return jsonError("pool_id and tournament_id are required.", 400);
    }

    let tournament: any = null;
    let tournamentError: any = null;
    const tournamentResult = await supabaseAdmin
      .from("tournaments")
      .select("id,name,final_lock")
      .eq("id", tournamentId)
      .maybeSingle();
    tournament = tournamentResult.data;
    tournamentError = tournamentResult.error;

    if (tournamentError && isMissingFinalLockColumn(tournamentError.message)) {
      const fallback = await supabaseAdmin
        .from("tournaments")
        .select("id,name")
        .eq("id", tournamentId)
        .maybeSingle();
      tournament = fallback.data;
      tournamentError = fallback.error;
    }
    if (tournamentError) return jsonError(`Failed to load tournament: ${tournamentError.message}`, 400);
    if (!tournament) return jsonError("Tournament was not found.", 404);
    if (tournament.final_lock) {
      return jsonError("Tournament is Final/Locked. Uncheck Final/Lock before syncing scores.", 423);
    }

    const leaderboardId = leaderboardIdForTournament(tournament.name, explicitLeaderboardId);
    if (!leaderboardId) {
      return jsonError("No public leaderboard id is configured for this tournament yet.", 400);
    }

    const [{ data: picks, error: picksError }, { data: golfers, error: golfersError }] = await Promise.all([
      supabaseAdmin
        .from("picks")
        .select("golfer_id,round")
        .eq("pool_id", poolId)
        .eq("tournament_id", tournamentId),
      supabaseAdmin.from("golfers").select("id,name").eq("pool_id", poolId),
    ]);

    if (picksError) return jsonError(`Failed to load picks: ${picksError.message}`, 400);
    if (golfersError) return jsonError(`Failed to load golfers: ${golfersError.message}`, 400);

    const pickedRows = (picks ?? []) as PickRow[];
    const golferRows = (golfers ?? []) as GolferRow[];
    const pickedKeys = new Set(
      pickedRows
        .filter((pick) => [1, 2, 3, 4].includes(Number(pick.round)))
        .map((pick) => `${pick.golfer_id}:${pick.round}`)
    );

    if (pickedKeys.size === 0) {
      return jsonError("No picks were found for this tournament.", 400);
    }

    const golferById = new Map(golferRows.map((golfer) => [golfer.id, golfer]));
    const leaderboard = await fetchPgaTourLeaderboard(leaderboardId);
    const leaderboardPlayers = ((leaderboard.players ?? []) as PgaTourPlayer[]).filter((player) => player.player);
    const par = inferRoundPar(leaderboardPlayers);
    const sourceByName = new Map(
      leaderboardPlayers.map((player) => [
        normalizeName(player.player?.displayName || `${player.player?.firstName ?? ""} ${player.player?.lastName ?? ""}`),
        player,
      ])
    );

    const rows: ScoreRow[] = [];
    const matched: Array<{ golfer: string; round: number; score: number }> = [];
    const unavailable: Array<{ golfer: string; round: number; reason: string }> = [];

    pickedKeys.forEach((key) => {
      const [golferId, roundText] = key.split(":");
      const round = Number(roundText);
      const golfer = golferById.get(golferId);
      if (!golfer) return;

      const sourcePlayer = sourceByName.get(normalizeName(golfer.name));
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
        return jsonError(`Failed to replace existing score for ${row.golfer_id} R${row.round}: ${deleteError.message}`, 400);
      }
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabaseAdmin.from("scores").insert(rows);
      if (insertError) return jsonError(`Failed to save synced scores: ${insertError.message}`, 400);
    }

    return NextResponse.json({
      ok: true,
      source: "pgatour",
      leaderboard_id: leaderboardId,
      tournament: tournament.name,
      leaderboard_round: leaderboard.leaderboardRoundHeader ?? null,
      par,
      written_count: rows.length,
      matched,
      unavailable,
    });
  } catch (err: any) {
    console.error("sync-scores route error:", err);
    return jsonError(err?.message || "Unexpected score sync error.", 500);
  }
}
