"use client";

import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import AppLogo from "../components/AppLogo";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

type Winner = {
  user_id: string;
  user_name: string;
  total_strokes: number;
  scored_picks: number;
};

type TrophyRow = {
  tournament_id: string;
  tournament_name: string;
  completed_at: string | null;
  winners: Winner[];
};

function fmtScore(v: number) {
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : String(v);
}

function fmtDate(v?: string | null) {
  if (!v) return "Completed";
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : "Completed";
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export default function TrophyRoomPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<TrophyRow[]>([]);

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

    return () => subscription.unsubscribe();
  }, []);

  const userEmail = session?.user?.email?.toLowerCase() ?? "";
  const isAdmin = useMemo(() => ADMIN_EMAILS.includes(userEmail), [userEmail]);

  async function loadTrophyRoom() {
    try {
      setLoading(true);
      setMessage("");

      const token = await supabase.auth
        .getSession()
        .then(({ data }) => data.session?.access_token || "");

      if (!token) {
        window.location.href = "/";
        return;
      }

      const r = await fetch("/api/trophy-room", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setRows([]);
        setMessage(j?.error || "Error loading Trophy Room.");
        return;
      }

      setRows((j?.winners ?? []) as TrophyRow[]);
    } catch (err: unknown) {
      setRows([]);
      setMessage(errorMessage(err, "Unexpected error loading Trophy Room."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    loadTrophyRoom();
  }, [session]);

  const shell: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f6f8fa",
    padding: 20,
    fontFamily: "system-ui, sans-serif",
    color: "#111",
  };

  const content: React.CSSProperties = {
    maxWidth: 900,
    margin: "20px auto",
  };

  const card: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid #d0d7de",
    borderRadius: 12,
    padding: 18,
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
  };

  const linkStyle: React.CSSProperties = {
    textDecoration: "none",
    color: "#0969da",
    fontWeight: 700,
  };

  return (
    <main style={shell}>
      <div style={content}>
        <div style={{ marginBottom: 10 }}>
          <AppLogo width={220} height={90} />
        </div>

        <h1 style={{ marginTop: 0, marginBottom: 4 }}>Trophy Room</h1>
        <p style={{ marginTop: 0, color: "#57606a" }}>
          Past tournament winners, preserved for bragging rights.
        </p>

        <div style={{ marginBottom: 16 }}>
          <Link href="/" style={linkStyle}>
            Home
          </Link>{" "}
          {" | "}
          <Link href="/leaderboard" style={linkStyle}>
            Leaderboard
          </Link>{" "}
          {" | "}
          <Link href="/picks" style={linkStyle}>
            Picks
          </Link>
          {isAdmin ? (
            <>
              {" | "}
              <Link href="/admin" style={linkStyle}>
                Admin
              </Link>
            </>
          ) : null}
        </div>

        {loading ? <p>Loading Trophy Room...</p> : null}
        {!loading && message ? <p>{message}</p> : null}

        {!loading && !message && rows.length === 0 ? (
          <div style={card}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>No trophies yet</h2>
            <p style={{ margin: 0, color: "#57606a" }}>
              Winners will appear here after a tournament has Round 4 locked and scored picks.
            </p>
          </div>
        ) : null}

        {!loading && !message && rows.length > 0 ? (
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((row) => (
              <section key={row.tournament_id} style={card}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22 }}>{row.tournament_name}</h2>
                    <div style={{ marginTop: 4, color: "#57606a", fontSize: 14 }}>
                      {fmtDate(row.completed_at)}
                    </div>
                  </div>

                  <div
                    style={{
                      alignSelf: "flex-start",
                      borderRadius: 999,
                      background: "#fff8c5",
                      border: "1px solid #f0d66f",
                      padding: "6px 10px",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    {row.winners.length > 1 ? "Co-Winners" : "Winner"}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {row.winners.map((winner) => (
                    <div
                      key={`${row.tournament_id}-${winner.user_id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: 12,
                        alignItems: "center",
                        borderRadius: 10,
                        background: "#f6f8fa",
                        border: "1px solid #eaeef2",
                        padding: 12,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 900,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {winner.user_name}
                        </div>
                        <div style={{ marginTop: 4, color: "#57606a", fontSize: 13 }}>
                          {winner.scored_picks} scored pick{winner.scored_picks === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div style={{ fontSize: 22, fontWeight: 900 }}>
                        {fmtScore(winner.total_strokes)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
