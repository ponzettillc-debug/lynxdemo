import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PENALTY_SCORE = 10;

type TournamentRow = {
  id: string;
  name: string;
  final_lock: string | null;
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

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function parseLockTime(value?: string | null) {
  if (!value) return NaN;
  const normalized = /(?:z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  return new Date(normalized).getTime();
}

function fmtScore(score: number) {
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
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

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireUser(req);
    if ("error" in authCheck) return authCheck.error;
    const { supabaseAdmin, user } = authCheck;

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("pool_members")
      .select("pool_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) return jsonError(`Failed to verify membership: ${membershipError.message}`, 400);
    if (!membership?.pool_id) return jsonError("You are not assigned to a pool yet.", 400);

    const poolId = membership.pool_id;

    const [tournamentsRes, picksRes, scoresRes] = await Promise.all([
      supabaseAdmin
        .from("tournaments")
        .select("id,name,final_lock")
        .eq("pool_id", poolId)
        .not("final_lock", "is", null)
        .order("final_lock", { ascending: false }),
      supabaseAdmin
        .from("picks")
        .select("user_id,golfer_id,round,tournament_id")
        .eq("pool_id", poolId),
      supabaseAdmin
        .from("scores")
        .select("golfer_id,round,strokes,tournament_id")
        .eq("pool_id", poolId),
    ]);

    if (tournamentsRes.error) return jsonError(`Error loading tournaments: ${tournamentsRes.error.message}`, 400);
    if (picksRes.error) return jsonError(`Error loading picks: ${picksRes.error.message}`, 400);
    if (scoresRes.error) return jsonError(`Error loading scores: ${scoresRes.error.message}`, 400);

    const tournaments = ((tournamentsRes.data ?? []) as TournamentRow[]).filter((t) => {
      const finalTime = parseLockTime(t.final_lock);
      return Number.isFinite(finalTime) && finalTime <= Date.now();
    });
    const picks = (picksRes.data ?? []) as PickRow[];
    const scores = (scoresRes.data ?? []) as ScoreRow[];

    const scoreByTournamentGolferRound = new Map<string, number>();
    scores.forEach((score) => {
      const round = Number(score.round);
      if (![1, 2, 3, 4].includes(round)) return;
      scoreByTournamentGolferRound.set(
        `${score.tournament_id}:${score.golfer_id}:${round}`,
        Number(score.strokes) || 0
      );
    });

    const results = tournaments
      .map((tournament) => {
        const tournamentPicks = picks.filter((pick) => pick.tournament_id === tournament.id);
        const picksByUserRound = new Map<string, PickRow[]>();
        const totalsByUser = new Map<string, { total: number; scoredPicks: number }>();

        tournamentPicks.forEach((pick) => {
          if (!totalsByUser.has(pick.user_id)) {
            totalsByUser.set(pick.user_id, { total: 0, scoredPicks: 0 });
          }
          const round = Number(pick.round);
          if (![1, 2, 3, 4].includes(round)) return;
          const key = `${pick.user_id}:${round}`;
          if (!picksByUserRound.has(key)) picksByUserRound.set(key, []);
          picksByUserRound.get(key)!.push(pick);
        });

        totalsByUser.forEach((row, userId) => {
          ([1, 2, 3, 4] as const).forEach((round) => {
            const roundPicks = (picksByUserRound.get(`${userId}:${round}`) ?? []).slice(0, 4);
            for (let slot = 0; slot < 4; slot += 1) {
              const pick = roundPicks[slot];
              const score = pick
                ? scoreByTournamentGolferRound.get(`${pick.tournament_id}:${pick.golfer_id}:${round}`)
                : undefined;
              row.total += typeof score === "number" ? score : PENALTY_SCORE;
              row.scoredPicks += 1;
            }
          });
        });

        const ranked = [...totalsByUser.entries()]
          .map(([userId, row]) => ({ userId, total: row.total, scoredPicks: row.scoredPicks }))
          .filter((row) => row.scoredPicks > 0)
          .sort((a, b) => a.total - b.total || a.userId.localeCompare(b.userId));

        let rank = 0;
        let previousScore: number | null = null;
        const rankedWithPlacement = ranked.map((row, idx) => {
          if (previousScore === null || row.total > previousScore) rank = idx + 1;
          previousScore = row.total;
          return { ...row, rank };
        });

        const userRow = rankedWithPlacement.find((row) => row.userId === user.id);
        if (!userRow) return null;

        return {
          tournament_id: tournament.id,
          tournament_name: tournament.name,
          completed_at: tournament.final_lock,
          total_strokes: userRow.total,
          score_label: fmtScore(userRow.total),
          rank: userRow.rank,
          rank_label: ordinal(userRow.rank),
          field_size: rankedWithPlacement.length,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, pool_id: poolId, results });
  } catch (err: any) {
    console.error("account results GET route error:", err);
    return jsonError(err?.message || "Unexpected account results error.", 500);
  }
}
