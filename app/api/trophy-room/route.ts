import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type TournamentRow = {
  id: string;
  name: string;
  round4_lock: string | null;
  created_at?: string | null;
};

type PickRow = {
  user_id: string;
  golfer_id: string;
  round: number;
  tournament_id: string;
};

type ScoreRow = {
  golfer_id: string;
  round: number;
  strokes: number;
  tournament_id: string;
};

type NameRow = {
  user_id: string;
  display_name: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

async function requireUser(req: NextRequest) {
  if (!supabaseUrl) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_URL.", 500) };
  if (!supabaseAnonKey) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.", 500) };
  if (!supabaseServiceRoleKey) return { error: jsonError("Missing SUPABASE_SERVICE_ROLE_KEY.", 500) };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { error: jsonError("Missing auth token.", 401) };
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user) {
    return { error: jsonError("Unauthorized.", 401) };
  }

  return { supabaseAdmin, user };
}

function isPastTournament(tournament: { round4_lock?: string | null }) {
  if (!tournament.round4_lock) return false;
  const lockTime = new Date(tournament.round4_lock).getTime();
  return Number.isFinite(lockTime) && lockTime <= Date.now();
}

function userLabel(displayName: string | null | undefined, userId: string) {
  return displayName?.trim() || `${userId.slice(0, 8)}...`;
}

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireUser(req);
    if ("error" in authCheck) return authCheck.error;

    const { supabaseAdmin, user } = authCheck;

    const { searchParams } = new URL(req.url);
    const requestedPoolId = String(searchParams.get("pool_id") || "");

    const membershipQuery = supabaseAdmin
      .from("pool_members")
      .select("pool_id")
      .eq("user_id", user.id);

    if (requestedPoolId) {
      membershipQuery.eq("pool_id", requestedPoolId);
    }

    const { data: membership, error: membershipError } = await membershipQuery
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      return jsonError(`Failed to verify membership: ${membershipError.message}`, 400);
    }

    const poolId = membership?.pool_id;
    if (!poolId) {
      return jsonError(
        requestedPoolId ? "You are not a member of this pool." : "You are not assigned to a pool yet.",
        requestedPoolId ? 403 : 400
      );
    }

    const [tournamentsRes, picksRes, scoresRes, namesRes] = await Promise.all([
      supabaseAdmin
        .from("tournaments")
        .select("id,name,round4_lock,created_at")
        .eq("pool_id", poolId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("picks")
        .select("user_id,golfer_id,round,tournament_id")
        .eq("pool_id", poolId),
      supabaseAdmin
        .from("scores")
        .select("golfer_id,round,strokes,tournament_id")
        .eq("pool_id", poolId),
      supabaseAdmin
        .from("v_leaderboard")
        .select("user_id,display_name")
        .eq("pool_id", poolId),
    ]);

    if (tournamentsRes.error) return jsonError(`Error loading tournaments: ${tournamentsRes.error.message}`, 400);
    if (picksRes.error) return jsonError(`Error loading picks: ${picksRes.error.message}`, 400);
    if (scoresRes.error) return jsonError(`Error loading scores: ${scoresRes.error.message}`, 400);
    if (namesRes.error) return jsonError(`Error loading names: ${namesRes.error.message}`, 400);

    const tournaments = (tournamentsRes.data ?? []) as TournamentRow[];
    const picks = (picksRes.data ?? []) as PickRow[];
    const scores = (scoresRes.data ?? []) as ScoreRow[];
    const names = (namesRes.data ?? []) as NameRow[];

    const displayNameByUserId = new Map<string, string | null>();
    names.forEach((row) => {
      displayNameByUserId.set(row.user_id, row.display_name ?? null);
    });

    const scoreByTournamentGolferRound = new Map<string, number>();
    scores.forEach((score) => {
      scoreByTournamentGolferRound.set(
        `${score.tournament_id}:${score.golfer_id}:${score.round}`,
        Number(score.strokes) || 0
      );
    });

    const winnerRows = tournaments
      .filter(isPastTournament)
      .map((tournament) => {
        const totalsByUserId = new Map<string, { total: number; scoredPicks: number }>();
        const tournamentPicks = picks.filter((pick) => pick.tournament_id === tournament.id);

        tournamentPicks.forEach((pick) => {
          if (!totalsByUserId.has(pick.user_id)) {
            totalsByUserId.set(pick.user_id, { total: 0, scoredPicks: 0 });
          }

          const row = totalsByUserId.get(pick.user_id)!;
          const scoreKey = `${pick.tournament_id}:${pick.golfer_id}:${pick.round}`;

          if (scoreByTournamentGolferRound.has(scoreKey)) {
            row.total += scoreByTournamentGolferRound.get(scoreKey) ?? 0;
            row.scoredPicks += 1;
          }
        });

        const ranked = [...totalsByUserId.entries()]
          .map(([userId, row]) => ({
            user_id: userId,
            user_name: userLabel(displayNameByUserId.get(userId), userId),
            total_strokes: row.total,
            scored_picks: row.scoredPicks,
          }))
          .filter((row) => row.scored_picks > 0)
          .sort((a, b) => {
            if (a.total_strokes !== b.total_strokes) return a.total_strokes - b.total_strokes;
            return a.user_name.localeCompare(b.user_name);
          });

        const winningScore = ranked[0]?.total_strokes;
        const winners =
          typeof winningScore === "number"
            ? ranked.filter((row) => row.total_strokes === winningScore)
            : [];

        return {
          tournament_id: tournament.id,
          tournament_name: tournament.name,
          completed_at: tournament.round4_lock,
          winners,
        };
      })
      .filter((row) => row.winners.length > 0);

    return NextResponse.json({
      ok: true,
      pool_id: poolId,
      winners: winnerRows,
    });
  } catch (err: unknown) {
    console.error("trophy-room GET route error:", err);
    return jsonError(errorMessage(err, "Unexpected error."), 500);
  }
}
