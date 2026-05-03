"use client";

import { useMemo } from "react";

const ROUND_IMAGES: Record<string, string> = {
  default: "/4play-logo.png",
  "1": "/4play_golf_thursday.png",
  "2": "/4play_golf_friday.png",
  "3": "/4play_golf_saturday.png",
  "4": "/4play_golf_sunday.png",
};

const ROUND_LABELS: Record<string, string> = {
  default: "4Play Golf",
  "1": "Round 1 Daily Image",
  "2": "Round 2 Daily Image",
  "3": "Round 3 Daily Image",
  "4": "Round 4 Daily Image",
};

export default function DailyLogoPage() {
  const round = useMemo(() => {
    if (typeof window === "undefined") return "default";
    const value = new URLSearchParams(window.location.search).get("round") ?? "default";
    return ROUND_IMAGES[value] ? value : "default";
  }, []);
  const imageSrc = ROUND_IMAGES[round];

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(34,197,94,0.08) 0%, rgba(15,23,42,1) 24%, rgba(2,6,23,1) 100%)",
        color: "#f8fafc",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <a
          href="/leaderboard"
          style={{
            textDecoration: "none",
            color: "#e2e8f0",
            fontWeight: 800,
            padding: "10px 15px",
            borderRadius: 999,
            background: "rgba(15,23,42,0.88)",
            border: "1px solid rgba(148,163,184,0.18)",
          }}
        >
          Back
        </a>
        <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 800 }}>{ROUND_LABELS[round]}</div>
      </nav>

      <section
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid rgba(148,163,184,0.14)",
          borderRadius: 22,
          background: "rgba(15,23,42,0.7)",
          boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
          overflow: "hidden",
          padding: 12,
        }}
      >
        <img
          src={imageSrc}
          alt={ROUND_LABELS[round]}
          style={{
            width: "100%",
            height: "100%",
            maxWidth: 1100,
            maxHeight: "calc(100vh - 140px)",
            objectFit: "contain",
            borderRadius: 14,
          }}
        />
      </section>
    </main>
  );
}
