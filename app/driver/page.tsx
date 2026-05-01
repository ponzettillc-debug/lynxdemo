"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Phase = "ready" | "power" | "accuracy" | "flight" | "result";
type ScoreRow = {
  distance_yards: number;
  wind_mph: number;
  power: number;
  accuracy: number;
  created_at?: string;
};
type DriveFlag = {
  id: string;
  distance_yards: number;
  x: number;
  y: number;
};

const LOCAL_KEY = "4play_driver_scores_v1";
const FLAG_KEY = "4play_driver_flags_v1";
const HOLE_IN_ONE_MIN = 362;
const HOLE_IN_ONE_MAX = 373;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function windText(wind: number) {
  if (wind === 0) return "CALM";
  return wind > 0 ? `TAILWIND +${wind}` : `HEADWIND ${wind}`;
}

function isHoleInOne(score: ScoreRow | null) {
  return !!score && score.accuracy >= 90 && score.distance_yards >= HOLE_IN_ONE_MIN && score.distance_yards <= HOLE_IN_ONE_MAX;
}

function driveTaunt(score: ScoreRow) {
  if (score.distance_yards < 140) return "DID THE BALL FILE A RESTRAINING ORDER?";
  if (score.power < 45) return "THAT SWING HAD A CURFEW.";
  if (score.accuracy < 35) return "FORE LEFT, RIGHT, AND MAYBE PARKING LOT.";
  if (score.distance_yards < 210) return "THE CART PATH IS UNIMPRESSED.";
  if (score.accuracy < 55) return "THAT ONE NEEDS A PASSPORT.";
  return "";
}

export default function DriverPage() {
  const [session, setSession] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [power, setPower] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [accuracyDir, setAccuracyDir] = useState(-1);
  const [wind, setWind] = useState(() => Math.round(Math.random() * 30 - 15));
  const [ballX, setBallX] = useState(4);
  const [ballY, setBallY] = useState(70);
  const [tail, setTail] = useState<Array<{ x: number; y: number }>>([]);
  const [result, setResult] = useState<ScoreRow | null>(null);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [driveFlags, setDriveFlags] = useState<DriveFlag[]>([]);
  const [storageMode, setStorageMode] = useState("local");
  const [swingNotice, setSwingNotice] = useState("");
  const flightRef = useRef({ started: 0, distance: 0, curve: 0 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session);
    });
    setDriveFlags(JSON.parse(localStorage.getItem(FLAG_KEY) || "[]") as DriveFlag[]);
  }, []);

  useEffect(() => {
    if (phase !== "power") return;
    const id = setInterval(() => {
      setPower((prev) => clamp(prev + 2.8, 0, 100));
    }, 24);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "accuracy") return;
    const id = setInterval(() => {
      setAccuracy((prev) => {
        let next = prev + accuracyDir * 4.8;
        if (next >= 100) {
          next = 100;
          setAccuracyDir(-1);
        }
        if (next <= 0) {
          next = 0;
          setAccuracyDir(1);
        }
        return next;
      });
    }, 24);
    return () => clearInterval(id);
  }, [phase, accuracyDir]);

  useEffect(() => {
    if (phase !== "flight") return;
    flightRef.current.started = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - flightRef.current.started;
      const t = clamp(elapsed / 1700, 0, 1);
      const landingX = clamp(50 + flightRef.current.curve * 0.58, 13, 88);
      const x = 30 + (landingX - 30) * t;
      const arc = Math.sin(t * Math.PI) * 18;
      const curve = flightRef.current.curve * t * t;
      const y = 82 - t * 63 - arc + Math.abs(curve) * 0.06;
      setBallX(x);
      setBallY(y);
      setTail((prev) => [...prev.slice(-8), { x, y }]);
      if (t >= 1) {
        clearInterval(id);
        setPhase("result");
      }
    }, 33);
    return () => clearInterval(id);
  }, [phase]);

  async function loadScores() {
    const localScores = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as ScoreRow[];
    setScores(localScores.slice(0, 10));
    const token = await supabase.auth.getSession().then(({ data }) => data.session?.access_token || "");
    if (!token) return;
    const r = await fetch("/api/driver-scores", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (j?.ok && j.storage === "supabase") {
      setStorageMode("supabase");
      setScores((j.scores ?? []) as ScoreRow[]);
    } else {
      setStorageMode("local");
    }
  }

  useEffect(() => {
    if (session) loadScores();
  }, [session]);

  function saveLocalScore(row: ScoreRow) {
    const next = [row, ...scores]
      .sort((a, b) => b.distance_yards - a.distance_yards)
      .slice(0, 10);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    setScores(next);
  }

  function addDriveFlag(row: ScoreRow, curve: number) {
    const nextFlag = {
      id: `${row.created_at}-${row.distance_yards}-${Math.round(curve)}`,
      distance_yards: row.distance_yards,
      x: clamp(50 + curve * 0.58, 13, 88),
      y: clamp(82 - (row.distance_yards / 390) * 63, 16, 82),
    };
    setDriveFlags((prev) => {
      const next = [...prev, nextFlag].slice(-50);
      localStorage.setItem(FLAG_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function saveScore(row: ScoreRow) {
    saveLocalScore(row);
    const token = await supabase.auth.getSession().then(({ data }) => data.session?.access_token || "");
    if (!token) return;
    const r = await fetch("/api/driver-scores", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(row),
    });
    const j = await r.json().catch(() => ({}));
    if (j?.ok && j.storage === "supabase") {
      setStorageMode("supabase");
      await loadScores();
    }
  }

  function swingClick() {
    if (phase === "ready" || phase === "result") {
      setPower(0);
      setAccuracy(100);
      setAccuracyDir(-1);
      setWind(Math.round(Math.random() * 30 - 15));
      setTail([]);
      setBallX(30);
      setBallY(82);
      setResult(null);
      setSwingNotice("");
      setPhase("power");
      return;
    }

    if (phase === "power") {
      setAccuracy(100);
      setAccuracyDir(-1);
      setSwingNotice(power >= 97 ? "BOMB!" : "POWER LOCKED");
      setPhase("accuracy");
      return;
    }

    if (phase === "accuracy") {
      const centerMiss = Math.abs(accuracy - 50);
      const accuracyScore = Math.round(clamp(100 - centerMiss * 2, 0, 100));
      const straightPenalty = centerMiss * 1.45;
      const windBoost = wind * 1.8;
      const bombBonus = power >= 97 ? 14 : 0;
      const rawDistance = 145 + power * 2.25 + windBoost + bombBonus - straightPenalty;
      const distance = Math.round(clamp(rawDistance, 45, 390));
      const row = {
        distance_yards: distance,
        wind_mph: wind,
        power: Math.round(power),
        accuracy: accuracyScore,
        created_at: new Date().toISOString(),
      };
      const curve = (accuracy - 50) / 1.6 - wind / 3;
      flightRef.current.distance = distance;
      flightRef.current.curve = curve;
      setResult(row);
      setSwingNotice(isHoleInOne(row) ? "HOLE IN 1!!!" : power >= 97 ? "BOMB!" : accuracyScore >= 92 ? "PIPE!" : driveTaunt(row) || "AWAY!");
      addDriveFlag(row, curve);
      saveScore(row);
      setPhase("flight");
    }
  }

  const instruction = useMemo(() => {
    if (phase === "ready") return "CLICK / TAP TO START POWER";
    if (phase === "power") return "CLICK / TAP TO LOCK POWER";
    if (phase === "accuracy") return "CLICK / TAP ON THE RETURN AT THE RED LINE";
    if (phase === "flight") return "BALL IN FLIGHT...";
    return "CLICK / TAP TO TEE UP AGAIN";
  }, [phase]);

  const page: React.CSSProperties = {
    minHeight: "100vh",
    background: "#050b18",
    color: "#7cff9b",
    fontFamily: "Consolas, 'Courier New', monospace",
    padding: 18,
  };

  const panel: React.CSSProperties = {
    maxWidth: 980,
    margin: "0 auto",
    border: "2px solid #1ee26c",
    background: "#07111f",
    boxShadow: "0 0 0 4px #020617, 0 0 34px rgba(34,197,94,0.22)",
    padding: 16,
  };

  const accuracyScore = Math.round(clamp(100 - Math.abs(accuracy - 50) * 2, 0, 100));
  const meterLabel = phase === "accuracy" ? `${accuracyScore}` : `${Math.round(power)}%`;
  const ballSize = clamp(12 - ((82 - ballY) / 63) * 7, 5, 12);
  const resultLine = result
    ? `LAST DRIVE: ${result.distance_yards} YDS | POWER ${result.power}% | ACC ${result.accuracy} | WIND ${result.wind_mph}${result.power >= 97 ? " | BOMB!" : ""}${isHoleInOne(result) ? " | HOLE IN 1!!!" : ""}`
    : "LAST DRIVE: --";

  return (
    <main style={page} onClick={swingClick}>
      <div style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#d9ffe2", fontSize: 28 }}>4PLAY DRIVER</h1>
            <div style={{ marginTop: 6 }}>DRIVING RANGE SIMULATOR v1.0</div>
          </div>
          <nav style={{ display: "flex", gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <Link href="/leaderboard" style={{ color: "#7dd3fc" }}>LEADERBOARD</Link>
            <Link href="/" style={{ color: "#7dd3fc" }}>HOME</Link>
          </nav>
        </div>

        <div style={{ marginTop: 16, color: "#fde68a" }}>{instruction}</div>
        <div style={{ marginTop: 8 }}>WIND: {windText(wind)} MPH</div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{phase === "accuracy" ? "ACCURACY" : "POWER"}</span>
            <span>{meterLabel}</span>
          </div>
          <div style={{ position: "relative", height: 22, border: "2px solid #7cff9b", background: "#020617", marginTop: 6, overflow: "hidden" }}>
            {phase === "accuracy" ? (
              <>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #ef4444, #facc15, #22c55e 47%, #22c55e 53%, #facc15, #ef4444)", opacity: 0.8 }} />
                <div style={{ position: "absolute", left: "46%", top: 0, width: "8%", height: "100%", background: "rgba(34,197,94,0.24)" }} />
                <div style={{ position: "absolute", left: "50%", top: -4, width: 3, height: 30, background: "#ef4444", boxShadow: "0 0 10px #ef4444", transform: "translateX(-50%)" }} />
                <div style={{ position: "absolute", left: `${clamp(accuracy, 0, 100)}%`, top: -5, width: 5, height: 32, background: "#d9ffe2", boxShadow: "0 0 10px #d9ffe2", transform: "translateX(-50%)" }} />
              </>
            ) : (
              <div
                style={{
                  width: `${clamp(power, 0, 100)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #22c55e, #facc15, #ef4444)",
                }}
              />
            )}
          </div>
          {swingNotice ? <div style={{ marginTop: 8, color: "#fde047", fontSize: 18 }}>{swingNotice}</div> : null}
        </div>

        <div
          style={{
            position: "relative",
            height: 330,
            marginTop: 18,
            border: "2px solid #1ee26c",
            background:
              "linear-gradient(#0f172a 0 46%, #12351f 46% 100%), repeating-linear-gradient(90deg, transparent 0 18px, rgba(124,255,155,0.08) 18px 20px)",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", left: "31%", top: "15%", width: "38%", height: "85%", background: "#1e7b35", clipPath: "polygon(43% 0, 57% 0, 100% 100%, 0 100%)" }} />
          <div style={{ position: "absolute", left: "40%", top: "17%", width: "20%", height: "83%", background: "repeating-linear-gradient(180deg, rgba(217,255,226,0.11) 0 2px, transparent 2px 24px)", clipPath: "polygon(44% 0, 56% 0, 100% 100%, 0 100%)" }} />
          <div style={{ position: "absolute", right: 0, top: "38%", width: "19%", height: "62%", background: "repeating-linear-gradient(135deg, #0ea5e9 0 8px, #075985 8px 16px)", clipPath: "polygon(40% 0, 100% 0, 100% 100%, 0 100%)", opacity: 0.85 }} />
          <div style={{ position: "absolute", right: "3%", top: "44%", color: "#bae6fd", fontSize: 12 }}>~~~~ RIVER ~~~~</div>
          <div style={{ position: "absolute", left: "47.5%", top: "32%", width: 42, height: 9, border: "1px solid #d9ffe2", borderRadius: 999, opacity: 0.65 }} />
          <div style={{ position: "absolute", left: 16, top: 86, width: 152, border: "2px solid #7cff9b", background: "#07111f", color: "#d9ffe2", padding: 6, fontSize: 11, lineHeight: 1.25 }}>
            <div>BUXTON-HOLLIS CC</div>
            <div>HOLE 1</div>
            <div>365 YARDS</div>
          </div>
          <div style={{ position: "absolute", left: 26, bottom: 42, width: 92, height: 18, background: "#22543d" }} />
          <div style={{ position: "absolute", left: 59, bottom: 80, width: 12, height: 62, background: "#d9ffe2" }} />
          <div style={{ position: "absolute", left: 52, bottom: 133, width: 26, height: 26, borderRadius: 999, background: "#d9ffe2" }} />
          <div style={{ position: "absolute", left: 37, bottom: 102, width: 48, height: 4, background: "#d9ffe2", transform: "rotate(-24deg)" }} />
          <div style={{ position: "absolute", left: 67, bottom: 43, width: 4, height: 48, background: "#d9ffe2", transform: "rotate(-18deg)" }} />
          <div style={{ position: "absolute", left: 57, bottom: 43, width: 4, height: 48, background: "#d9ffe2", transform: "rotate(18deg)" }} />
          <div style={{ position: "absolute", left: 89, bottom: 126, width: 3, height: 68, background: "#cbd5e1", transform: "rotate(34deg)" }} />

          {driveFlags.map((flag, idx) => (
            <div
              key={flag.id}
              style={{
                position: "absolute",
                left: `${flag.x}%`,
                top: `${flag.y}%`,
                width: 56,
                height: 36,
                transform: "translate(-6px, -30px)",
                zIndex: 2 + idx,
              }}
            >
              <div style={{ position: "absolute", left: 5, top: 5, width: 2, height: 30, background: "#d9ffe2" }} />
              <div style={{ position: "absolute", left: 7, top: 2, minWidth: 46, height: 17, background: "#ef4444", color: "#fff7ed", fontSize: 10, lineHeight: "17px", paddingLeft: 4, clipPath: "polygon(0 0, 100% 0, 84% 50%, 100% 100%, 0 100%)" }}>
                {flag.distance_yards}
              </div>
            </div>
          ))}

          {tail.map((p, idx) => (
            <div
              key={`${p.x}-${idx}`}
              style={{
                position: "absolute",
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: 8 + idx * 2,
                height: 3,
                background: `rgba(125,211,252,${0.08 + idx * 0.06})`,
                borderRadius: 999,
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: `${ballX}%`,
              top: `${ballY}%`,
              width: ballSize,
              height: ballSize,
              borderRadius: 999,
              background: "#f8fafc",
              boxShadow: "0 0 12px #bae6fd",
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>

        <div style={{ marginTop: 14, color: "#d9ffe2" }}>
          {resultLine}
        </div>

        <section style={{ marginTop: 18 }}>
          <h2 style={{ marginBottom: 8, color: "#d9ffe2" }}>YOUR TOP 10 DRIVES ({storageMode.toUpperCase()})</h2>
          {scores.length === 0 ? (
            <div>NO DRIVES RECORDED YET.</div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 26 }}>
              {scores.map((s, idx) => (
                <li key={`${s.distance_yards}-${idx}`} style={{ marginBottom: 4 }}>
                  {s.distance_yards} YDS | PWR {s.power}% | ACC {s.accuracy} | WIND {s.wind_mph}
                  {isHoleInOne(s) ? " | HOLE IN 1!!!" : ""}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div style={{ marginTop: 20, borderTop: "1px solid rgba(124,255,155,0.35)", paddingTop: 14 }} onClick={(e) => e.stopPropagation()}>
          <Link
            href="/tee-off"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 38,
              padding: "0 18px",
              border: "2px solid #7cff9b",
              background: "#020617",
              color: "#d9ffe2",
              textDecoration: "none",
              boxShadow: "0 0 14px rgba(34,197,94,0.28)",
            }}
          >
            TEE OFF
          </Link>
        </div>
      </div>
    </main>
  );
}
