import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { applyOpenChampionship2026AmateurBonus } from "../../lib/openChampionship2026";
import { applyUsOpen2026AmateurBonus } from "../../lib/usOpen2026";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PENALTY_SCORE = 10;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

type TournamentRow = {
  id: string;
  name: string;
  round4_lock: string | null;
  final_lock?: string | null;
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

type GolferRow = {
  id: string;
  name: string;
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

function isMissingFinalLockColumn(message?: string | null) {
  return /final_lock|schema cache|column/i.test(message || "");
}

function parseLockTime(value?: string | null) {
  if (!value) return NaN;
  const normalized = /(?:z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  return new Date(normalized).getTime();
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

function isPastTournament(tournament: { final_lock?: string | null }) {
  if (!tournament.final_lock) return false;
  const lockTime = parseLockTime(tournament.final_lock);
  return Number.isFinite(lockTime) && lockTime <= Date.now();
}

function userLabel(displayName: string | null | undefined, userId: string) {
  return displayName?.trim() || `${userId.slice(0, 8)}...`;
}

async function getDefaultPoolId(supabaseAdmin: any) {
  const poolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";
  const { data, error } = await supabaseAdmin
    .from("pools")
    .select("id")
    .eq("name", poolName)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load default pool: ${error.message}`);
  }

  return data?.id ?? "";
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

    const isAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "");
    const poolId = membership?.pool_id || (isAdmin ? await getDefaultPoolId(supabaseAdmin) : "");
    if (!poolId) {
      return jsonError(
        requestedPoolId ? "You are not a member of this pool." : "You are not assigned to a pool yet.",
        requestedPoolId ? 403 : 400
      );
    }

    const tournamentsRes = await supabaseAdmin
      .from("tournaments")
      .select("id,name,round4_lock,final_lock,created_at")
      .eq("pool_id", poolId)
      .order("created_at", { ascending: false });

    const tournamentData = (tournamentsRes.data ?? []) as TournamentRow[];
    const tournamentError = tournamentsRes.error;
    if (tournamentsRes.error && isMissingFinalLockColumn(tournamentsRes.error.message)) {
      return jsonError("Final/Lock is not enabled yet. Run supabase/final_lock.sql in Supabase SQL Editor before Trophy Room winners can appear.", 400);
    }

    const [picksRes, scoresRes, namesRes, golfersRes] = await Promise.all([
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
      supabaseAdmin
        .from("golfers")
        .select("id,name")
        .eq("pool_id", poolId),
    ]);

    if (tournamentError) return jsonError(`Error loading tournaments: ${tournamentError.message}`, 400);
    if (picksRes.error) return jsonError(`Error loading picks: ${picksRes.error.message}`, 400);
    if (scoresRes.error) return jsonError(`Error loading scores: ${scoresRes.error.message}`, 400);
    if (namesRes.error) return jsonError(`Error loading names: ${namesRes.error.message}`, 400);
    if (golfersRes.error) return jsonError(`Error loading golfers: ${golfersRes.error.message}`, 400);

    const tournaments = tournamentData as TournamentRow[];
    const picks = (picksRes.data ?? []) as PickRow[];
    const scores = (scoresRes.data ?? []) as ScoreRow[];
    const names = (namesRes.data ?? []) as NameRow[];
    const golferNameById = new Map<string, string>();
    ((golfersRes.data ?? []) as GolferRow[]).forEach((golfer) => {
      golferNameById.set(golfer.id, golfer.name);
    });

    const displayNameByUserId = new Map<string, string | null>();
    names.forEach((row) => {
      displayNameByUserId.set(row.user_id, row.display_name ?? null);
    });

    const authDisplayNameByUserId = new Map<string, string>();
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) return jsonError(`Error loading winner names: ${error.message}`, 400);

      const authUsers = data?.users ?? [];
      authUsers.forEach((authUser: any) => {
        const displayName = String(authUser.user_metadata?.display_name || "").trim();
        if (displayName) authDisplayNameByUserId.set(authUser.id, displayName);
      });
      if (authUsers.length < 1000) break;
    }

    const scoreByTournamentGolferRound = new Map<string, number>();
    scores.forEach((score) => {
      const round = Number(score.round);
      const strokes = Number(score.strokes) || 0;
      scoreByTournamentGolferRound.set(`${score.tournament_id}:${score.golfer_id}:${round}`, strokes);
    });

    const winnerRows = tournaments
      .filter(isPastTournament)
      .map((tournament) => {
        const totalsByUserId = new Map<string, { total: number; scoredPicks: number }>();
        const tournamentPicks = picks.filter((pick) => pick.tournament_id === tournament.id);
        const picksByUserRound = new Map<string, PickRow[]>();

        tournamentPicks.forEach((pick) => {
          if (!totalsByUserId.has(pick.user_id)) {
            totalsByUserId.set(pick.user_id, { total: 0, scoredPicks: 0 });
          }

          const round = Number(pick.round);
          if (![1, 2, 3, 4].includes(round)) return;
          const key = `${pick.user_id}:${round}`;
          if (!picksByUserRound.has(key)) picksByUserRound.set(key, []);
          picksByUserRound.get(key)!.push(pick);
        });

        totalsByUserId.forEach((row, userId) => {
          ([1, 2, 3, 4] as const).forEach((round) => {
            const roundPicks = (picksByUserRound.get(`${userId}:${round}`) ?? []).slice(0, 4);

            for (let slot = 0; slot < 4; slot += 1) {
              const pick = roundPicks[slot];
              const pickedScore = pick
                ? scoreByTournamentGolferRound.get(`${pick.tournament_id}:${pick.golfer_id}:${round}`)
                : undefined;
              const golferName = pick ? golferNameById.get(pick.golfer_id) ?? "" : "";
              const score = typeof pickedScore === "number"
                ? applyOpenChampionship2026AmateurBonus(
                    tournament.name,
                    golferName,
                    applyUsOpen2026AmateurBonus(tournament.name, golferName, pickedScore)
                  )
                : PENALTY_SCORE;

              row.total += score;
              row.scoredPicks += 1;
            }
          });
        });

        const ranked = [...totalsByUserId.entries()]
          .map(([userId, row]) => ({
            user_id: userId,
            user_name: userLabel(
              authDisplayNameByUserId.get(userId) || displayNameByUserId.get(userId),
              userId
            ),
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
        let previousScore: number | null = null;
        let currentRank = 0;
        const standings = ranked.map((row, index) => {
          if (row.total_strokes !== previousScore) currentRank = index + 1;
          previousScore = row.total_strokes;
          return {
            ...row,
            rank: currentRank,
          };
        });

        return {
          tournament_id: tournament.id,
          tournament_name: tournament.name,
          completed_at: tournament.final_lock,
          winners,
          standings,
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
