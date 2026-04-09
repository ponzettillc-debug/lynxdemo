// /app/leaderboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import AppLogo from "../components/AppLogo";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

type Tournament = {
  id: string;
  name: string;
  round1_lock?: string | null;
  round2_lock?: string | null;
  round3_lock?: string | null;
  round4_lock?: string | null;
};

type LeaderboardViewRow = {
  user_id: string;
  display_name: string | null;
};

type PickRow = {
  user_id: string;
  golfer_id: string;
  round: number;
};

type ScoreRow = {
  golfer_id: string;
  round: number;
  strokes: number;
};

type Golfer = {
  id: string;
  name: string;
};

type PoolMember = {
  user_id: string;
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

function fmtRound(v: number | null | undefined) {
  return typeof v === "number" && v > 0 ? String(v) : "—";
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

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [session, setSession] = useState<any>(null);

  const [poolId, setPoolId] = useState<string>("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");

  const [lockedRoundPicks, setLockedRoundPicks] = useState<Record<string, string[]>>({});
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

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
        setLoading(false);
        return;
      }

      const [
        poolMembersRes,
        golfersRes,
        picksRes,
        scoresRes,
        leaderboardNamesRes,
      ] = await Promise.all([
        supabase
          .from("pool_members")
          .select("user_id")
          .eq("pool_id", activePoolId),
        supabase
          .from("golfers")
          .select("id,name")
          .eq("pool_id", activePoolId),
        supabase
          .from("picks")
          .select("user_id,golfer_id,round")
          .eq("pool_id", activePoolId)
          .eq("tournament_id", tournamentId),
        supabase
          .from("scores")
          .select("golfer_id,round,strokes")
          .eq("pool_id", activePoolId)
          .eq("tournament_id", tournamentId),
        supabase
          .from("v_leaderboard")
          .select("user_id,display_name")
          .eq("pool_id", activePoolId)
          .eq("tournament_id", tournamentId),
      ]);

      if (poolMembersRes.error) {
        setMessage(`Error loading pool members: ${poolMembersRes.error.message}`);
        setLoading(false);
        return;
      }

      if (golfersRes.error) {
        setMessage(`Error loading golfers: ${golfersRes.error.message}`);
        setLoading(false);
        return;
      }

      if (picksRes.error) {
        setMessage(`Error loading picks: ${picksRes.error.message}`);
        setLoading(false);
        return;
      }

      if (scoresRes.error) {
        setMessage(`Error loading scores: ${scoresRes.error.message}`);
        setLoading(false);
        return;
      }

      if (leaderboardNamesRes.error) {
        setMessage(`Error loading player names: ${leaderboardNamesRes.error.message}`);
        setLoading(false);
        return;
      }

      const poolMembers = (poolMembersRes.data ?? []) as PoolMember[];
      const golfers = (golfersRes.data ?? []) as Golfer[];
      const picks = (picksRes.data ?? []) as PickRow[];
      const scores = (scoresRes.data ?? []) as ScoreRow[];
      const leaderboardNames = (leaderboardNamesRes.data ?? []) as LeaderboardViewRow[];

      const golferNameById = new Map<string, string>();
      golfers.forEach((g) => golferNameById.set(g.id, g.name));

      const displayNameByUserId = new Map<string, string | null>();
      leaderboardNames.forEach((r) => displayNameByUserId.set(r.user_id, r.display_name ?? null));

      if (session?.user?.id) {
        const currentDisplay =
          session.user.user_metadata?.display_name ||
          session.user.user_metadata?.name ||
          null;

        if (!displayNameByUserId.has(session.user.id) && currentDisplay) {
          displayNameByUserId.set(session.user.id, currentDisplay);
        }
      }

      const scoreByGolferRound = new Map<string, number>();
      for (const s of scores) {
        scoreByGolferRound.set(`${s.golfer_id}:${s.round}`, Number(s.strokes) || 0);
      }

      const pickedGolfersByUser = new Map<string, Set<string>>();
      const roundPickNamesByUser: Record<string, string[]> = {};

      const selectedTournament =
        tournaments.find((t) => t.id === tournamentId) ?? null;
      const lockedRound = getLockedRound(selectedTournament);

      const allUserIds = new Set<string>();
      poolMembers.forEach((m) => allUserIds.add(m.user_id));
      picks.forEach((p) => allUserIds.add(p.user_id));
      leaderboardNames.forEach((r) => allUserIds.add(r.user_id));
      if (session?.user?.id) allUserIds.add(session.user.id);

      const rowMap = new Map<string, Row>();
      for (const userId of allUserIds) {
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
      }

      for (const pick of picks) {
        const row = rowMap.get(pick.user_id);
        if (!row) continue;

        const strokes = scoreByGolferRound.get(`${pick.golfer_id}:${pick.round}`);
        if (typeof strokes === "number") {
          if (pick.round === 1) row.r1_strokes += strokes;
          if (pick.round === 2) row.r2_strokes += strokes;
          if (pick.round === 3) row.r3_strokes += strokes;
          if (pick.round === 4) row.r4_strokes += strokes;
        }

        pickedGolfersByUser.get(pick.user_id)?.add(pick.golfer_id);

        if (lockedRound && pick.round === lockedRound) {
          const golferName = golferNameById.get(pick.golfer_id);
          if (!roundPickNamesByUser[pick.user_id]) roundPickNamesByUser[pick.user_id] = [];
          if (golferName) roundPickNamesByUser[pick.user_id].push(golferName);
        }
      }

      const nextRows = Array.from(rowMap.values())
        .map((row) => {
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

          const total =
            row.r1_strokes +
            row.r2_strokes +
            row.r3_strokes +
            row.r4_strokes;

          return {
            ...row,
            scored_picks: scoredPicks,
            total_strokes: total,
          };
        })
        .filter((row) => {
          const hasAnyPicks = (pickedGolfersByUser.get(row.user_id)?.size ?? 0) > 0;
          const hasAnyScores = row.scored_picks > 0 || row.total_strokes > 0;
          return hasAnyPicks || hasAnyScores;
        })
        .sort((a, b) => {
          if (a.total_strokes !== b.total_strokes) {
            return a.total_strokes - b.total_strokes;
          }
          return userLabel(a.display_name, a.user_id).localeCompare(
            userLabel(b.display_name, b.user_id)
          );
        });

      Object.keys(roundPickNamesByUser).forEach((userId) => {
        roundPickNamesByUser[userId] = [...roundPickNamesByUser[userId]].sort((a, b) =>
          a.localeCompare(b)
        );
      });

      setRows(nextRows);
      setLockedRoundPicks(roundPickNamesByUser);
      setLoading(false);
    } catch (e: any) {
      setMessage(e?.message || "Unexpected error loading leaderboard.");
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
  }, [session, poolId, selectedTournamentId, tournaments]);

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

  function toggleExpanded(userId: string) {
    setExpandedUsers((prev) => ({
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
            at <strong>{leader.total_strokes}</strong>
          </div>
        </div>
      ) : null}

      {!loading && !message && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Locked picks view</div>
          <div style={{ opacity: 0.75 }}>
            {lockedRound
              ? `Showing locked Round ${lockedRound} picks when expanded.`
              : "No round lock has passed yet, so locked picks are not shown."}
          </div>
        </div>
      )}

      {loading ? <p>Loading leaderboard…</p> : null}
      {!loading && message ? <p>{message}</p> : null}
      {!loading && !message && rankedRows.length === 0 ? <p>No scored picks yet.</p> : null}

      {!loading && !message && rankedRows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Rank</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Player</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Behind</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>R1</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>R2</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>R3</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>R4</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Total</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Scored</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Picks</th>
              </tr>
            </thead>
            <tbody>
              {rankedRows.map((r) => {
                const isLeader = r.rank === 1;
                const isExpanded = !!expandedUsers[r.user_id];
                const roundPicks = lockedRoundPicks[r.user_id] ?? [];
                const canExpand = !!lockedRound && roundPicks.length > 0;

                return (
                  <>
                    <tr
                      key={r.user_id}
                      style={{ background: isLeader ? "#fafcff" : "transparent" }}
                    >
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", fontWeight: isLeader ? 800 : 500 }}>
                        {r.rank}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", fontWeight: isLeader ? 800 : 500 }}>
                        {userLabel(r.display_name, r.user_id)}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", fontWeight: 700 }}>
                        {r.behind === 0 ? "Leader" : `+${r.behind}`}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{fmtRound(r.r1_strokes)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{fmtRound(r.r2_strokes)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{fmtRound(r.r3_strokes)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{fmtRound(r.r4_strokes)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", fontWeight: 800 }}>
                        {r.total_strokes}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{r.scored_picks}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                        {canExpand ? (
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
                            {isExpanded ? `Hide R${lockedRound}` : `Show R${lockedRound}`}
                          </button>
                        ) : (
                          <span style={{ opacity: 0.6 }}>—</span>
                        )}
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr key={`${r.user_id}-expanded`}>
                        <td colSpan={10} style={{ padding: 0, borderBottom: "1px solid #f0f0f0" }}>
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
                                {roundPicks.map((name) => (
                                  <span
                                    key={`${r.user_id}-${name}`}
                                    style={{
                                      display: "inline-block",
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      background: "#eef6ff",
                                      border: "1px solid #d6e7fb",
                                      fontSize: 13,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div style={{ opacity: 0.7 }}>No locked picks available.</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && !message ? (
        <p style={{ marginTop: 12, opacity: 0.7 }}>Auto-refreshes every 30 seconds.</p>
      ) : null}
    </main>
  );
}