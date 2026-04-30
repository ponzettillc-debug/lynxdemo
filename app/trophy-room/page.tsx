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
    background:
      "radial-gradient(circle at top, rgba(34,197,94,0.08) 0%, rgba(15,23,42,1) 22%, rgba(2,6,23,1) 100%)",
    padding: "18px 14px 40px",
    fontFamily: "Inter, system-ui, sans-serif",
    color: "#f8fafc",
  };

  const content: React.CSSProperties = {
    maxWidth: 900,
    margin: "0 auto",
  };

  const card: React.CSSProperties = {
    background: "rgba(15,23,42,0.86)",
    border: "1px solid rgba(148,163,184,0.14)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
    backdropFilter: "blur(10px)",
  };

  const linkStyle: React.CSSProperties = {
    textDecoration: "none",
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: 14,
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.88)",
    border: "1px solid rgba(148,163,184,0.14)",
  };

  const navStyle: React.CSSProperties = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 16,
  };

  const trophyBadge: React.CSSProperties = {
    alignSelf: "flex-start",
    borderRadius: 999,
    background: "rgba(34,197,94,0.16)",
    border: "1px solid rgba(34,197,94,0.34)",
    color: "#dcfce7",
    padding: "6px 10px",
    fontSize: 13,
    fontWeight: 900,
  };

  const winnerTile: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "center",
    borderRadius: 16,
    background: "rgba(2,6,23,0.72)",
    border: "1px solid rgba(148,163,184,0.12)",
    padding: 12,
  };

  return (
    <main style={shell}>
      <div style={content}>
        <div className="soft-logo-mark" style={{ marginBottom: 10 }}>
          <AppLogo width={220} height={90} />
        </div>

        <h1 style={{ marginTop: 0, marginBottom: 4 }}>Trophy Room</h1>
        <p style={{ marginTop: 0, color: "#94a3b8" }}>
          Past tournament winners, preserved for bragging rights.
        </p>

        <div style={navStyle}>
          <Link href="/" style={linkStyle}>
            Home
          </Link>
          <Link href="/leaderboard" style={linkStyle}>
            Leaderboard
          </Link>
          <Link href="/picks" style={linkStyle}>
            Picks
          </Link>
          {isAdmin ? (
            <Link href="/admin" style={linkStyle}>
              Admin
            </Link>
          ) : null}
        </div>

        {loading ? <p style={{ color: "#cbd5e1" }}>Loading Trophy Room...</p> : null}
        {!loading && message ? <p style={{ color: "#cbd5e1" }}>{message}</p> : null}

        {!loading && !message && rows.length === 0 ? (
          <div style={card}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>No trophies yet</h2>
            <p style={{ margin: 0, color: "#94a3b8" }}>
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
                    <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 14 }}>
                      {fmtDate(row.completed_at)}
                    </div>
                  </div>

                  <div style={trophyBadge}>
                    {row.winners.length > 1 ? "Co-Winners" : "Winner"}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {row.winners.map((winner) => (
                    <div
                      key={`${row.tournament_id}-${winner.user_id}`}
                      style={winnerTile}
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
                        <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 13 }}>
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

