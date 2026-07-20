"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Standing = {
  user_id: string;
  user_name: string;
  total_strokes: number;
  scored_picks: number;
  rank?: number;
};

type TrophyRow = {
  tournament_id: string;
  tournament_name: string;
  completed_at: string | null;
  winners: Standing[];
  standings?: Standing[];
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

function isMasters2026(tournamentName: string) {
  return /masters/i.test(tournamentName) && /2026/.test(tournamentName);
}

function isPgaChampionship2026(tournamentName: string) {
  return /pga/i.test(tournamentName) && /championship/i.test(tournamentName) && /2026/.test(tournamentName);
}

function isUsOpen2026(tournamentName: string) {
  return /2026\s+u\.?s\.?.*open/i.test(tournamentName);
}

function isBritishOpen2026(tournamentName: string) {
  return /2026/i.test(tournamentName) && /(british\s+open|open\s+championship)/i.test(tournamentName);
}

function trophyBannerFor(tournamentName: string) {
  if (isMasters2026(tournamentName) || isPgaChampionship2026(tournamentName)) {
    return "/4play-me/43004b27-4d15-434c-89c0-788550a0db66.png";
  }
  if (isUsOpen2026(tournamentName)) {
    return "/4play-me/a2fc9c61-c935-4351-97ed-75397f0b7c5b-banner-v2.png";
  }
  if (isBritishOpen2026(tournamentName)) {
    return "/4play-me/e04c8744-c2ed-4606-8892-b91f4f453215-british-open-banner.png";
  }
  return "";
}

function placeLabel(rank: number) {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

export default function TrophyDetailPage() {
  const params = useParams<{ tournamentId: string }>();
  const tournamentId = params?.tournamentId ?? "";
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

  const row = useMemo(
    () => rows.find((item) => item.tournament_id === tournamentId) ?? null,
    [rows, tournamentId]
  );
  const bannerSrc = row ? trophyBannerFor(row.tournament_name) : "";
  const podium = useMemo(() => {
    const standings = row?.standings ?? [];
    return standings.filter((standing) => standing.rank === 1 || standing.rank === 2 || standing.rank === 3);
  }, [row]);

  const shell: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(34,197,94,0.08) 0%, rgba(15,23,42,1) 22%, rgba(2,6,23,1) 100%)",
    padding: "18px 14px 40px",
    fontFamily: "Inter, system-ui, sans-serif",
    color: "#f8fafc",
  };

  const content: React.CSSProperties = {
    maxWidth: 1180,
    margin: "0 auto",
  };

  const linkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
    color: "#e2e8f0",
    fontWeight: 800,
    fontSize: 14,
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.88)",
    border: "1px solid rgba(148,163,184,0.14)",
    marginBottom: 16,
  };

  const layout: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
    gap: 18,
    alignItems: "start",
  };

  const imagePanel: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(248,250,252,0.18)",
    background: "rgba(2,6,23,0.56)",
    overflow: "hidden",
    boxShadow: "0 16px 36px rgba(0,0,0,0.32)",
  };

  const sidebar: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(15,23,42,0.82)",
    padding: 16,
    boxShadow: "0 14px 32px rgba(0,0,0,0.24)",
  };

  return (
    <main style={shell}>
      <style>{`
        @media (max-width: 760px) {
          .trophy-detail-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={content}>
        <Link href="/trophy-room" style={linkStyle}>
          Back to Trophy Room
        </Link>

        {loading ? <p style={{ color: "#cbd5e1" }}>Loading trophy...</p> : null}
        {!loading && message ? <p style={{ color: "#cbd5e1" }}>{message}</p> : null}
        {!loading && !message && !row ? (
          <p style={{ color: "#cbd5e1" }}>That trophy was not found.</p>
        ) : null}

        {!loading && !message && row ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <h1 style={{ margin: 0, fontSize: "clamp(28px, 5vw, 52px)" }}>
                {row.tournament_name}
              </h1>
              <div style={{ marginTop: 6, color: "#94a3b8", fontWeight: 700 }}>
                {fmtDate(row.completed_at)}
              </div>
            </div>

            <div className="trophy-detail-layout" style={layout}>
              <div style={imagePanel}>
                {bannerSrc ? (
                  <img
                    src={bannerSrc}
                    alt={`${row.tournament_name} winner`}
                    style={{
                      width: "100%",
                      height: "auto",
                      display: "block",
                    }}
                  />
                ) : (
                  <div style={{ padding: 24, color: "#cbd5e1" }}>
                    No winner image is available for this tournament.
                  </div>
                )}
              </div>

              <aside style={sidebar}>
                <div style={{ display: "grid", gap: 10 }}>
                  {podium.length > 0 ? (
                    podium.map((standing) => (
                      <div
                        key={`${standing.rank}-${standing.user_id}`}
                        style={{
                          borderRadius: 10,
                          border: "1px solid rgba(148,163,184,0.14)",
                          background: "rgba(2,6,23,0.42)",
                          padding: "12px 14px",
                          fontWeight: 900,
                        }}
                      >
                        {placeLabel(standing.rank ?? 0)} - {standing.user_name} {fmtScore(standing.total_strokes)}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#cbd5e1" }}>No podium scores available.</div>
                  )}
                </div>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
