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
        .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock")
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
      120000
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
    padding: "18px 14px 40px",
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
    background: "rgba(15,23,42,0.92)",
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
    inset: "0 auto 0 0",
    width: "100%",
    minWidth: 940,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 0,
  };

  const leaderboardWatermarkImage: React.CSSProperties = {
    width: "min(58%, 520px)",
    maxHeight: "82%",
    objectFit: "contain",
    opacity: 0.25,
    filter: "saturate(0.82) contrast(0.9) brightness(1.08) blur(0.2px)",
    mixBlendMode: "screen",
  };

  const selectorRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isCompactNav ? "1fr" : "minmax(260px, 420px) minmax(160px, 1fr)",
    gap: 18,
    alignItems: "center",
  };

  const selectorLogo: React.CSSProperties = {
    width: isCompactNav ? "min(72%, 250px)" : "min(100%, 280px)",
    maxHeight: isCompactNav ? 88 : 104,
    objectFit: "contain",
    justifySelf: isCompactNav ? "center" : "start",
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
    marginBottom: 14,
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

  return (
    <main style={shell}>
      <div style={content}>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Leaderboard</h1>

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

      <div style={{ ...card, marginBottom: 14 }}>
        <div style={selectorRow}>
          <div>
            <label
              htmlFor="tournament-select"
              style={{ display: "block", fontWeight: 900, marginBottom: 8 }}
            >
              Tournament
            </label>
            <select
              id="tournament-select"
              value={selectedTournamentId}
              onChange={(e) => setSelectedTournamentId(e.target.value)}
              style={{
                width: "100%",
                padding: "13px 14px",
                borderRadius: 14,
                border: "1px solid rgba(148,163,184,0.16)",
                background: "rgba(2,6,23,0.82)",
                color: "#f8fafc",
                outline: "none",
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
          <img src="/4play-logo.png" alt="4Play Golf" style={selectorLogo} />
        </div>
      </div>

      {loading ? <p style={{ color: "#cbd5e1" }}>Loading leaderboard…</p> : null}
      {!loading && message ? <p style={{ color: "#cbd5e1" }}>{message}</p> : null}
      {!loading && !message && rankedRows.length === 0 ? (
        <p style={{ color: "#cbd5e1" }}>No scored picks yet.</p>
      ) : null}

      {!loading && !message && rankedRows.length > 0 ? (
        <div style={leaderboardTableWrap}>
          <div style={{ position: "relative", minWidth: 940 }}>
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
                borderCollapse: "collapse",
                background: "rgba(2,6,23,0.62)",
              }}
            >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  Rank
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  Player
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  Behind
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  R1
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  R2
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  R3
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  R4
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  Total
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  Scored
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    padding: 8,
                  }}
                >
                  Views
                </th>
              </tr>
            </thead>
            <tbody>
              {rankedRows.map((r) => {
                const isLeader = r.rank === 1;
                const isCurrentUser = currentUserId === r.user_id;
                const isAllUsedExpanded = !!expandedAllUsedUsers[r.user_id];
                const usedPicks = allUsedPicks[r.user_id] ?? [];
                const canExpandAllUsed = usedPicks.length > 0 || !!lockedRound;

                return (
                  <Fragment key={r.user_id}>
                    <tr
                      style={{
                        background: isCurrentUser
                          ? "rgba(251,146,60,0.15)"
                          : isLeader
                          ? "rgba(34,197,94,0.08)"
                          : "transparent",
                        outline: isCurrentUser ? "2px solid #fb923c" : "none",
                        outlineOffset: -2,
                      }}
                    >
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid rgba(148,163,184,0.12)",
                          fontWeight: isLeader ? 800 : 500,
                        }}
                      >
                        {r.rank}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid rgba(148,163,184,0.12)",
                          fontWeight: isLeader ? 800 : 500,
                        }}
                      >
                        <span>{userLabel(r.display_name, r.user_id)}</span>
                        {isCurrentUser ? (
                          <span
                            style={{
                              marginLeft: 8,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "#fed7aa",
                              color: "#7c2d12",
                              fontSize: 11,
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
                          padding: 8,
                          borderBottom: "1px solid rgba(148,163,184,0.12)",
                          fontWeight: 700,
                          color: scoreColor(r.behind),
                        }}
                      >
                        {r.behind === 0
                          ? "Leader"
                          : r.behind > 0
                          ? `+${r.behind}`
                          : r.behind}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid rgba(148,163,184,0.12)",
                          color: scoreColor(r.r1_strokes),
                          fontWeight: r.r1_strokes < 0 ? 700 : 400,
                        }}
                      >
                        {fmtScore(r.r1_strokes)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid rgba(148,163,184,0.12)",
                          color: scoreColor(r.r2_strokes),
                          fontWeight: r.r2_strokes < 0 ? 700 : 400,
                        }}
                      >
                        {fmtScore(r.r2_strokes)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid rgba(148,163,184,0.12)",
                          color: scoreColor(r.r3_strokes),
                          fontWeight: r.r3_strokes < 0 ? 700 : 400,
                        }}
                      >
                        {fmtScore(r.r3_strokes)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid rgba(148,163,184,0.12)",
                          color: scoreColor(r.r4_strokes),
                          fontWeight: r.r4_strokes < 0 ? 700 : 400,
                        }}
                      >
                        {fmtScore(r.r4_strokes)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid rgba(148,163,184,0.12)",
                          fontWeight: 800,
                          color: scoreColor(r.total_strokes),
                        }}
                      >
                        {fmtScore(r.total_strokes)}
                      </td>
                      <td
                        style={{ padding: 8, borderBottom: "1px solid rgba(148,163,184,0.12)" }}
                      >
                        {r.scored_picks}
                      </td>
                      <td
                        style={{ padding: 8, borderBottom: "1px solid rgba(148,163,184,0.12)" }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {canExpandAllUsed ? (
                            <button
                              onClick={() => toggleAllUsedExpanded(r.user_id)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid rgba(148,163,184,0.16)",
                                background: "rgba(15,23,42,0.92)",
                                color: "#e2e8f0",
                                cursor: "pointer",
                                fontWeight: 800,
                              }}
                            >
                              {isAllUsedExpanded ? "Hide Used" : "Show Used"}
                            </button>
                          ) : (
                            <span style={{ opacity: 0.6 }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isAllUsedExpanded ? (
                      <tr>
                        <td
                          colSpan={10}
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
                                marginBottom: 10,
                                fontSize: 15,
                              }}
                            >
                              {userLabel(r.display_name, r.user_id)} — Used Picks by Round
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(4, minmax(142px, 1fr))",
                                gap: 8,
                                overflowX: "auto",
                              }}
                            >
                              {[1, 2, 3, 4].map((roundNum) => {
                                const round = roundNum as 1 | 2 | 3 | 4;
                                const roundVisible = !!lockedRound && round <= lockedRound;
                                const roundTiles = roundVisible
                                  ? getRoundTilesForDisplay(usedPicks, round)
                                  : [];

                                return (
                                  <div
                                    key={`${r.user_id}-round-${round}`}
                                    style={{
                                      minWidth: 142,
                                      border: "1px solid rgba(148,163,184,0.14)",
                                      borderRadius: 12,
                                      background: roundVisible ? "rgba(15,23,42,0.78)" : "rgba(51,65,85,0.45)",
                                      padding: 7,
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontWeight: 800,
                                        marginBottom: 7,
                                        textAlign: "center",
                                        fontSize: 13,
                                      }}
                                    >
                                      Round {round}
                                    </div>

                                    <div
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr",
                                        gap: 6,
                                      }}
                                    >
                                      {Array.from({ length: 4 }).map((_, idx) => {
                                        const tile = roundTiles[idx];
                                        const hidden = !roundVisible;
                                        const title = hidden
                                          ? "*Hidden*"
                                          : tile?.golferName ?? "—";
                                        const score = hidden
                                          ? "*Hidden*"
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
                                              borderRadius: 8,
                                              background: hidden ? "rgba(51,65,85,0.6)" : "rgba(2,6,23,0.72)",
                                              padding: "7px 8px",
                                            }}
                                          >
                                            <div
                                              style={{
                                                fontSize: 12,
                                                fontWeight: 700,
                                                marginBottom: 3,
                                                lineHeight: 1.15,
                                                color: hidden ? "#94a3b8" : "#f8fafc",
                                              }}
                                            >
                                              {title}
                                            </div>
                                            <div
                                              style={{
                                                fontSize: 11,
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
        <p style={{ marginTop: 12, opacity: 0.7 }}>
          Auto-refreshes every 2 minutes.
        </p>
      ) : null}

      <div style={footerWrap}>
        <p style={footerText}>© 2026 4Play Golf</p>
        <div style={footerSubtext}>A Buxton, Maine Company (Pending)</div>
      </div>
      </div>
    </main>
  );
}



