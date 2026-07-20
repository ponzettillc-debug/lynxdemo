"use client";

import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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

  const gamesLinkStyle: React.CSSProperties = {
    ...linkStyle,
    color: "#f8fafc",
    border: "1px solid rgba(203,213,225,0.28)",
    background:
      "radial-gradient(circle at 18% 28%, rgba(203,213,225,0.42) 0 13%, transparent 14%), radial-gradient(circle at 72% 34%, rgba(59,130,246,0.28) 0 16%, transparent 17%), radial-gradient(circle at 42% 74%, rgba(15,23,42,0.64) 0 18%, transparent 19%), linear-gradient(135deg, rgba(30,41,59,0.9), rgba(71,85,105,0.62) 42%, rgba(15,23,42,0.86))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16), 0 6px 18px rgba(2,6,23,0.24)",
  };

  const navStyle: React.CSSProperties = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 16,
  };

  const bannerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 760,
    display: "block",
    margin: "0 auto 18px",
    borderRadius: 22,
    opacity: 0.92,
    filter: "saturate(0.94) contrast(0.98) brightness(0.96)",
    mixBlendMode: "screen",
    WebkitMaskImage:
      "linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 9%, #000 88%, transparent 100%)",
    WebkitMaskComposite: "source-in",
    maskImage:
      "linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 9%, #000 88%, transparent 100%)",
    maskComposite: "intersect",
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

  const tournamentBannerStyle: React.CSSProperties = {
    width: "100%",
    height: "clamp(240px, 42vw, 340px)",
    display: "block",
    objectFit: "cover",
    objectPosition: "center 35%",
  };

  const tournamentBannerStage: React.CSSProperties = {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    border: "1px solid rgba(248,250,252,0.18)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 24px rgba(0,0,0,0.24)",
  };

  const tournamentWinnerOverlay: React.CSSProperties = {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    zIndex: 2,
    display: "grid",
    gap: 8,
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

  const mastersWinnerTile: React.CSSProperties = {
    ...winnerTile,
    background:
      "linear-gradient(135deg, rgba(2,44,34,0.92), rgba(3,7,18,0.84) 54%, rgba(78,58,14,0.54))",
    border: "1px solid rgba(250,204,21,0.28)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 12px 28px rgba(0,0,0,0.20)",
  };

  const mastersTrophyWrap: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto auto",
    gap: 12,
    alignItems: "center",
    justifyContent: "end",
    minWidth: 122,
  };

  const mastersTrophy: React.CSSProperties = {
    position: "relative",
    width: 54,
    height: 62,
    display: "grid",
    justifyItems: "center",
    alignItems: "end",
  };

  const mastersCup: React.CSSProperties = {
    position: "relative",
    width: 34,
    height: 30,
    display: "grid",
    placeItems: "center",
    borderRadius: "5px 5px 15px 15px",
    background:
      "linear-gradient(135deg, #fef3c7 0%, #facc15 36%, #a16207 72%, #fde68a 100%)",
    border: "1px solid rgba(253,230,138,0.88)",
    boxShadow: "inset 0 4px 8px rgba(255,255,255,0.34), 0 0 18px rgba(250,204,21,0.24)",
  };

  const mastersCupInscription: React.CSSProperties = {
    width: 25,
    minHeight: 17,
    display: "grid",
    placeItems: "center",
    borderRadius: 5,
    background: "linear-gradient(180deg, rgba(22,101,52,0.94), rgba(20,83,45,0.92))",
    border: "1px solid rgba(254,243,199,0.55)",
    color: "#fef3c7",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 4.6,
    fontWeight: 900,
    lineHeight: 0.92,
    textAlign: "center",
    textTransform: "uppercase",
    textShadow: "0 1px 1px rgba(0,0,0,0.46)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
    transform: "translateY(1px)",
  };

  const mastersHandleBase: React.CSSProperties = {
    position: "absolute",
    top: 8,
    width: 14,
    height: 18,
    border: "3px solid rgba(250,204,21,0.82)",
    borderBottomColor: "transparent",
  };

  const mastersStem: React.CSSProperties = {
    width: 8,
    height: 14,
    background: "linear-gradient(180deg, #facc15, #92400e)",
    borderRadius: 3,
  };

  const mastersBase: React.CSSProperties = {
    width: 42,
    height: 9,
    borderRadius: "8px 8px 4px 4px",
    background: "linear-gradient(135deg, #14532d, #166534 54%, #facc15)",
    border: "1px solid rgba(250,204,21,0.38)",
  };

  const mastersGolfBall: React.CSSProperties = {
    position: "absolute",
    right: -1,
    top: -2,
    width: 13,
    height: 13,
    borderRadius: 999,
    background:
      "radial-gradient(circle at 32% 30%, #ffffff 0 16%, #dbeafe 17% 100%)",
    border: "1px solid rgba(255,255,255,0.86)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.24)",
  };

  const mastersScoreWrap: React.CSSProperties = {
    textAlign: "right",
    minWidth: 44,
  };

  const pgaWinnerTile: React.CSSProperties = {
    ...winnerTile,
    background:
      "linear-gradient(135deg, rgba(8,22,48,0.96), rgba(2,6,23,0.9) 52%, rgba(14,116,144,0.38))",
    border: "1px solid rgba(245,158,11,0.32)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 28px rgba(0,0,0,0.22)",
  };

  const pgaTrophyWrap: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto auto",
    gap: 12,
    alignItems: "center",
    justifyContent: "end",
    minWidth: 124,
  };

  const pgaTrophy: React.CSSProperties = {
    position: "relative",
    width: 56,
    height: 64,
    display: "grid",
    justifyItems: "center",
    alignItems: "end",
  };

  const pgaCup: React.CSSProperties = {
    position: "relative",
    width: 35,
    height: 31,
    display: "grid",
    placeItems: "center",
    borderRadius: "6px 6px 15px 15px",
    background:
      "linear-gradient(135deg, #ffffff 0%, #f59e0b 30%, #0f2a55 66%, #38bdf8 100%)",
    border: "1px solid rgba(255,255,255,0.78)",
    boxShadow:
      "inset 0 4px 8px rgba(255,255,255,0.36), 0 0 18px rgba(56,189,248,0.22)",
  };

  const pgaCupInscription: React.CSSProperties = {
    width: 25,
    minHeight: 17,
    display: "grid",
    placeItems: "center",
    borderRadius: 5,
    background: "linear-gradient(180deg, rgba(15,42,85,0.96), rgba(8,22,48,0.94))",
    border: "1px solid rgba(245,158,11,0.68)",
    color: "#ffffff",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 4.4,
    fontWeight: 900,
    lineHeight: 0.92,
    textAlign: "center",
    textTransform: "uppercase",
    textShadow: "0 1px 1px rgba(0,0,0,0.5)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
    transform: "translateY(1px)",
  };

  const pgaHandleBase: React.CSSProperties = {
    position: "absolute",
    top: 8,
    width: 14,
    height: 18,
    border: "3px solid rgba(245,158,11,0.88)",
    borderBottomColor: "transparent",
  };

  const pgaStem: React.CSSProperties = {
    width: 8,
    height: 14,
    background: "linear-gradient(180deg, #f59e0b, #0f2a55)",
    borderRadius: 3,
  };

  const pgaBase: React.CSSProperties = {
    width: 43,
    height: 9,
    borderRadius: "8px 8px 4px 4px",
    background: "linear-gradient(135deg, #081630, #0f2a55 48%, #f59e0b 76%, #38bdf8)",
    border: "1px solid rgba(255,255,255,0.28)",
  };

  const pgaBlueAccent: React.CSSProperties = {
    position: "absolute",
    right: -2,
    top: -2,
    width: 14,
    height: 14,
    borderRadius: 999,
    background:
      "radial-gradient(circle at 32% 30%, #ffffff 0 15%, #38bdf8 16% 58%, #0f2a55 59% 100%)",
    border: "1px solid rgba(255,255,255,0.86)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.26)",
  };

  const usOpenWinnerTile: React.CSSProperties = {
    ...winnerTile,
    minHeight: 106,
    padding: 16,
    background:
      "linear-gradient(180deg, rgba(5,23,54,0.97) 0 69%, rgba(185,28,28,0.78) 69% 76%, rgba(248,250,252,0.20) 76% 80%, rgba(12,45,92,0.96) 80% 100%)",
    border: "1px solid rgba(248,250,252,0.38)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.18), 0 16px 34px rgba(0,0,0,0.28), 0 0 22px rgba(37,99,235,0.12)",
  };

  const usOpenTrophyWrap: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto auto",
    gap: 14,
    alignItems: "center",
    justifyContent: "end",
    minWidth: 150,
  };

  const usOpenTrophy: React.CSSProperties = {
    position: "relative",
    width: 70,
    height: 80,
    perspective: 180,
    display: "grid",
    justifyItems: "center",
    alignItems: "end",
  };

  const usOpenCup: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: 44,
    height: 39,
    display: "grid",
    placeItems: "center",
    borderRadius: "7px 7px 18px 18px",
    background:
      "linear-gradient(180deg, #153e75 0 24%, #f8fafc 24% 72%, #b91c1c 72% 100%)",
    border: "1px solid rgba(255,255,255,0.92)",
    boxShadow:
      "inset 0 5px 10px rgba(255,255,255,0.48), 0 0 24px rgba(248,250,252,0.24)",
  };

  const usOpenCupInscription: React.CSSProperties = {
    width: 32,
    minHeight: 22,
    display: "grid",
    placeItems: "center",
    borderRadius: 5,
    background: "linear-gradient(180deg, rgba(7,29,66,0.98), rgba(15,47,96,0.96))",
    border: "1px solid rgba(220,38,38,0.78)",
    color: "#ffffff",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 5.2,
    fontWeight: 900,
    lineHeight: 0.94,
    textAlign: "center",
    textTransform: "uppercase",
    textShadow: "0 1px 1px rgba(0,0,0,0.58)",
  };

  const usOpenHandleBase: React.CSSProperties = {
    position: "absolute",
    top: 10,
    width: 18,
    height: 23,
    border: "4px solid rgba(248,250,252,0.94)",
    borderBottomColor: "transparent",
  };

  const usOpenStem: React.CSSProperties = {
    width: 10,
    height: 17,
    borderRadius: 3,
    background: "linear-gradient(180deg, #f8fafc, #94a3b8 42%, #153e75)",
  };

  const usOpenBase: React.CSSProperties = {
    width: 54,
    height: 11,
    borderRadius: "9px 9px 4px 4px",
    background: "linear-gradient(180deg, #b91c1c 0 22%, #f8fafc 22% 36%, #0b2a5b 36% 100%)",
    border: "1px solid rgba(255,255,255,0.55)",
  };

  const usOpenStarAccent: React.CSSProperties = {
    position: "absolute",
    right: -1,
    top: -3,
    width: 17,
    height: 17,
    background: "#ffffff",
    clipPath: "polygon(50% 0%, 61% 34%, 98% 35%, 68% 56%, 79% 92%, 50% 70%, 21% 92%, 32% 56%, 2% 35%, 39% 34%)",
    filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.42))",
  };

  const usOpenCupRotor: React.CSSProperties = {
    position: "relative",
    width: 44,
    height: 39,
    transformStyle: "preserve-3d",
    animation: "usOpenTrophySpin 14s linear infinite",
  };

  const usOpenCupFront: React.CSSProperties = {
    ...usOpenCup,
    backfaceVisibility: "hidden",
  };

  const usOpenCupBack: React.CSSProperties = {
    ...usOpenCup,
    backfaceVisibility: "hidden",
    transform: "rotateY(180deg)",
    backgroundImage:
      "linear-gradient(rgba(7,29,66,0.08), rgba(7,29,66,0.22)), url('/4play-logo.png')",
    backgroundSize: "cover",
    backgroundPosition: "center 15%",
    border: "1px solid rgba(255,255,255,0.94)",
  };

  const britishOpenWinnerTile: React.CSSProperties = {
    ...winnerTile,
    minHeight: 106,
    padding: 16,
    background:
      "linear-gradient(135deg, rgba(127,29,29,0.92), rgba(248,250,252,0.16) 42%, rgba(2,6,23,0.94) 100%)",
    border: "1px solid rgba(248,250,252,0.46)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.18), 0 16px 34px rgba(0,0,0,0.28), 0 0 22px rgba(220,38,38,0.16)",
  };

  const britishOpenTrophyWrap: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto auto",
    gap: 14,
    alignItems: "center",
    justifyContent: "end",
    minWidth: 150,
  };

  const britishOpenTrophy: React.CSSProperties = {
    position: "relative",
    width: 70,
    height: 80,
    display: "grid",
    justifyItems: "center",
    alignItems: "end",
  };

  const britishOpenCup: React.CSSProperties = {
    position: "relative",
    width: 44,
    height: 39,
    display: "grid",
    placeItems: "center",
    borderRadius: "7px 7px 18px 18px",
    background:
      "linear-gradient(90deg, #f8fafc 0 42%, #b91c1c 42% 58%, #f8fafc 58% 100%)",
    border: "1px solid rgba(255,255,255,0.94)",
    boxShadow:
      "inset 0 5px 10px rgba(255,255,255,0.48), 0 0 24px rgba(248,250,252,0.24)",
  };

  const britishOpenCupInscription: React.CSSProperties = {
    width: 32,
    minHeight: 22,
    display: "grid",
    placeItems: "center",
    borderRadius: 5,
    background:
      "linear-gradient(180deg, rgba(127,29,29,0.98), rgba(69,10,10,0.96))",
    border: "1px solid rgba(248,250,252,0.82)",
    color: "#ffffff",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 5,
    fontWeight: 900,
    lineHeight: 0.94,
    textAlign: "center",
    textTransform: "uppercase",
    textShadow: "0 1px 1px rgba(0,0,0,0.58)",
  };

  const britishOpenHandleBase: React.CSSProperties = {
    position: "absolute",
    top: 10,
    width: 18,
    height: 23,
    border: "4px solid rgba(248,250,252,0.94)",
    borderBottomColor: "transparent",
  };

  const britishOpenStem: React.CSSProperties = {
    width: 10,
    height: 17,
    borderRadius: 3,
    background: "linear-gradient(180deg, #f8fafc, #b91c1c)",
  };

  const britishOpenBase: React.CSSProperties = {
    width: 54,
    height: 11,
    borderRadius: "9px 9px 4px 4px",
    background:
      "linear-gradient(90deg, #f8fafc 0 38%, #b91c1c 38% 62%, #f8fafc 62% 100%)",
    border: "1px solid rgba(255,255,255,0.58)",
  };

  const britishOpenFlagAccent: React.CSSProperties = {
    position: "absolute",
    right: -2,
    top: -3,
    width: 18,
    height: 14,
    borderRadius: 2,
    background:
      "linear-gradient(90deg, transparent 0 42%, #b91c1c 42% 58%, transparent 58% 100%), linear-gradient(180deg, transparent 0 38%, #b91c1c 38% 62%, transparent 62% 100%), #f8fafc",
    border: "1px solid rgba(255,255,255,0.9)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.34)",
  };

  return (
    <main style={shell}>
      <style>{`
        @keyframes usOpenTrophySpin {
          0%, 8% { transform: rotateY(0deg); }
          42%, 58% { transform: rotateY(180deg); }
          92%, 100% { transform: rotateY(360deg); }
        }
        .us-open-trophy-rotor:hover { animation-play-state: paused !important; }
        @media (prefers-reduced-motion: reduce) {
          .us-open-trophy-rotor { animation: none !important; }
        }
      `}</style>
      <div style={content}>
        <img src="/4play-banner.png" alt="4Play Golf" style={bannerStyle} />

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
          <Link href="/driver" style={gamesLinkStyle}>
            4Play Games
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

                <div
                  style={
                    trophyBannerFor(row.tournament_name)
                      ? tournamentBannerStage
                      : undefined
                  }
                >
                  {trophyBannerFor(row.tournament_name) ? (
                    <img
                      src={trophyBannerFor(row.tournament_name)}
                      alt={`${row.tournament_name} 4Play characters`}
                      style={{
                        ...tournamentBannerStyle,
                        objectPosition: isUsOpen2026(row.tournament_name)
                          ? "center 18%"
                          : isBritishOpen2026(row.tournament_name)
                          ? "center 28%"
                          : "center 35%",
                      }}
                    />
                  ) : null}

                  <div
                    style={
                      trophyBannerFor(row.tournament_name)
                        ? tournamentWinnerOverlay
                        : { display: "grid", gap: 8 }
                    }
                  >
                  {row.winners.map((winner) => {
                    const useMastersTheme = isMasters2026(row.tournament_name);
                    const usePgaTheme = isPgaChampionship2026(row.tournament_name);
                    const useUsOpenTheme = isUsOpen2026(row.tournament_name);
                    const useBritishOpenTheme = isBritishOpen2026(row.tournament_name);
                    const themedWinnerStyle = useMastersTheme
                      ? mastersWinnerTile
                      : usePgaTheme
                      ? pgaWinnerTile
                      : useUsOpenTheme
                      ? usOpenWinnerTile
                      : useBritishOpenTheme
                      ? britishOpenWinnerTile
                      : winnerTile;
                    const overlayBackground = useMastersTheme
                      ? "rgba(2,44,34,0.68)"
                      : usePgaTheme
                      ? "rgba(8,22,48,0.68)"
                      : useUsOpenTheme
                      ? "rgba(5,23,54,0.70)"
                      : useBritishOpenTheme
                      ? "rgba(127,29,29,0.68)"
                      : "rgba(2,6,23,0.70)";
                    const winnerStyle = trophyBannerFor(row.tournament_name)
                      ? {
                          ...themedWinnerStyle,
                          minHeight: 82,
                          padding: "10px 12px",
                          background: overlayBackground,
                          backdropFilter: "blur(8px)",
                          WebkitBackdropFilter: "blur(8px)",
                          border: useUsOpenTheme || useBritishOpenTheme
                            ? "1px solid rgba(248,250,252,0.46)"
                            : themedWinnerStyle.border,
                        }
                      : themedWinnerStyle;

                    return (
                      <div
                        key={`${row.tournament_id}-${winner.user_id}`}
                        style={winnerStyle}
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

                        <div
                          style={
                            useMastersTheme
                              ? mastersTrophyWrap
                              : usePgaTheme
                              ? pgaTrophyWrap
                              : useUsOpenTheme
                              ? usOpenTrophyWrap
                              : useBritishOpenTheme
                              ? britishOpenTrophyWrap
                              : undefined
                          }
                        >
                          {useMastersTheme ? (
                            <div style={mastersTrophy} aria-hidden="true">
                              <div
                                style={{
                                  ...mastersHandleBase,
                                  left: 1,
                                  borderRight: "none",
                                  borderRadius: "12px 0 0 12px",
                                }}
                              />
                              <div
                                style={{
                                  ...mastersHandleBase,
                                  right: 1,
                                  borderLeft: "none",
                                  borderRadius: "0 12px 12px 0",
                                }}
                              />
                              <div style={mastersGolfBall} />
                              <div style={mastersCup}>
                                <div style={mastersCupInscription}>
                                  <span>4Play</span>
                                  <span>Masters</span>
                                  <span>Champ 26</span>
                                </div>
                              </div>
                              <div style={mastersStem} />
                              <div style={mastersBase} />
                            </div>
                          ) : null}

                          {usePgaTheme ? (
                            <div style={pgaTrophy} aria-hidden="true">
                              <div
                                style={{
                                  ...pgaHandleBase,
                                  left: 1,
                                  borderRight: "none",
                                  borderRadius: "12px 0 0 12px",
                                }}
                              />
                              <div
                                style={{
                                  ...pgaHandleBase,
                                  right: 1,
                                  borderLeft: "none",
                                  borderRadius: "0 12px 12px 0",
                                }}
                              />
                              <div style={pgaBlueAccent} />
                              <div style={pgaCup}>
                                <div style={pgaCupInscription}>
                                  <span>4Play</span>
                                  <span>PGA</span>
                                  <span>Champ 26</span>
                                </div>
                              </div>
                              <div style={pgaStem} />
                              <div style={pgaBase} />
                            </div>
                          ) : null}

                          {useUsOpenTheme ? (
                            <div style={usOpenTrophy} aria-hidden="true">
                              <div
                                style={{
                                  ...usOpenHandleBase,
                                  left: 1,
                                  borderRight: "none",
                                  borderRadius: "15px 0 0 15px",
                                }}
                              />
                              <div
                                style={{
                                  ...usOpenHandleBase,
                                  right: 1,
                                  borderLeft: "none",
                                  borderRadius: "0 15px 15px 0",
                                }}
                              />
                              <div style={usOpenStarAccent} />
                              <div
                                className="us-open-trophy-rotor"
                                style={usOpenCupRotor}
                              >
                                <div style={usOpenCupFront}>
                                  <div style={usOpenCupInscription}>
                                    <span>4Play</span>
                                    <span>U.S. Open</span>
                                    <span>Champ 26</span>
                                  </div>
                                </div>
                                <div style={usOpenCupBack} />
                              </div>
                              <div style={usOpenStem} />
                              <div style={usOpenBase} />
                            </div>
                          ) : null}

                          {useBritishOpenTheme ? (
                            <div style={britishOpenTrophy} aria-hidden="true">
                              <div
                                style={{
                                  ...britishOpenHandleBase,
                                  left: 1,
                                  borderRight: "none",
                                  borderRadius: "15px 0 0 15px",
                                }}
                              />
                              <div
                                style={{
                                  ...britishOpenHandleBase,
                                  right: 1,
                                  borderLeft: "none",
                                  borderRadius: "0 15px 15px 0",
                                }}
                              />
                              <div style={britishOpenFlagAccent} />
                              <div style={britishOpenCup}>
                                <div style={britishOpenCupInscription}>
                                  <span>4Play</span>
                                  <span>British</span>
                                  <span>Open 26</span>
                                </div>
                              </div>
                              <div style={britishOpenStem} />
                              <div style={britishOpenBase} />
                            </div>
                          ) : null}

                          <div
                            style={
                              useMastersTheme || usePgaTheme || useUsOpenTheme || useBritishOpenTheme
                                ? { ...mastersScoreWrap, fontSize: 22, fontWeight: 900 }
                                : { fontSize: 22, fontWeight: 900 }
                            }
                          >
                            {fmtScore(winner.total_strokes)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}

