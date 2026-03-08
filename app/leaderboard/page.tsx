"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

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

type Tournament = {
  id: string;
  name: string;
};

type RankedRow = Row & {
  rank: number;
  behind: number;
};

function fmtRound(v: number | null | undefined) {
  return v && v > 0 ? String(v) : "—";
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [session, setSession] = useState<any>(null);

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

  async function loadLeaderboard() {
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

      const poolId: string | undefined = membership?.pool_id;
      if (!poolId) {
        setMessage("You are not assigned to a pool yet.");
        setLoading(false);
        return;
      }

      const { data: tData, error: tErr } = await supabase
        .from("tournaments")
        .select("id,name")
        .eq("pool_id", poolId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (tErr) {
        setMessage(`Error loading tournament: ${tErr.message}`);
        setLoading(false);
        return;
      }

      const t = (tData?.[0] ?? null) as Tournament | null;
      if (!t) {
        setMessage("No tournament found.");
        setLoading(false);
        return;
      }

      setTournament(t);

      const { data, error } = await supabase
        .from("v_leaderboard")
        .select(
          "user_id,display_name,r1_strokes,r2_strokes,r3_strokes,r4_strokes,total_strokes,scored_picks"
        )
        .eq("pool_id", poolId)
        .eq("tournament_id", t.id)
        .order("total_strokes", { ascending: true });

      if (error) {
        setMessage(`Error loading leaderboard: ${error.message}`);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as Row[]);
      setLoading(false);
    } catch (e: any) {
      setMessage(e?.message || "Unexpected error loading leaderboard.");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;

    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 30000);
    return () => clearInterval(interval);
  }, [session]);

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

  const shell: React.CSSProperties = {
    maxWidth: 900,
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

  return (
    <main style={shell}>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Leaderboard</h1>

      {tournament?.name ? (
        <p style={{ marginTop: 0, opacity: 0.7 }}>{tournament.name}</p>
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
            <strong>{leader.display_name || leader.user_id.slice(0, 8) + "…"}</strong>{" "}
            at <strong>{leader.total_strokes}</strong>
          </div>
        </div>
      ) : null}

      {loading ? <p>Loading leaderboard…</p> : null}
      {!loading && message ? <p>{message}</p> : null}
      {!loading && !message && rankedRows.length === 0 ? <p>No scored picks yet.</p> : null}

      {!loading && !message && rankedRows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
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
              </tr>
            </thead>

            <tbody>
              {rankedRows.map((r) => {
                const isLeader = r.rank === 1;

                return (
                  <tr
                    key={r.user_id}
                    style={{
                      background: isLeader ? "#fafcff" : "transparent",
                    }}
                  >
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
                      {r.display_name || r.user_id.slice(0, 8) + "…"}
                    </td>

                    <td
                      style={{
                        padding: 8,
                        borderBottom: "1px solid #f0f0f0",
                        fontWeight: 700,
                      }}
                    >
                      {r.behind === 0 ? "Leader" : `+${r.behind}`}
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      {fmtRound(r.r1_strokes)}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      {fmtRound(r.r2_strokes)}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      {fmtRound(r.r3_strokes)}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      {fmtRound(r.r4_strokes)}
                    </td>
                    <td
                      style={{
                        padding: 8,
                        borderBottom: "1px solid #f0f0f0",
                        fontWeight: 800,
                      }}
                    >
                      {r.total_strokes}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      {r.scored_picks}
                    </td>
                  </tr>
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