"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import AppLogo from "../components/AppLogo";

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

type LockedPick = {
  name: string;
  score: number | null;
};

type UsedPick = {
  name: string;
  roundsUsed: number[];
  totalScore: number;
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

function fmtScore(v: number | null | undefined) {
  if (typeof v !== "number") return "—";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : String(v);
}

function userLabel(displayName: string | null | undefined, userId: string) {
  return displayName?.trim() || `${userId.slice(0, 8)}…`;
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
    const t = new Date(lock.value).getTime();
    if (Number.isFinite(t) && t <= now) {
      latestLocked = lock.round;
    }
  }

  return latestLocked;
}

function scoreColor(v: number) {
  if (v < 0) return "#15803d";
  if (v > 0) return "#b91c1c";
  return "#111";
}

function getBannerForLockedRound(lockedRound: 1 | 2 | 3 | 4 | null) {
  if (lockedRound === 1) return ROUND_BANNERS.round1;
  if (lockedRound === 2) return ROUND_BANNERS.round2;
  if (lockedRound === 3) return ROUND_BANNERS.round3;
  if (lockedRound === 4) return ROUND_BANNERS.round4;
  return ROUND_BANNERS.default;
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [session, setSession] = useState<any>(null);

  const [poolId, setPoolId] = useState<string>("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");

  const [lockedRoundPicks, setLockedRoundPicks] = useState<
    Record<string, LockedPick[]>
  >({});
  const [allUsedPicks, setAllUsedPicks] = useState<
    Record<string, UsedPick[]>
  >({});
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedAllUsedUsers, setExpandedAllUsedUsers] = useState<
    Record<string, boolean>
  >({});

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

  const userEmail = session?.user?.email?.toLowerCase() ?? "";
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

      const { data: membership, error: memberErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

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
        setLockedRoundPicks({});
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
        setLockedRoundPicks({});
        setAllUsedPicks({});
        setLoading(false);
        return;
      }

      setRows((j?.rows ?? []) as Row[]);
      setLockedRoundPicks(
        (j?.lockedRoundPicks ?? {}) as Record<string, LockedPick[]>
      );
      setAllUsedPicks((j?.allUsedPicks ?? {}) as Record<string, UsedPick[]>);
      setLoading(false);
    } catch (e: any) {
      setMessage(e?.message || "Unexpected error loading leaderboard.");
      setRows([]);
      setLockedRoundPicks({});
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
      30000
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

  const leader = rankedRows[0] ?? null;
  const selectedTournament =
    tournaments.find((t) => t.id === selectedTournamentId) ?? null;
  const lockedRound = getLockedRound(selectedTournament);
  const bannerSrc = getBannerForLockedRound(lockedRound);

  function toggleExpanded(userId: string) {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }

  function toggleAllUsedExpanded(userId: string) {
    setExpandedAllUsedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }

  const shell: React.CSSProperties = {
    maxWidth: 980,
    margin: "20px auto",
    padding: 20,
    fontFamily: "system-ui",
    color: "#111",
  };

  const card: React.CSSProperties = {
    border: "1px solid #e5e5e5",
    borderRadius: 16,
    padding: 14,
    background: "#fff",
    boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
  };

  const picksCard: React.CSSProperties = {
    marginTop: 8,
    border: "1px solid #e6eef8",
    borderRadius: 12,
    padding: 10,
    background: "#f8fbff",
  };

  const usedCard: React.CSSProperties = {
    marginTop: 8,
    border: "1px solid #e7f5ea",
    borderRadius: 12,
    padding: 10,
    background: "#fbfffc",
  };

  const footerWrap: React.CSSProperties = {
    marginTop: 28,
    paddingTop: 18,
    borderTop: "1px solid #e5e7eb",
    textAlign: "center",
  };

  const footerText: React.CSSProperties = {
    margin: 0,
    fontSize: 12,
    letterSpacing: 0.2,
    color: "#6b7280",
  };

  const footerSubtext: React.CSSProperties = {
    marginTop: 6,
    fontSize: 11,
    color: "#9ca3af",
  };

  return (
    <main style={shell}>
      <div style={{ marginBottom: 10 }}>
        <AppLogo width={220} height={90} />
      </div>

      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Leaderboard</h1>

      {selectedTournament?.name ? (
        <p style={{ marginTop: 0, opacity: 0.7 }}>{selectedTournament.name}</p>
      ) : null}

      <div style={{ marginBottom: 14 }}>
        <a href="/picks" style={{ textDecoration: "none" }}>
          Picks
        </a>{" "}
        {" | "}
        {isAdmin ? (
          <>
            <a href="/admin" style={{ textDecoration: "none" }}>
              Admin
            </a>{" "}
            {" | "}
          </>
        ) : null}
        <a href="/" style={{ textDecoration: "none" }}>
          Home
        </a>
      </div>

      <div style={{ ...card, marginBottom: 14 }}>
        <label
          htmlFor="tournament-select"
          style={{ display: "block", fontWeight: 700, marginBottom: 8 }}
        >
          Tournament
        </label>
        <select
          id="tournament-select"
          value={selectedTournamentId}
          onChange={(e) => setSelectedTournamentId(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 420,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #d4d4d4",
            background: "#fff",
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

      {!loading && !message && leader ? (
        <div
          style={{
            ...card,
            marginBottom: 14,
            background: "#f7fbff",
            borderColor: "#d7e8ff",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 15 }}>Current Leader</div>
          <div style={{ marginTop: 6 }}>
            <strong>{userLabel(leader.display_name, leader.user_id)}</strong>{" "}
            at{" "}
            <strong style={{ color: scoreColor(leader.total_strokes) }}>
              {fmtScore(leader.total_strokes)}
            </strong>
          </div>
        </div>
      ) : null}

      {!loading && !message && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Pick visibility</div>
          <div style={{ opacity: 0.75 }}>
            {lockedRound
              ? `Current round view shows locked Round ${lockedRound}. "Show All Used" shows all golfers used through Round ${lockedRound}.`
              : "No round lock has passed yet, so locked picks are not shown."}
          </div>
        </div>
      )}

      {loading ? <p>Loading leaderboard…</p> : null}
      {!loading && message ? <p>{message}</p> : null}
      {!loading && !message && rankedRows.length === 0 ? (
        <p>No scored picks yet.</p>
      ) : null}

      {!loading && !message && rankedRows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 8,
                  }}
                >
                  Rank
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 8,
                  }}
                >
                  Player
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 8,
                  }}
                >
                  Behind
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 8,
                  }}
                >
                  R1
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 8,
                  }}
                >
                  R2
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 8,
                  }}
                >
                  R3
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 8,
                  }}
                >
                  R4
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 8,
                  }}
                >
                  Total
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 8,
                  }}
                >
                  Scored
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
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
                const isExpanded = !!expandedUsers[r.user_id];
                const isAllUsedExpanded = !!expandedAllUsedUsers[r.user_id];
                const roundPicks = lockedRoundPicks[r.user_id] ?? [];
                const usedPicks = allUsedPicks[r.user_id] ?? [];
                const canExpandCurrent = !!lockedRound && roundPicks.length > 0;
                const canExpandAllUsed = !!lockedRound && usedPicks.length > 0;

                return (
                  <Fragment key={r.user_id}>
                    <tr style={{ background: isLeader ? "#fafcff" : "transparent" }}>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid #f0f0f0",
                          fontWeight: isLeader ? 800 : 500,
                        }}
                      >
                        {r.rank}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid #f0f0f0",
                          fontWeight: isLeader ? 800 : 500,
                        }}
                      >
                        {userLabel(r.display_name, r.user_id)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid #f0f0f0",
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
                          borderBottom: "1px solid #f0f0f0",
                          color: scoreColor(r.r1_strokes),
                          fontWeight: r.r1_strokes < 0 ? 700 : 400,
                        }}
                      >
                        {fmtScore(r.r1_strokes)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid #f0f0f0",
                          color: scoreColor(r.r2_strokes),
                          fontWeight: r.r2_strokes < 0 ? 700 : 400,
                        }}
                      >
                        {fmtScore(r.r2_strokes)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid #f0f0f0",
                          color: scoreColor(r.r3_strokes),
                          fontWeight: r.r3_strokes < 0 ? 700 : 400,
                        }}
                      >
                        {fmtScore(r.r3_strokes)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid #f0f0f0",
                          color: scoreColor(r.r4_strokes),
                          fontWeight: r.r4_strokes < 0 ? 700 : 400,
                        }}
                      >
                        {fmtScore(r.r4_strokes)}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom: "1px solid #f0f0f0",
                          fontWeight: 800,
                          color: scoreColor(r.total_strokes),
                        }}
                      >
                        {fmtScore(r.total_strokes)}
                      </td>
                      <td
                        style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}
                      >
                        {r.scored_picks}
                      </td>
                      <td
                        style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {canExpandCurrent ? (
                            <button
                              onClick={() => toggleExpanded(r.user_id)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid #cfd8e3",
                                background: "#fff",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              {isExpanded
                                ? `Hide R${lockedRound}`
                                : `Show R${lockedRound}`}
                            </button>
                          ) : (
                            <span style={{ opacity: 0.6 }}>—</span>
                          )}

                          {canExpandAllUsed ? (
                            <button
                              onClick={() => toggleAllUsedExpanded(r.user_id)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid #cfe7d5",
                                background: "#f8fff9",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              {isAllUsedExpanded
                                ? "Hide All Used"
                                : "Show All Used"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr>
                        <td
                          colSpan={10}
                          style={{ padding: 0, borderBottom: "1px solid #f0f0f0" }}
                        >
                          <div style={picksCard}>
                            <div style={{ fontWeight: 800, marginBottom: 6 }}>
                              Round {lockedRound} locked picks
                            </div>
                            {roundPicks.length > 0 ? (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                {roundPicks.map((pick) => (
                                  <span
                                    key={`${r.user_id}-${pick.name}`}
                                    style={{
                                      display: "inline-block",
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      background: "#eef6ff",
                                      border: "1px solid #d6e7fb",
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color:
                                        typeof pick.score === "number"
                                          ? scoreColor(pick.score)
                                          : "#111",
                                    }}
                                  >
                                    {pick.name}{" "}
                                    {typeof pick.score === "number"
                                      ? `(${fmtScore(pick.score)})`
                                      : "(—)"}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div style={{ opacity: 0.7 }}>
                                No locked picks available.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}

                    {isAllUsedExpanded ? (
                      <tr>
                        <td
                          colSpan={10}
                          style={{ padding: 0, borderBottom: "1px solid #f0f0f0" }}
                        >
                          <div style={usedCard}>
                            <div style={{ fontWeight: 800, marginBottom: 6 }}>
                              All golfers used through Round {lockedRound}
                            </div>
                            {usedPicks.length > 0 ? (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                {usedPicks.map((pick) => (
                                  <span
                                    key={`${r.user_id}-${pick.name}-used`}
                                    style={{
                                      display: "inline-block",
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      background: "#f2fbf4",
                                      border: "1px solid #d7eddc",
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: scoreColor(pick.totalScore),
                                    }}
                                  >
                                    {pick.name} ({fmtScore(pick.totalScore)}) — R
                                    {pick.roundsUsed.join(", R")}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div style={{ opacity: 0.7 }}>
                                No used golfers available.
                              </div>
                            )}
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
      ) : null}

      {!loading && !message ? (
        <p style={{ marginTop: 12, opacity: 0.7 }}>
          Auto-refreshes every 30 seconds.
        </p>
      ) : null}

      <div style={{ marginTop: 28 }}>
        <img
          src={bannerSrc}
          alt="Tournament round banner"
          style={{
            width: "100%",
            maxWidth: 520,
            display: "block",
            borderRadius: 14,
            boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
          }}
        />
      </div>

      <div style={footerWrap}>
        <p style={footerText}>© 2026 4Play Golf</p>
        <div style={footerSubtext}>A Buxton, Maine Company (Pending)</div>
      </div>
    </main>
  );
}