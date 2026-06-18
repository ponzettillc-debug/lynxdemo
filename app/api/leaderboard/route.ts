import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gunzipSync } from "zlib";
import { applyUsOpen2026AmateurBonus, isUsOpen2026Amateur } from "../../lib/usOpen2026";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAILS = ["ponzettillc@gmail.com"];
const PENALTY_SCORE = 10;
const PGA_TOUR_API_KEY = "da2-gsrx5bibzbb4njvhl7t37wqyl4";
const PGA_TOUR_GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";

type PublicPlayer = {
  player?: {
    displayName?: string;
    firstName?: string;
    lastName?: string;
  };
  scoringData?: {
    currentRound?: number;
    playerState?: string;
    roundStatus?: string;
    rounds?: string[];
    score?: string;
    total?: string;
    thru?: string;
  };
};

type PublicRoundStatus = {
  thruLabel?: string | null;
  currentScore?: string | null;
  teeTimeLabel?: string | null;
  hasTeedOff?: boolean;
};

const PUBLIC_LEADERBOARDS = [
  {
    id: "R2026556",
    matches: [/cadillac/i],
  },
  {
    id: "R2026033",
    matches: [/pga\s*championship/i, /pga\s*-\s*championship/i],
  },
  {
    id: "R2026026",
    matches: [/2026\s+u\.?s\.?\s+open/i, /\bu\.?s\.?\s+open\b/i],
  },
];

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

function publicLeaderboardIdForTournament(name?: string | null) {
  const tournamentName = String(name || "");
  return PUBLIC_LEADERBOARDS.find((config) =>
    config.matches.some((pattern) => pattern.test(tournamentName))
  )?.id ?? "";
}

function buildPublicPlayerByName(players: PublicPlayer[]) {
  const sourceByName = new Map<string, PublicPlayer | null>();

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

function findPublicPlayer(sourceByName: Map<string, PublicPlayer | null>, golferName: string) {
  for (const key of nameMatchKeys(golferName)) {
    const player = sourceByName.get(key);
    if (player) return player;
  }

  return null;
}

function publicRoundProgress(player: PublicPlayer, round: 1 | 2 | 3 | 4) {
  const scoring = player.scoringData;
  if (!scoring) return null;

  const currentRound = Number(scoring.currentRound);
  const state = String(scoring.playerState || scoring.roundStatus || "").toUpperCase();
  const roundScore = String(scoring.rounds?.[round - 1] ?? "").trim();

  if (roundScore && roundScore !== "-" && (round < currentRound || state === "COMPLETE" || state === "FINISHED")) {
    return "F";
  }

  if (currentRound !== round) return null;
  if (state === "COMPLETE" || state === "FINISHED") return "F";

  const thru = String(scoring.thru || "").trim();
  if (!thru) return state === "NOT_STARTED" ? "0" : null;
  if (/^f$/i.test(thru)) return "F";

  const holes = Number(thru.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(holes)) return null;
  if (holes >= 18) return "F";
  return String(holes);
}

function findDeepValue(
  object: unknown,
  patterns: RegExp[],
  seen = new Set<object>()
): unknown | null {
  if (!object || typeof object !== "object" || seen.has(object)) return null;
  seen.add(object);

  for (const [key, value] of Object.entries(object as Record<string, unknown>)) {
    if (
      patterns.some((pattern) => pattern.test(key)) &&
      value != null &&
      String(value).trim()
    ) {
      return value;
    }
  }

  for (const value of Object.values(object as Record<string, unknown>)) {
    const found = findDeepValue(value, patterns, seen);
    if (found != null) return found;
  }

  return null;
}

function formatEasternTeeTime(value: unknown) {
  if (value == null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const numeric = Number(raw);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 9999999999 ? numeric : numeric * 1000)
    : new Date(raw);

  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function publicRoundStatus(player: PublicPlayer, round: 1 | 2 | 3 | 4): PublicRoundStatus {
  const scoring = player.scoringData;
  if (!scoring) return {};

  const progress = publicRoundProgress(player, round);
  const currentRound = Number(scoring.currentRound);
  const state = String(scoring.playerState || scoring.roundStatus || "").toUpperCase();
  const currentScore = String(scoring.score || scoring.total || "").trim();
  const hasLiveScore = !!currentScore && currentScore !== "-";
  const hasTeedOff =
    currentRound === round &&
    (hasLiveScore || (!!progress && progress !== "0" && state !== "NOT_STARTED"));
  const rawTeeTime = findDeepValue(player, [/tee.*time/i, /start.*time/i]);

  return {
    thruLabel: progress,
    currentScore: hasLiveScore ? currentScore : null,
    teeTimeLabel: hasTeedOff ? null : formatEasternTeeTime(rawTeeTime),
    hasTeedOff,
  };
}

async function fetchPublicLeaderboard(leaderboardId: string) {
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
    throw new Error(`Public leaderboard request failed (${response.status}).`);
  }

  const json = await response.json();
  const payload = json?.data?.leaderboardCompressedV3?.payload;
  if (!payload) return null;

  return JSON.parse(gunzipSync(Buffer.from(payload, "base64")).toString("utf8"));
}

async function getPublicRoundProgressByGolferRound(tournament: any, golfers: any[]) {
  const leaderboardId = publicLeaderboardIdForTournament(tournament?.name);
  const progressByGolferRound = new Map<string, PublicRoundStatus>();
  if (!leaderboardId) return progressByGolferRound;

  try {
    const leaderboard = await fetchPublicLeaderboard(leaderboardId);
    const publicPlayers = ((leaderboard?.players ?? []) as PublicPlayer[]).filter(
      (player) => player.player
    );
    const sourceByName = buildPublicPlayerByName(publicPlayers);

    golfers.forEach((golfer: any) => {
      const publicPlayer = findPublicPlayer(sourceByName, golfer.name);
      if (!publicPlayer) return;

      ([1, 2, 3, 4] as const).forEach((round) => {
        const status = publicRoundStatus(publicPlayer, round);
        if (status.thruLabel || status.currentScore || status.teeTimeLabel) {
          progressByGolferRound.set(`${golfer.id}:${round}`, status);
        }
      });
    });
  } catch (err) {
    console.warn("Public leaderboard progress unavailable:", err);
  }

  return progressByGolferRound;
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

function shouldApplyMissingGolferPenalty(
  tournament: {
    round1_lock?: string | null;
    round2_lock?: string | null;
    round3_lock?: string | null;
    round4_lock?: string | null;
    final_lock?: string | null;
  } | null,
  round: 1 | 2 | 3 | 4,
  lockedRound: 1 | 2 | 3 | 4 | null,
  scoredRounds: Set<1 | 2 | 3 | 4>
) {
  if (!tournament) return false;
  if (round === 4) return isFinalLocked(tournament);

  const nextRound = (round + 1) as 1 | 2 | 3 | 4;
  return !!lockedRound && lockedRound >= nextRound && scoredRounds.has(nextRound);
}

function addRoundScore(row: any, round: number, score: number) {
  if (round === 1) row.r1_strokes += score;
  if (round === 2) row.r2_strokes += score;
  if (round === 3) row.r3_strokes += score;
  if (round === 4) row.r4_strokes += score;
}

function addRoundPickData(
  target: Record<string, Array<{ name: string; score: number | null; thruLabel?: string | null; currentScore?: string | null; teeTimeLabel?: string | null; hasTeedOff?: boolean; isAmateur?: boolean }>>,
  userId: string,
  name: string,
  score: number | null,
  thruLabel?: string | null,
  currentScore?: string | null,
  teeTimeLabel?: string | null,
  hasTeedOff?: boolean,
  isAmateur?: boolean
) {
  if (!target[userId]) {
    target[userId] = [];
  }

  target[userId].push({
    name,
    score,
    thruLabel: thruLabel ?? null,
    currentScore: currentScore ?? null,
    teeTimeLabel: teeTimeLabel ?? null,
    hasTeedOff: Boolean(hasTeedOff),
    isAmateur: Boolean(isAmateur),
  });
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
      roundThruLabels: Partial<Record<1 | 2 | 3 | 4, string | null>>;
      roundCurrentScores: Partial<Record<1 | 2 | 3 | 4, string | null>>;
      roundTeeTimeLabels: Partial<Record<1 | 2 | 3 | 4, string | null>>;
      roundHasTeedOff: Partial<Record<1 | 2 | 3 | 4, boolean>>;
      isAmateur: boolean;
    }
  >,
  userId: string,
  golferId: string,
  name: string,
  round: 1 | 2 | 3 | 4,
  score: number | null,
  thruLabel?: string | null,
  currentScore?: string | null,
  teeTimeLabel?: string | null,
  hasTeedOff?: boolean,
  isAmateur?: boolean
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
      roundThruLabels: {},
      roundCurrentScores: {},
      roundTeeTimeLabels: {},
      roundHasTeedOff: {},
      isAmateur: Boolean(isAmateur),
    });
  }

  const entry = accumulator.get(key)!;
  entry.isAmateur = entry.isAmateur || Boolean(isAmateur);
  entry.roundsUsed.add(round);
  entry.roundScores[round] = score;
  entry.roundThruLabels[round] = thruLabel ?? null;
  entry.roundCurrentScores[round] = currentScore ?? null;
  entry.roundTeeTimeLabels[round] = teeTimeLabel ?? null;
  entry.roundHasTeedOff[round] = Boolean(hasTeedOff);
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
    const publicProgressByGolferRound = await getPublicRoundProgressByGolferRound(tournament, golfers);

    const golferNameById = new Map<string, string>();
    golfers.forEach((g: any) => golferNameById.set(g.id, g.name));

    const displayNameByUserId = new Map<string, string | null>();
    leaderboardNames.forEach((r: any) => {
      displayNameByUserId.set(r.user_id, r.display_name ?? null);
    });

    const scoreByGolferRound = new Map<string, number>();
    const scoredRounds = new Set<1 | 2 | 3 | 4>();
    scores.forEach((s: any) => {
      const round = Number(s.round) as 1 | 2 | 3 | 4;
      const strokes = Number(s.strokes) || 0;
      if (![1, 2, 3, 4].includes(round)) return;
      scoreByGolferRound.set(`${s.golfer_id}:${round}`, strokes);
      scoredRounds.add(round);
    });

    const picksByUserRound = new Map<string, any[]>();
    const roundPickDataByUser: Record<
      string,
      Array<{ name: string; score: number | null; thruLabel?: string | null; currentScore?: string | null; teeTimeLabel?: string | null; hasTeedOff?: boolean; isAmateur?: boolean }>
    > = {};
    const allUsedPicksByUser: Record<
      string,
      Array<{
        name: string;
        roundsUsed: number[];
        totalScore: number;
        roundScores: Partial<Record<1 | 2 | 3 | 4, number | null>>;
        roundThruLabels: Partial<Record<1 | 2 | 3 | 4, string | null>>;
        roundCurrentScores: Partial<Record<1 | 2 | 3 | 4, string | null>>;
        roundTeeTimeLabels: Partial<Record<1 | 2 | 3 | 4, string | null>>;
        roundHasTeedOff: Partial<Record<1 | 2 | 3 | 4, boolean>>;
        isAmateur: boolean;
        roundDetails: Array<{
          round: 1 | 2 | 3 | 4;
          score: number | null;
          thruLabel?: string | null;
          currentScore?: string | null;
          teeTimeLabel?: string | null;
          hasTeedOff?: boolean;
          isAmateur?: boolean;
        }>;
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
        roundThruLabels: Partial<Record<1 | 2 | 3 | 4, string | null>>;
        roundCurrentScores: Partial<Record<1 | 2 | 3 | 4, string | null>>;
        roundTeeTimeLabels: Partial<Record<1 | 2 | 3 | 4, string | null>>;
        roundHasTeedOff: Partial<Record<1 | 2 | 3 | 4, boolean>>;
        isAmateur: boolean;
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
          const applyMissingPickPenalty = shouldApplyPenalty(tournament, round, lockedRound);
          const applyMissingGolferPenalty = shouldApplyMissingGolferPenalty(
            tournament,
            round,
            lockedRound,
            scoredRounds
          );

          for (let slot = 0; slot < 4; slot += 1) {
            const pick = roundPicks[slot];
            const pickedScore = pick
              ? scoreByGolferRound.get(`${pick.golfer_id}:${round}`)
              : undefined;
            const hasPickedScore = typeof pickedScore === "number";
            const shouldScorePenalty =
              !hasPickedScore && (pick ? applyMissingGolferPenalty : applyMissingPickPenalty);
            const pickedName = pick ? golferNameById.get(pick.golfer_id) ?? "" : "";
            const amateurPick = Boolean(pick && pickedName && !shouldScorePenalty && isUsOpen2026Amateur(pickedName));
            const score = hasPickedScore
              ? applyUsOpen2026AmateurBonus(tournament?.name, pickedName, pickedScore)
              : shouldScorePenalty
              ? PENALTY_SCORE
              : null;
            const publicStatus = pick
              ? publicProgressByGolferRound.get(`${pick.golfer_id}:${round}`) ?? null
              : null;
            const thruLabel = publicStatus?.thruLabel ?? null;
            const currentScore = publicStatus?.currentScore ?? null;
            const teeTimeLabel = publicStatus?.teeTimeLabel ?? null;
            const hasTeedOff = Boolean(publicStatus?.hasTeedOff);

            const name = hasPickedScore
              ? pickedName || "Unknown Golfer"
              : shouldScorePenalty
              ? "Penalty"
              : pick
              ? pickedName || "Pending"
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
              addRoundPickData(
                roundPickDataByUser,
                userId,
                name,
                score,
                thruLabel,
                currentScore,
                teeTimeLabel,
                hasTeedOff,
                amateurPick
              );
            }

            addUsedPick(
              allUsedAccumulator,
              userId,
              golferId,
              name,
              round,
              score,
              thruLabel,
              currentScore,
              teeTimeLabel,
              hasTeedOff,
              amateurPick
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
        roundThruLabels: entry.roundThruLabels,
        roundCurrentScores: entry.roundCurrentScores,
        roundTeeTimeLabels: entry.roundTeeTimeLabels,
        roundHasTeedOff: entry.roundHasTeedOff,
        isAmateur: entry.isAmateur,
        roundDetails: [...entry.roundsUsed].sort((a, b) => a - b).map((round) => ({
          round: round as 1 | 2 | 3 | 4,
          score: entry.roundScores[round as 1 | 2 | 3 | 4] ?? null,
          thruLabel: entry.roundThruLabels[round as 1 | 2 | 3 | 4] ?? null,
          currentScore: entry.roundCurrentScores[round as 1 | 2 | 3 | 4] ?? null,
          teeTimeLabel: entry.roundTeeTimeLabels[round as 1 | 2 | 3 | 4] ?? null,
          hasTeedOff: entry.roundHasTeedOff[round as 1 | 2 | 3 | 4] ?? false,
          isAmateur: entry.isAmateur,
        })),
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
