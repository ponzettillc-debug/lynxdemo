import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAILS = ["ponzettillc@gmail.com"];
const PENALTY_SCORE = 10;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function emailPrefix(email: string) {
  const clean = String(email || "").trim();
  if (!clean) return "";
  return clean.includes("@") ? clean.split("@")[0] : clean;
}

function cleanLabel(label?: string | null) {
  const clean = String(label || "").trim();
  return clean ? emailPrefix(clean) : "";
}

async function getAuthUserLabels(supabaseAdmin: any) {
  const displayNames = new Map<string, string>();
  const emailFallbacks = new Map<string, string>();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw new Error(error.message || "Failed to load auth users.");

    const users = data?.users || [];
    users.forEach((user: any) => {
      const displayName = String(user.user_metadata?.display_name || "").trim();
      const email = String(user.email || "").trim();
      const fallback = emailPrefix(email);

      if (user.id && displayName) displayNames.set(user.id, displayName);
      if (user.id && fallback) emailFallbacks.set(user.id, fallback);
    });

    if (users.length < 1000) break;
  }

  return { displayNames, emailFallbacks };
}

function parseLockTime(value?: string | null) {
  if (!value) return NaN;
  const normalized = /(?:z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  return new Date(normalized).getTime();
}

function getLockedRound(tournament: {
  round1_lock?: string | null;
  round2_lock?: string | null;
  round3_lock?: string | null;
  round4_lock?: string | null;
}) {
  const now = Date.now();
  const locks: Array<{ round: 1 | 2 | 3 | 4; value?: string | null }> = [
    { round: 1, value: tournament.round1_lock },
    { round: 2, value: tournament.round2_lock },
    { round: 3, value: tournament.round3_lock },
    { round: 4, value: tournament.round4_lock },
  ];

  let latestLocked: 1 | 2 | 3 | 4 | null = null;

  for (const lock of locks) {
    if (!lock.value) continue;
    const t = parseLockTime(lock.value);
    if (Number.isFinite(t) && t <= now) {
      latestLocked = lock.round;
    }
  }

  return latestLocked;
}

function isFinalLocked(tournament: { final_lock?: string | null }) {
  if (!tournament.final_lock) return false;
  const t = parseLockTime(tournament.final_lock);
  return Number.isFinite(t) ? t <= Date.now() : true;
}

function shouldApplyPenalty(
  tournament: {
    round1_lock?: string | null;
    round2_lock?: string | null;
    round3_lock?: string | null;
    round4_lock?: string | null;
    final_lock?: string | null;
  } | null,
  round: 1 | 2 | 3 | 4,
  lockedRound: 1 | 2 | 3 | 4 | null
) {
  if (!tournament) return false;
  if (round < 4) return !!lockedRound && lockedRound >= ((round + 1) as 1 | 2 | 3 | 4);
  return isFinalLocked(tournament);
}

function addRoundScore(row: any, round: number, score: number) {
  if (round === 1) row.r1_strokes += score;
  if (round === 2) row.r2_strokes += score;
  if (round === 3) row.r3_strokes += score;
  if (round === 4) row.r4_strokes += score;
}

function addRoundPickData(
  target: Record<string, Array<{ name: string; score: number | null }>>,
  userId: string,
  name: string,
  score: number | null
) {
  if (!target[userId]) {
    target[userId] = [];
  }

  target[userId].push({ name, score });
}

function addUsedPick(
  accumulator: Map<
    string,
    {
      userId: string;
      golferId: string;
      name: string;
      roundsUsed: Set<number>;
      totalScore: number;
      roundScores: Partial<Record<1 | 2 | 3 | 4, number | null>>;
    }
  >,
  userId: string,
  golferId: string,
  name: string,
  round: 1 | 2 | 3 | 4,
  score: number | null
) {
  const key = `${userId}:${golferId}`;
  if (!accumulator.has(key)) {
    accumulator.set(key, {
      userId,
      golferId,
      name,
      roundsUsed: new Set<number>(),
      totalScore: 0,
      roundScores: {},
    });
  }

  const entry = accumulator.get(key)!;
  entry.roundsUsed.add(round);
  entry.roundScores[round] = score;
  if (typeof score === "number") {
    entry.totalScore += score;
  }
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

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireUser(req);
    if ("error" in authCheck) return authCheck.error;

    const { supabaseAdmin, user } = authCheck;

    const { searchParams } = new URL(req.url);
    const poolId = String(searchParams.get("pool_id") || "");
    const tournamentId = String(searchParams.get("tournament_id") || "");

    if (!poolId || !tournamentId) {
      return jsonError("pool_id and tournament_id are required.", 400);
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("pool_members")
      .select("pool_id")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return jsonError(`Failed to verify membership: ${membershipError.message}`, 400);
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "");

    if (!membership && !isAdmin) {
      return jsonError("You are not a member of this pool.", 403);
    }

    const [
      tournamentRes,
      golfersRes,
      picksRes,
      scoresRes,
      leaderboardNamesRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("tournaments")
        .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock,final_lock")
        .eq("id", tournamentId)
        .maybeSingle(),
      supabaseAdmin
        .from("golfers")
        .select("id,name")
        .eq("pool_id", poolId),
      supabaseAdmin
        .from("picks")
        .select("user_id,golfer_id,round")
        .eq("pool_id", poolId)
        .eq("tournament_id", tournamentId),
      supabaseAdmin
        .from("scores")
        .select("golfer_id,round,strokes")
        .eq("pool_id", poolId)
        .eq("tournament_id", tournamentId),
      supabaseAdmin
        .from("v_leaderboard")
        .select("user_id,display_name")
        .eq("pool_id", poolId)
        .eq("tournament_id", tournamentId),
    ]);

    if (tournamentRes.error) return jsonError(`Error loading tournament: ${tournamentRes.error.message}`, 400);
    if (golfersRes.error) return jsonError(`Error loading golfers: ${golfersRes.error.message}`, 400);
    if (picksRes.error) return jsonError(`Error loading picks: ${picksRes.error.message}`, 400);
    if (scoresRes.error) return jsonError(`Error loading scores: ${scoresRes.error.message}`, 400);
    if (leaderboardNamesRes.error) return jsonError(`Error loading names: ${leaderboardNamesRes.error.message}`, 400);

    const tournament = tournamentRes.data;
    const golfers = golfersRes.data ?? [];
    const picks = picksRes.data ?? [];
    const scores = scoresRes.data ?? [];
    const leaderboardNames = leaderboardNamesRes.data ?? [];
    const authUserLabels = await getAuthUserLabels(supabaseAdmin);

    const golferNameById = new Map<string, string>();
    golfers.forEach((g: any) => golferNameById.set(g.id, g.name));

    const displayNameByUserId = new Map<string, string | null>();
    leaderboardNames.forEach((r: any) => {
      displayNameByUserId.set(r.user_id, r.display_name ?? null);
    });

    const scoreByGolferRound = new Map<string, number>();
    scores.forEach((s: any) => {
      const round = Number(s.round) as 1 | 2 | 3 | 4;
      const strokes = Number(s.strokes) || 0;
      scoreByGolferRound.set(`${s.golfer_id}:${round}`, strokes);
    });

    const picksByUserRound = new Map<string, any[]>();
    const roundPickDataByUser: Record<
      string,
      Array<{ name: string; score: number | null }>
    > = {};
    const allUsedPicksByUser: Record<
      string,
      Array<{
        name: string;
        roundsUsed: number[];
        totalScore: number;
        roundScores: Partial<Record<1 | 2 | 3 | 4, number | null>>;
      }>
    > = {};

    const allUsedAccumulator = new Map<
      string,
      {
        userId: string;
        golferId: string;
        name: string;
        roundsUsed: Set<number>;
        totalScore: number;
        roundScores: Partial<Record<1 | 2 | 3 | 4, number | null>>;
      }
    >();

    const participantUserIds = new Set<string>();
    picks.forEach((p: any) => participantUserIds.add(p.user_id));

    const rowMap = new Map<string, any>();
    participantUserIds.forEach((userId) => {
      rowMap.set(userId, {
        user_id: userId,
        display_name:
          authUserLabels.displayNames.get(userId) ||
          cleanLabel(displayNameByUserId.get(userId)) ||
          authUserLabels.emailFallbacks.get(userId) ||
          null,
        r1_strokes: 0,
        r2_strokes: 0,
        r3_strokes: 0,
        r4_strokes: 0,
        total_strokes: 0,
        scored_picks: 0,
        r1_scored_count: 0,
        r2_scored_count: 0,
        r3_scored_count: 0,
        r4_scored_count: 0,
        r1_pick_count: 0,
        r2_pick_count: 0,
        r3_pick_count: 0,
        r4_pick_count: 0,
      });
    });

    const lockedRound = tournament ? getLockedRound(tournament) : null;

    picks.forEach((pick: any) => {
      const round = Number(pick.round);
      if (![1, 2, 3, 4].includes(round)) return;
      const key = `${pick.user_id}:${round}`;
      if (!picksByUserRound.has(key)) picksByUserRound.set(key, []);
      picksByUserRound.get(key)!.push(pick);

      const row = rowMap.get(pick.user_id);
      if (row) {
        if (round === 1) row.r1_pick_count += 1;
        if (round === 2) row.r2_pick_count += 1;
        if (round === 3) row.r3_pick_count += 1;
        if (round === 4) row.r4_pick_count += 1;
      }
    });

    if (lockedRound) {
      rowMap.forEach((row: any, userId: string) => {
        ([1, 2, 3, 4] as const).forEach((round) => {
          if (round > lockedRound) return;

          const roundPicks = (picksByUserRound.get(`${userId}:${round}`) ?? []).slice(0, 4);
          const applyPenalty = shouldApplyPenalty(tournament, round, lockedRound);

          for (let slot = 0; slot < 4; slot += 1) {
            const pick = roundPicks[slot];
            const pickedScore = pick
              ? scoreByGolferRound.get(`${pick.golfer_id}:${round}`)
              : undefined;
            const hasPickedScore = typeof pickedScore === "number";
            const shouldScorePenalty = !hasPickedScore && applyPenalty;
            const score = hasPickedScore ? pickedScore : shouldScorePenalty ? PENALTY_SCORE : null;

            const name = hasPickedScore
              ? golferNameById.get(pick.golfer_id) ?? "Unknown Golfer"
              : shouldScorePenalty
              ? "Penalty"
              : pick
              ? golferNameById.get(pick.golfer_id) ?? "Pending"
              : "Pending";
            const golferId = hasPickedScore
              ? String(pick.golfer_id)
              : shouldScorePenalty
              ? `penalty-r${round}-slot${slot + 1}`
              : pick
              ? String(pick.golfer_id)
              : `pending-r${round}-slot${slot + 1}`;

            if (typeof score === "number") {
              addRoundScore(row, round, score);
              row.scored_picks += 1;
              if (round === 1) row.r1_scored_count += 1;
              if (round === 2) row.r2_scored_count += 1;
              if (round === 3) row.r3_scored_count += 1;
              if (round === 4) row.r4_scored_count += 1;
            }

            if (round === lockedRound) {
              addRoundPickData(roundPickDataByUser, userId, name, score);
            }

            addUsedPick(
              allUsedAccumulator,
              userId,
              golferId,
              name,
              round,
              score
            );
          }
        });
      });
    }

    const rows = Array.from(rowMap.values())
      .map((row: any) => {
        return {
          ...row,
          total_strokes:
            row.r1_strokes + row.r2_strokes + row.r3_strokes + row.r4_strokes,
        };
      })
      .filter((row: any) => {
        const hasAnyScores =
          row.scored_picks > 0 ||
          row.total_strokes !== 0 ||
          row.r1_strokes !== 0 ||
          row.r2_strokes !== 0 ||
          row.r3_strokes !== 0 ||
          row.r4_strokes !== 0;
        const hasAnyPicks =
          row.r1_pick_count > 0 ||
          row.r2_pick_count > 0 ||
          row.r3_pick_count > 0 ||
          row.r4_pick_count > 0;
        return hasAnyScores || hasAnyPicks;
      })
      .sort((a: any, b: any) => {
        if (a.total_strokes !== b.total_strokes) {
          return a.total_strokes - b.total_strokes;
        }
        const aName = (a.display_name ?? a.user_id).toLowerCase();
        const bName = (b.display_name ?? b.user_id).toLowerCase();
        return aName.localeCompare(bName);
      });

    Object.keys(roundPickDataByUser).forEach((userId) => {
      roundPickDataByUser[userId] = [...roundPickDataByUser[userId]].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    });

    allUsedAccumulator.forEach((entry) => {
      if (!allUsedPicksByUser[entry.userId]) {
        allUsedPicksByUser[entry.userId] = [];
      }

      allUsedPicksByUser[entry.userId].push({
        name: entry.name,
        roundsUsed: [...entry.roundsUsed].sort((a, b) => a - b),
        totalScore: entry.totalScore,
        roundScores: entry.roundScores,
      });
    });

    Object.keys(allUsedPicksByUser).forEach((userId) => {
      allUsedPicksByUser[userId] = [...allUsedPicksByUser[userId]].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    });

    return NextResponse.json({
      ok: true,
      rows,
      lockedRound,
      lockedRoundPicks: roundPickDataByUser,
      allUsedPicks: allUsedPicksByUser,
    });
  } catch (err: any) {
    console.error("leaderboard GET route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}
