"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

const ROUND_BANNERS: Record<string, string> = {
  default: "/4play-logo.png",
  round1: "/4play_golf_thursday.png",
  round2: "/4play_golf_friday.png",
  round3: "/4play_golf_saturday.png",
  round4: "/4play_golf_sunday.png",
};

type Tournament = {
  id: string;
  name: string;
  round1_lock?: string | null;
  round2_lock?: string | null;
  round3_lock?: string | null;
  round4_lock?: string | null;
  final_lock?: string | null;
};

type UsedPick = {
  name: string;
  roundsUsed?: number[];
  totalScore?: number;
  roundScores?: Partial<Record<1 | 2 | 3 | 4, number | null>>;
  roundDetails?: Array<{
    round: 1 | 2 | 3 | 4;
    score: number | null;
  }>;
};

type Row = {
  user_id: string;
  display_name: string | null;
  r1_strokes: number;
  r2_strokes: number;
  r3_strokes: number;
  r4_strokes: number;
  total_strokes: number;
  scored_picks: number;
  r1_scored_count?: number;
  r2_scored_count?: number;
  r3_scored_count?: number;
  r4_scored_count?: number;
  r1_pick_count?: number;
  r2_pick_count?: number;
  r3_pick_count?: number;
  r4_pick_count?: number;
};

type RankedRow = Row & {
  rank: number;
  behind: number;
};

type RoundTile = {
  golferName: string;
  score: number | null;
};

function fmtScore(v: number | null | undefined) {
  if (typeof v !== "number") return "—";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : String(v);
}

function userLabel(displayName: string | null | undefined, userId: string) {
  return displayName?.trim() || `${userId.slice(0, 8)}…`;
}

function parseLockTime(value?: string | null) {
  if (!value) return NaN;
  const normalized = /(?:z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  return new Date(normalized).getTime();
}

function getLockedRound(tournament: Tournament | null) {
  if (!tournament) return null;

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

function getNextRoundLock(tournament: Tournament | null, nowMs: number) {
  if (!tournament || tournament.final_lock) return null;

  const locks: Array<{ round: 1 | 2 | 3 | 4; value?: string | null }> = [
    { round: 1, value: tournament.round1_lock },
    { round: 2, value: tournament.round2_lock },
    { round: 3, value: tournament.round3_lock },
    { round: 4, value: tournament.round4_lock },
  ];

  return (
    locks
      .map((lock) => ({ ...lock, ms: parseLockTime(lock.value) }))
      .filter((lock) => Number.isFinite(lock.ms) && lock.ms > nowMs)
      .sort((a, b) => a.ms - b.ms)[0] ?? null
  );
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function scoreColor(v: number) {
  if (v < 0) return "#15803d";
  if (v > 0) return "#b91c1c";
  return "#f8fafc";
}

function getBannerForLockedRound(lockedRound: 1 | 2 | 3 | 4 | null) {
  if (lockedRound === 1) return ROUND_BANNERS.round1;
  if (lockedRound === 2) return ROUND_BANNERS.round2;
  if (lockedRound === 3) return ROUND_BANNERS.round3;
  if (lockedRound === 4) return ROUND_BANNERS.round4;
  return ROUND_BANNERS.default;
}

function getRoundTilesForDisplay(
  usedPicks: UsedPick[],
  round: 1 | 2 | 3 | 4
): RoundTile[] {
  const explicitRoundTiles: RoundTile[] = [];

  usedPicks.forEach((pick) => {
    const explicitScoreFromMap = pick.roundScores?.[round];
    const explicitDetail = pick.roundDetails?.find((d) => d.round === round);
    const isUsedInRound =
      Array.isArray(pick.roundsUsed) && pick.roundsUsed.includes(round);

    if (
      explicitDetail ||
      typeof explicitScoreFromMap !== "undefined" ||
      isUsedInRound
    ) {
      explicitRoundTiles.push({
        golferName: pick.name,
        score:
          explicitDetail?.score ??
          explicitScoreFromMap ??
          (isUsedInRound ? (pick.totalScore ?? null) : null),
      });
    }
  });

  return explicitRoundTiles.slice(0, 4);
}

function getRoundPickCount(row: Row, round: 1 | 2 | 3 | 4) {
  if (round === 1) return row.r1_pick_count ?? 0;
  if (round === 2) return row.r2_pick_count ?? 0;
  if (round === 3) return row.r3_pick_count ?? 0;
  return row.r4_pick_count ?? 0;
}

function getRoundScoredCount(row: Row, round: 1 | 2 | 3 | 4) {
  if (round === 1) return row.r1_scored_count ?? 0;
  if (round === 2) return row.r2_scored_count ?? 0;
  if (round === 3) return row.r3_scored_count ?? 0;
  return row.r4_scored_count ?? 0;
}

function getRoundScore(row: Row, round: 1 | 2 | 3 | 4) {
  if (round === 1) return row.r1_strokes;
  if (round === 2) return row.r2_strokes;
  if (round === 3) return row.r3_strokes;
  return row.r4_strokes;
}

function roundCellLabel(
  row: Row,
  round: 1 | 2 | 3 | 4,
  lockedRound: 1 | 2 | 3 | 4 | null
) {
  if (lockedRound && round <= lockedRound) {
    const pickCount = getRoundPickCount(row, round);
    const scoredCount = getRoundScoredCount(row, round);
    if (pickCount === 0 && scoredCount === 0) return "NO PICKS";
    if (pickCount > 0 && scoredCount === 0) return "PENDING";
    return fmtScore(getRoundScore(row, round));
  }

  return getRoundPickCount(row, round) > 0 ? "*Hidden*" : "NO PICKS";
}

function roundCellColor(
  row: Row,
  round: 1 | 2 | 3 | 4,
  lockedRound: 1 | 2 | 3 | 4 | null
) {
  if (lockedRound && round <= lockedRound) {
    const pickCount = getRoundPickCount(row, round);
    const scoredCount = getRoundScoredCount(row, round);
    if (pickCount === 0 && scoredCount === 0) return "#fbbf24";
    if (pickCount > 0 && scoredCount === 0) return "#94a3b8";
    return scoreColor(getRoundScore(row, round));
  }

  return getRoundPickCount(row, round) > 0 ? "#94a3b8" : "#fbbf24";
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [session, setSession] = useState<any>(null);

  const [poolId, setPoolId] = useState<string>("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");

  const [allUsedPicks, setAllUsedPicks] = useState<
    Record<string, UsedPick[]>
  >({});
  const [expandedAllUsedUsers, setExpandedAllUsedUsers] = useState<
    Record<string, boolean>
  >({});
  const [isCompactNav, setIsCompactNav] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        window.location.href = "/";
        return;
      }
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function updateCompactNav() {
      setIsCompactNav(window.innerWidth < 560);
    }

    updateCompactNav();
    window.addEventListener("resize", updateCompactNav);
    return () => window.removeEventListener("resize", updateCompactNav);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const userEmail = session?.user?.email?.toLowerCase() ?? "";
  const currentUserId = session?.user?.id ?? "";
  const isAdmin = useMemo(() => ADMIN_EMAILS.includes(userEmail), [userEmail]);

  async function loadSetup() {
    try {
      setLoading(true);
      setMessage("");

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        window.location.href = "/";
        return;
      }

      const userId = sess.session.user.id;
      const token = sess.session.access_token;

      let { data: membership, error: memberErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (!membership?.pool_id && isAdmin && token) {
        const bootstrapRes = await fetch("/api/bootstrap", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (bootstrapRes.ok) {
          const retry = await supabase
            .from("pool_members")
            .select("pool_id")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();
          membership = retry.data;
          memberErr = retry.error;
        }
      }

      if (memberErr) {
        setMessage(`Error loading pool membership: ${memberErr.message}`);
        setLoading(false);
        return;
      }

      const nextPoolId: string | undefined = membership?.pool_id;
      if (!nextPoolId) {
        setMessage("You are not assigned to a pool yet.");
        setLoading(false);
        return;
      }

      setPoolId(nextPoolId);

      const { data: tData, error: tErr } = await supabase
        .from("tournaments")
        .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock,final_lock")
        .eq("pool_id", nextPoolId)
        .order("created_at", { ascending: false });

      if (tErr) {
        setMessage(`Error loading tournaments: ${tErr.message}`);
        setLoading(false);
        return;
      }

      const nextTournaments = (tData ?? []) as Tournament[];
      setTournaments(nextTournaments);

      if (nextTournaments.length === 0) {
        setMessage("No tournament found.");
        setRows([]);
        setLoading(false);
        return;
      }

      setSelectedTournamentId((prev) =>
        prev && nextTournaments.some((t) => t.id === prev)
          ? prev
          : nextTournaments[0].id
      );
    } catch (e: any) {
      setMessage(e?.message || "Unexpected error loading leaderboard setup.");
      setLoading(false);
    }
  }

  async function loadLeaderboard(tournamentId: string, activePoolId: string) {
    try {
      setLoading(true);
      setMessage("");

      if (!tournamentId || !activePoolId) {
        setRows([]);
        setAllUsedPicks({});
        setLoading(false);
        return;
      }

      const token = await supabase.auth
        .getSession()
        .then(({ data }) => data.session?.access_token || "");

      const r = await fetch(
        `/api/leaderboard?pool_id=${encodeURIComponent(
          activePoolId
        )}&tournament_id=${encodeURIComponent(tournamentId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMessage(j?.error || "Error loading leaderboard.");
        setRows([]);
        setAllUsedPicks({});
        setLoading(false);
        return;
      }

      setRows((j?.rows ?? []) as Row[]);
      setAllUsedPicks((j?.allUsedPicks ?? {}) as Record<string, UsedPick[]>);
      setLoading(false);
    } catch (e: any) {
      setMessage(e?.message || "Unexpected error loading leaderboard.");
      setRows([]);
      setAllUsedPicks({});
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    loadSetup();
  }, [session]);

  useEffect(() => {
    if (!session || !poolId || !selectedTournamentId) return;

    loadLeaderboard(selectedTournamentId, poolId);
    const interval = setInterval(
      () => loadLeaderboard(selectedTournamentId, poolId),
      300000
    );
    return () => clearInterval(interval);
  }, [session, poolId, selectedTournamentId]);

  const rankedRows = useMemo<RankedRow[]>(() => {
    if (rows.length === 0) return [];

    const leaderScore = rows[0].total_strokes;
    let currentRank = 1;

    return rows.map((row, idx) => {
      if (idx > 0 && row.total_strokes > rows[idx - 1].total_strokes) {
        currentRank = idx + 1;
      }

      return {
        ...row,
        rank: currentRank,
        behind: row.total_strokes - leaderScore,
      };
    });
  }, [rows]);

  const selectedTournament =
    tournaments.find((t) => t.id === selectedTournamentId) ?? null;
  const lockedRound = getLockedRound(selectedTournament);
  const nextRoundLock = getNextRoundLock(selectedTournament, nowMs);
  const statusLabel = selectedTournament?.final_lock
    ? "Tournament Complete"
    : lockedRound
    ? `Round ${lockedRound} locked`
    : "Awaiting lock";
  const bannerSrc = getBannerForLockedRound(lockedRound);

  function toggleAllUsedExpanded(userId: string) {
    setExpandedAllUsedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }

  const shell: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(34,197,94,0.08) 0%, rgba(15,23,42,1) 22%, rgba(2,6,23,1) 100%)",
    padding: isCompactNav ? "14px 8px 32px" : "18px 14px 40px",
    fontFamily: "Inter, system-ui, sans-serif",
    color: "#f8fafc",
  };

  const content: React.CSSProperties = {
    maxWidth: 980,
    margin: "0 auto",
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(148,163,184,0.14)",
    borderRadius: 22,
    padding: 16,
    background: "rgba(15,23,42,0.86)",
    boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
    backdropFilter: "blur(10px)",
  };

  const usedCard: React.CSSProperties = {
    marginTop: 8,
    border: "1px solid rgba(148,163,184,0.14)",
    borderRadius: 18,
    padding: 12,
    background: "rgba(15,23,42,0.24)",
    backdropFilter: "blur(0.5px)",
  };

  const leaderboardTableWrap: React.CSSProperties = {
    position: "relative",
    overflowX: "auto",
    borderRadius: 22,
    background: "rgba(15,23,42,0.86)",
    border: "1px solid rgba(148,163,184,0.14)",
    boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
    backdropFilter: "blur(10px)",
  };

  const leaderboardWatermark: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: "50%",
    width: "100%",
    height: "100%",
    minWidth: isCompactNav ? 320 : 760,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: "translateY(-50%)",
    pointerEvents: "none",
    zIndex: 0,
  };

  const leaderboardWatermarkImage: React.CSSProperties = {
    width: "min(68%, 620px)",
    maxHeight: "88%",
    objectFit: "contain",
    opacity: 0.46,
    filter: "saturate(0.95) contrast(1.02) brightness(1.24)",
    mixBlendMode: "screen",
  };

  const selectorRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isCompactNav ? "minmax(0, 1fr) 92px" : "minmax(260px, 420px) minmax(160px, 1fr)",
    gap: isCompactNav ? 10 : 18,
    alignItems: "center",
  };

  const selectorLogo: React.CSSProperties = {
    width: isCompactNav ? 92 : "min(100%, 280px)",
    maxHeight: isCompactNav ? 66 : 104,
    objectFit: "contain",
    justifySelf: "start",
    borderRadius: 14,
    opacity: 0.88,
    filter: "saturate(0.95) contrast(1.02) brightness(1.04)",
    mixBlendMode: "screen",
    WebkitMaskImage:
      "radial-gradient(ellipse at center, #000 46%, rgba(0,0,0,0.68) 68%, transparent 100%)",
    maskImage:
      "radial-gradient(ellipse at center, #000 46%, rgba(0,0,0,0.68) 68%, transparent 100%)",
  };

  const footerWrap: React.CSSProperties = {
    marginTop: 28,
    paddingTop: 18,
    borderTop: "1px solid rgba(148,163,184,0.14)",
    textAlign: "center",
  };

  const footerText: React.CSSProperties = {
    margin: 0,
    fontSize: 12,
    letterSpacing: 0.2,
    color: "#cbd5e1",
  };

  const footerSubtext: React.CSSProperties = {
    marginTop: 6,
    fontSize: 11,
    color: "#64748b",
  };

  const nav: React.CSSProperties = {
    display: "flex",
    gap: isCompactNav ? 6 : 10,
    flexWrap: "wrap",
    justifyContent: isCompactNav ? "flex-start" : "flex-end",
    alignItems: "center",
  };

  const navLink: React.CSSProperties = {
    textDecoration: "none",
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: isCompactNav ? 12 : 14,
    padding: isCompactNav ? "8px 9px" : "10px 14px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.88)",
    border: "1px solid rgba(148,163,184,0.14)",
  };

  const gamesNavLink: React.CSSProperties = {
    ...navLink,
    marginLeft: isCompactNav ? 0 : "auto",
    fontSize: isCompactNav ? 11 : navLink.fontSize,
    padding: isCompactNav ? "8px 8px" : navLink.padding,
    color: "#f8fafc",
    border: "1px solid rgba(203,213,225,0.28)",
    background:
      "radial-gradient(circle at 18% 28%, rgba(203,213,225,0.42) 0 13%, transparent 14%), radial-gradient(circle at 72% 34%, rgba(59,130,246,0.28) 0 16%, transparent 17%), radial-gradient(circle at 42% 74%, rgba(15,23,42,0.64) 0 18%, transparent 19%), linear-gradient(135deg, rgba(30,41,59,0.9), rgba(71,85,105,0.62) 42%, rgba(15,23,42,0.86))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16), 0 6px 18px rgba(2,6,23,0.24)",
  };

  const tableMinWidth = isCompactNav ? 320 : 760;
  const tablePadding = isCompactNav ? "5px 2px" : 8;
  const tableFontSize = isCompactNav ? 10 : 14;
  const headerCell: React.CSSProperties = {
    textAlign: "left",
    borderBottom: "1px solid rgba(148,163,184,0.22)",
    padding: tablePadding,
    whiteSpace: "nowrap",
  };
  const bodyCell: React.CSSProperties = {
    padding: tablePadding,
    borderBottom: "1px solid rgba(148,163,184,0.12)",
    whiteSpace: "nowrap",
  };
  const keyColumnHeaderCell: React.CSSProperties = {
    ...headerCell,
    background: "rgba(125,211,252,0.10)",
    boxShadow: "inset 1px 0 0 rgba(125,211,252,0.12), inset -1px 0 0 rgba(125,211,252,0.10)",
  };
  const keyColumnBodyCell: React.CSSProperties = {
    ...bodyCell,
    background: "rgba(125,211,252,0.065)",
    boxShadow: "inset 1px 0 0 rgba(125,211,252,0.09), inset -1px 0 0 rgba(125,211,252,0.08)",
  };
  const usedRoundMinWidth = isCompactNav ? 0 : 142;
  const usedTileNameMaxWidth = isCompactNav ? 58 : 116;
  const headerBand: React.CSSProperties = {
    marginBottom: 14,
    padding: isCompactNav ? "12px" : "16px 18px",
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.14)",
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.94), rgba(30,41,59,0.74) 58%, rgba(2,6,23,0.9))",
    boxShadow: "0 16px 36px rgba(2,6,23,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
  };
  const headerGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isCompactNav ? "1fr" : "minmax(180px, 1fr) auto",
    gap: isCompactNav ? 12 : 18,
    alignItems: "center",
  };
  const eyebrow: React.CSSProperties = {
    margin: 0,
    color: "#7dd3fc",
    fontSize: isCompactNav ? 10 : 11,
    fontWeight: 900,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  };
  const titleRow: React.CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 3,
  };
  const pageTitle: React.CSSProperties = {
    margin: 0,
    color: "#f8fafc",
    fontSize: isCompactNav ? 26 : 34,
    lineHeight: 1,
    letterSpacing: 0,
    textShadow: "0 0 18px rgba(125,211,252,0.18)",
  };
  const roundPill: React.CSSProperties = {
    border: "1px solid rgba(125,211,252,0.28)",
    background: "rgba(14,165,233,0.10)",
    color: "#bae6fd",
    borderRadius: 999,
    padding: isCompactNav ? "4px 8px" : "5px 10px",
    fontSize: isCompactNav ? 11 : 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
  const headerSubline: React.CSSProperties = {
    margin: "7px 0 0",
    color: "#94a3b8",
    fontSize: isCompactNav ? 12 : 14,
  };

  return (
    <main style={shell}>
      <div style={content}>
      <header style={headerBand}>
        <div style={headerGrid}>
          <div>
            <p style={eyebrow}>4Play Golf Pool</p>
            <div style={titleRow}>
              <h1 style={pageTitle}>Leaderboard</h1>
              <span style={roundPill}>
                {statusLabel}
              </span>
            </div>
            <p style={headerSubline}>
              {selectedTournament?.name || "Select a tournament"} · standings update every 5 minutes
            </p>
            {nextRoundLock ? (
              <p
                style={{
                  margin: "7px 0 0",
                  color: "#bae6fd",
                  fontSize: isCompactNav ? 12 : 14,
                  fontWeight: 900,
                }}
              >
                R{nextRoundLock.round} locks in {formatCountdown(nextRoundLock.ms - nowMs)}
              </p>
            ) : null}
          </div>

          <div style={nav}>
            <a href="/picks" style={navLink}>
              Picks
            </a>
            <a href="/trophy-room" style={navLink}>
              Trophy Room
            </a>
            {isAdmin ? (
              <a href="/admin" style={navLink}>
                Admin
              </a>
            ) : null}
            <a href="/" style={navLink}>
              Home
            </a>
            <a href="/driver" style={gamesNavLink}>
              4Play Games
            </a>
          </div>
        </div>
      </header>

      <div style={{ ...card, marginBottom: 14 }}>
        <div style={selectorRow}>
          <div>
            <label
              htmlFor="tournament-select"
              style={{ display: "block", fontWeight: 900, marginBottom: isCompactNav ? 6 : 8 }}
            >
              Tournament
            </label>
            <select
              id="tournament-select"
              value={selectedTournamentId}
              onChange={(e) => setSelectedTournamentId(e.target.value)}
              style={{
                width: "100%",
                minWidth: 0,
                padding: isCompactNav ? "10px 9px" : "13px 14px",
                borderRadius: isCompactNav ? 11 : 14,
                border: "1px solid rgba(148,163,184,0.16)",
                background: "rgba(2,6,23,0.82)",
                color: "#f8fafc",
                outline: "none",
                fontSize: isCompactNav ? 12 : 14,
              }}
            >
              <option value="">Select tournament</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <a
            href={`/daily-logo?round=${lockedRound ?? "default"}`}
            aria-label="View daily 4Play image"
            style={{ display: "inline-flex", justifySelf: "start", lineHeight: 0 }}
          >
            <img src="/4play-logo.png" alt="4Play Golf" style={selectorLogo} />
          </a>
        </div>
      </div>

      {loading ? <p style={{ color: "#cbd5e1" }}>Loading leaderboard…</p> : null}
      {!loading && message ? <p style={{ color: "#cbd5e1" }}>{message}</p> : null}
      {!loading && !message && rankedRows.length === 0 ? (
        <p style={{ color: "#cbd5e1" }}>No submitted picks yet.</p>
      ) : null}

      {!loading && !message && rankedRows.length > 0 ? (
        <div style={leaderboardTableWrap}>
          <div style={{ position: "relative", minWidth: tableMinWidth }}>
            <div style={leaderboardWatermark} aria-hidden="true">
              <img
                className="soft-logo-watermark"
                src={bannerSrc}
                alt=""
                style={leaderboardWatermarkImage}
              />
            </div>
            <table
              style={{
                position: "relative",
                zIndex: 1,
                width: "100%",
                tableLayout: "fixed",
                borderCollapse: "collapse",
                background: "rgba(2,6,23,0.62)",
                fontSize: tableFontSize,
              }}
            >
            <colgroup>
              <col style={{ width: isCompactNav ? 26 : 52 }} />
              <col style={{ width: isCompactNav ? 78 : 178 }} />
              <col style={{ width: isCompactNav ? 32 : 70 }} />
              <col style={{ width: isCompactNav ? 32 : 70 }} />
              <col style={{ width: isCompactNav ? 32 : 70 }} />
              <col style={{ width: isCompactNav ? 32 : 70 }} />
              <col style={{ width: isCompactNav ? 38 : 76 }} />
              <col style={{ width: isCompactNav ? 48 : 92 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={headerCell}>
                  {isCompactNav ? "#" : "Rank"}
                </th>
                <th style={headerCell}>
                  Player
                </th>
                <th style={headerCell}>
                  R1
                </th>
                <th style={headerCell}>
                  R2
                </th>
                <th style={headerCell}>
                  R3
                </th>
                <th style={headerCell}>
                  R4
                </th>
                <th style={keyColumnHeaderCell}>
                  {isCompactNav ? "Tot" : "Total"}
                </th>
                <th style={keyColumnHeaderCell}>
                  {isCompactNav ? "Bhd" : "Behind"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rankedRows.map((r) => {
                const isLeader = r.rank === 1;
                const isCurrentUser = currentUserId === r.user_id;
                const isAllUsedExpanded = !!expandedAllUsedUsers[r.user_id];
                const usedPicks = allUsedPicks[r.user_id] ?? [];
                const hasSubmittedPicks = ([1, 2, 3, 4] as const).some(
                  (round) => getRoundPickCount(r, round) > 0
                );
                const canExpandAllUsed = usedPicks.length > 0 || !!lockedRound || hasSubmittedPicks;

                return (
                  <Fragment key={r.user_id}>
                    <tr
                      onClick={() => {
                        if (canExpandAllUsed) toggleAllUsedExpanded(r.user_id);
                      }}
                      onKeyDown={(e) => {
                        if (!canExpandAllUsed) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleAllUsedExpanded(r.user_id);
                        }
                      }}
                      tabIndex={canExpandAllUsed ? 0 : undefined}
                      aria-expanded={canExpandAllUsed ? isAllUsedExpanded : undefined}
                      style={{
                        background: isCurrentUser
                          ? "rgba(251,146,60,0.15)"
                          : isLeader
                          ? "rgba(34,197,94,0.08)"
                          : "transparent",
                        outline: isCurrentUser ? "2px solid #fb923c" : "none",
                        outlineOffset: -2,
                        cursor: canExpandAllUsed ? "pointer" : "default",
                      }}
                    >
                      <td
                        style={{
                          ...bodyCell,
                          fontWeight: isLeader ? 800 : 500,
                        }}
                      >
                        {r.rank}
                      </td>
                      <td
                        style={{
                          ...bodyCell,
                          fontWeight: isLeader ? 800 : 500,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            maxWidth: isCompactNav ? 58 : 128,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            verticalAlign: "bottom",
                          }}
                        >
                          {userLabel(r.display_name, r.user_id)}
                        </span>
                        {isCurrentUser ? (
                          <span
                            style={{
                              marginLeft: isCompactNav ? 3 : 8,
                              padding: isCompactNav ? "1px 4px" : "2px 7px",
                              borderRadius: 999,
                              background: "#fed7aa",
                              color: "#7c2d12",
                              fontSize: isCompactNav ? 9 : 11,
                              fontWeight: 900,
                              whiteSpace: "nowrap",
                            }}
                          >
                            You
                          </span>
                        ) : null}
                      </td>
                      <td
                        style={{
                          ...bodyCell,
                          color: roundCellColor(r, 1, lockedRound),
                          fontWeight: lockedRound && 1 <= lockedRound && r.r1_strokes < 0 ? 700 : 800,
                          fontSize: isCompactNav && (!lockedRound || 1 > lockedRound) ? 8 : tableFontSize,
                        }}
                      >
                        {roundCellLabel(r, 1, lockedRound)}
                      </td>
                      <td
                        style={{
                          ...bodyCell,
                          color: roundCellColor(r, 2, lockedRound),
                          fontWeight: lockedRound && 2 <= lockedRound && r.r2_strokes < 0 ? 700 : 800,
                          fontSize: isCompactNav && (!lockedRound || 2 > lockedRound) ? 8 : tableFontSize,
                        }}
                      >
                        {roundCellLabel(r, 2, lockedRound)}
                      </td>
                      <td
                        style={{
                          ...bodyCell,
                          color: roundCellColor(r, 3, lockedRound),
                          fontWeight: lockedRound && 3 <= lockedRound && r.r3_strokes < 0 ? 700 : 800,
                          fontSize: isCompactNav && (!lockedRound || 3 > lockedRound) ? 8 : tableFontSize,
                        }}
                      >
                        {roundCellLabel(r, 3, lockedRound)}
                      </td>
                      <td
                        style={{
                          ...bodyCell,
                          color: roundCellColor(r, 4, lockedRound),
                          fontWeight: lockedRound && 4 <= lockedRound && r.r4_strokes < 0 ? 700 : 800,
                          fontSize: isCompactNav && (!lockedRound || 4 > lockedRound) ? 8 : tableFontSize,
                        }}
                      >
                        {roundCellLabel(r, 4, lockedRound)}
                      </td>
                      <td
                        style={{
                          ...keyColumnBodyCell,
                          fontWeight: 800,
                          color: scoreColor(r.total_strokes),
                        }}
                      >
                        {fmtScore(r.total_strokes)}
                      </td>
                      <td
                        style={{
                          ...keyColumnBodyCell,
                          fontWeight: 700,
                          color: scoreColor(r.behind),
                        }}
                      >
                        {r.behind === 0
                          ? isCompactNav
                            ? "Lead"
                            : "Leader"
                          : r.behind > 0
                          ? `+${r.behind}`
                          : r.behind}
                      </td>
                    </tr>

                    {isAllUsedExpanded ? (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: 0,
                            borderBottom: "1px solid rgba(148,163,184,0.12)",
                            background: isCurrentUser ? "rgba(251,146,60,0.15)" : "transparent",
                          }}
                        >
                          <div style={usedCard}>
                            <div
                              style={{
                                fontWeight: 800,
                                marginBottom: isCompactNav ? 6 : 10,
                                fontSize: isCompactNav ? 10 : 15,
                              }}
                            >
                              {isCompactNav ? "Used Picks" : `${userLabel(r.display_name, r.user_id)} — Used Picks by Round`}
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  isCompactNav ? "repeat(4, minmax(0, 1fr))" : "repeat(4, minmax(142px, 1fr))",
                                gap: isCompactNav ? 3 : 8,
                                overflowX: "hidden",
                              }}
                            >
                              {[1, 2, 3, 4].map((roundNum) => {
                                const round = roundNum as 1 | 2 | 3 | 4;
                                const roundVisible = !!lockedRound && round <= lockedRound;
                                const hasRoundPicks = getRoundPickCount(r, round) > 0;
                                const roundTiles = roundVisible
                                  ? getRoundTilesForDisplay(usedPicks, round)
                                  : [];

                                return (
                                  <div
                                    key={`${r.user_id}-round-${round}`}
                                    style={{
                                      minWidth: usedRoundMinWidth,
                                      border: "1px solid rgba(148,163,184,0.14)",
                                      borderRadius: isCompactNav ? 7 : 12,
                                      background: roundVisible ? "rgba(15,23,42,0.22)" : "rgba(51,65,85,0.16)",
                                      padding: isCompactNav ? 3 : 7,
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontWeight: 800,
                                        marginBottom: isCompactNav ? 4 : 7,
                                        textAlign: "center",
                                        fontSize: isCompactNav ? 9 : 13,
                                      }}
                                    >
                                      {isCompactNav ? `R${round}` : `Round ${round}`}
                                    </div>

                                    <div
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr",
                                        gap: isCompactNav ? 3 : 6,
                                      }}
                                    >
                                      {Array.from({ length: 4 }).map((_, idx) => {
                                        const tile = roundTiles[idx];
                                        const hidden = !roundVisible;
                                        const noPicks = hidden && !hasRoundPicks;
                                        const title = hidden
                                          ? noPicks
                                            ? idx === 0
                                              ? "NO PICKS"
                                              : ""
                                            : "*Hidden*"
                                          : tile?.golferName ?? "—";
                                        const score = hidden
                                          ? noPicks
                                            ? ""
                                            : "*Hidden*"
                                          : tile
                                          ? fmtScore(tile.score)
                                          : "—";
                                        const tileColor =
                                          !hidden && typeof tile?.score === "number"
                                            ? scoreColor(tile.score)
                                            : "#f8fafc";

                                        return (
                                          <div
                                            key={`${r.user_id}-round-${round}-tile-${idx}`}
                                            style={{
                                              border: "1px solid rgba(148,163,184,0.12)",
                                              borderRadius: isCompactNav ? 5 : 8,
                                              background: hidden ? "rgba(51,65,85,0.2)" : "rgba(2,6,23,0.28)",
                                              padding: isCompactNav ? "4px 2px" : "7px 8px",
                                            }}
                                          >
                                            <div
                                              style={{
                                                fontSize: isCompactNav ? 8 : 12,
                                                fontWeight: 700,
                                                marginBottom: isCompactNav ? 1 : 3,
                                                lineHeight: 1.15,
                                                color: noPicks ? "#fbbf24" : hidden ? "#94a3b8" : "#f8fafc",
                                                maxWidth: usedTileNameMaxWidth,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                              }}
                                            >
                                              {title}
                                            </div>
                                            <div
                                              style={{
                                                fontSize: isCompactNav ? 8 : 11,
                                                fontWeight: 800,
                                                color: hidden ? "#6b7280" : tileColor,
                                              }}
                                            >
                                              {score}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!loading && !message ? (
        <div style={{ marginTop: 12, opacity: 0.7 }}>
          <p style={{ margin: 0 }}>Click Player Name to Show Players Used</p>
          <p style={{ margin: "4px 0 0" }}>Auto-refreshes every 5 minutes.</p>
        </div>
      ) : null}

      <div style={footerWrap}>
        <p style={footerText}>© 2026 4Play Golf</p>
        <div style={footerSubtext}>A Buxton, Maine Company (Pending)</div>
      </div>
      </div>
    </main>
  );
}
