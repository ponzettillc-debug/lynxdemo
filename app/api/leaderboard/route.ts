import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
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
    const t = new Date(lock.value).getTime();
    if (Number.isFinite(t) && t <= now) {
      latestLocked = lock.round;
    }
  }

  return latestLocked;
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

    if (!membership) {
      return jsonError("You are not a member of this pool.", 403);
    }

    const [
      tournamentRes,
      poolMembersRes,
      golfersRes,
      picksRes,
      scoresRes,
      leaderboardNamesRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("tournaments")
        .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock")
        .eq("id", tournamentId)
        .maybeSingle(),
      supabaseAdmin
        .from("pool_members")
        .select("user_id")
        .eq("pool_id", poolId),
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
    if (poolMembersRes.error) return jsonError(`Error loading pool members: ${poolMembersRes.error.message}`, 400);
    if (golfersRes.error) return jsonError(`Error loading golfers: ${golfersRes.error.message}`, 400);
    if (picksRes.error) return jsonError(`Error loading picks: ${picksRes.error.message}`, 400);
    if (scoresRes.error) return jsonError(`Error loading scores: ${scoresRes.error.message}`, 400);
    if (leaderboardNamesRes.error) return jsonError(`Error loading names: ${leaderboardNamesRes.error.message}`, 400);

    const tournament = tournamentRes.data;
    const poolMembers = poolMembersRes.data ?? [];
    const golfers = golfersRes.data ?? [];
    const picks = picksRes.data ?? [];
    const scores = scoresRes.data ?? [];
    const leaderboardNames = leaderboardNamesRes.data ?? [];

    const golferNameById = new Map<string, string>();
    golfers.forEach((g: any) => golferNameById.set(g.id, g.name));

    const displayNameByUserId = new Map<string, string | null>();
    leaderboardNames.forEach((r: any) => {
      displayNameByUserId.set(r.user_id, r.display_name ?? null);
    });

    const scoreByGolferRound = new Map<string, number>();
    scores.forEach((s: any) => {
      scoreByGolferRound.set(`${s.golfer_id}:${s.round}`, Number(s.strokes) || 0);
    });

    const pickedGolfersByUser = new Map<string, Set<string>>();
    const roundPickDataByUser: Record<
      string,
      Array<{ name: string; score: number | null }>
    > = {};
    const allUsedPicksByUser: Record<
      string,
      Array<{ name: string; roundsUsed: number[]; totalScore: number }>
    > = {};

    const allUsedAccumulator = new Map<
      string,
      { userId: string; golferId: string; name: string; roundsUsed: Set<number>; totalScore: number }
    >();

    const allUserIds = new Set<string>();

    poolMembers.forEach((m: any) => allUserIds.add(m.user_id));
    picks.forEach((p: any) => allUserIds.add(p.user_id));
    leaderboardNames.forEach((r: any) => allUserIds.add(r.user_id));

    const rowMap = new Map<string, any>();
    allUserIds.forEach((userId) => {
      rowMap.set(userId, {
        user_id: userId,
        display_name: displayNameByUserId.get(userId) ?? null,
        r1_strokes: 0,
        r2_strokes: 0,
        r3_strokes: 0,
        r4_strokes: 0,
        total_strokes: 0,
        scored_picks: 0,
      });
      pickedGolfersByUser.set(userId, new Set<string>());
    });

    const lockedRound = tournament ? getLockedRound(tournament) : null;

    picks.forEach((pick: any) => {
      const row = rowMap.get(pick.user_id);
      if (!row) return;

      const score = scoreByGolferRound.get(`${pick.golfer_id}:${pick.round}`);
      if (typeof score === "number") {
        if (pick.round === 1) row.r1_strokes += score;
        if (pick.round === 2) row.r2_strokes += score;
        if (pick.round === 3) row.r3_strokes += score;
        if (pick.round === 4) row.r4_strokes += score;
      }

      pickedGolfersByUser.get(pick.user_id)?.add(pick.golfer_id);

      if (lockedRound && pick.round === lockedRound) {
        const golferName = golferNameById.get(pick.golfer_id);
        const lockedScore = scoreByGolferRound.has(`${pick.golfer_id}:${pick.round}`)
          ? scoreByGolferRound.get(`${pick.golfer_id}:${pick.round}`) ?? null
          : null;

        if (!roundPickDataByUser[pick.user_id]) {
          roundPickDataByUser[pick.user_id] = [];
        }

        if (golferName) {
          roundPickDataByUser[pick.user_id].push({
            name: golferName,
            score: lockedScore,
          });
        }
      }

      if (lockedRound && pick.round <= lockedRound) {
        const golferName = golferNameById.get(pick.golfer_id);
        if (!golferName) return;

        const key = `${pick.user_id}:${pick.golfer_id}`;
        if (!allUsedAccumulator.has(key)) {
          allUsedAccumulator.set(key, {
            userId: pick.user_id,
            golferId: pick.golfer_id,
            name: golferName,
            roundsUsed: new Set<number>(),
            totalScore: 0,
          });
        }

        const entry = allUsedAccumulator.get(key)!;
        entry.roundsUsed.add(Number(pick.round));

        const roundScore = scoreByGolferRound.get(`${pick.golfer_id}:${pick.round}`);
        if (typeof roundScore === "number") {
          entry.totalScore += roundScore;
        }
      }
    });

    const rows = Array.from(rowMap.values())
      .map((row: any) => {
        const pickedGolfers = pickedGolfersByUser.get(row.user_id) ?? new Set<string>();

        let scoredPicks = 0;
        pickedGolfers.forEach((golferId) => {
          const hasAnyScore =
            scoreByGolferRound.has(`${golferId}:1`) ||
            scoreByGolferRound.has(`${golferId}:2`) ||
            scoreByGolferRound.has(`${golferId}:3`) ||
            scoreByGolferRound.has(`${golferId}:4`);

          if (hasAnyScore) scoredPicks += 1;
        });

        return {
          ...row,
          scored_picks: scoredPicks,
          total_strokes:
            row.r1_strokes + row.r2_strokes + row.r3_strokes + row.r4_strokes,
        };
      })
      .filter((row: any) => {
        const hasAnyPicks = (pickedGolfersByUser.get(row.user_id)?.size ?? 0) > 0;
        const hasAnyScores =
          row.scored_picks > 0 ||
          row.total_strokes !== 0 ||
          row.r1_strokes !== 0 ||
          row.r2_strokes !== 0 ||
          row.r3_strokes !== 0 ||
          row.r4_strokes !== 0;
        return hasAnyPicks || hasAnyScores;
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