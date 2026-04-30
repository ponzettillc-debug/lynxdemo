"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Phase = "ready" | "power" | "accuracy" | "flight" | "result" | "complete";
type Club = {
  name: string;
  max: number;
  min: number;
  putter?: boolean;
};
type Hole = {
  yards: number;
  par: number;
  dogleg: number;
  water: "left" | "right" | "none";
};
type RoundScore = {
  total_score: number;
  total_par: number;
  holes: number[];
  created_at?: string;
  display_name?: string;
};

const LOCAL_KEY = "4play_tee_off_scores_v1";
const CLUBS: Club[] = [
  { name: "DRIVER", max: 260, min: 150 },
  { name: "3 WOOD", max: 225, min: 135 },
  { name: "7 IRON", max: 165, min: 85 },
  { name: "WEDGE", max: 105, min: 25 },
  { name: "PUTTER", max: 65, min: 1, putter: true },
];
const COURSE: Hole[] = [
  { yards: 365, par: 4, dogleg: 0, water: "right" },
  { yards: 142, par: 3, dogleg: -8, water: "left" },
  { yards: 506, par: 5, dogleg: 10, water: "right" },
  { yards: 318, par: 4, dogleg: -12, water: "none" },
  { yards: 178, par: 3, dogleg: 4, water: "right" },
  { yards: 437, par: 4, dogleg: 12, water: "left" },
  { yards: 489, par: 5, dogleg: -10, water: "none" },
  { yards: 296, par: 4, dogleg: 7, water: "right" },
  { yards: 391, par: 4, dogleg: 0, water: "left" },
];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function scoreName(strokes: number, par: number) {
  const rel = strokes - par;
  if (rel <= -2) return "EAGLE";
  if (rel === -1) return "BIRDIE";
  if (rel === 0) return "PAR";
  if (rel === 1) return "BOGEY";
  return `+${rel}`;
}

export default function TeeOffPage() {
  const [session, setSession] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [holeIndex, setHoleIndex] = useState(0);
  const [remaining, setRemaining] = useState(COURSE[0].yards);
  const [clubName, setClubName] = useState(CLUBS[0].name);
  const [power, setPower] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [accuracyDir, setAccuracyDir] = useState(-1);
  const [strokes, setStrokes] = useState(0);
  const [holeScores, setHoleScores] = useState<number[]>([]);
  const [message, setMessage] = useState("SELECT CLUB, CLICK / TAP TO START SWING");
  const [ballX, setBallX] = useState(30);
  const [ballY, setBallY] = useState(82);
  const [tail, setTail] = useState<Array<{ x: number; y: number }>>([]);
  const [scores, setScores] = useState<RoundScore[]>([]);
  const [storageMode, setStorageMode] = useState("local");
  const flightRef = useRef({ started: 0, curve: 0, carryPct: 0 });

  const hole = COURSE[holeIndex];
  const club = CLUBS.find((c) => c.name === clubName) || CLUBS[0];
  const totalPar = COURSE.reduce((sum, h) => sum + h.par, 0);
  const totalStrokes = holeScores.reduce((sum, s) => sum + s, 0) + (phase === "complete" ? 0 : strokes);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session);
    });
  }, []);

  useEffect(() => {
    if (phase !== "power") return;
    const id = setInterval(() => setPower((prev) => clamp(prev + 2.6, 0, 100)), 24);
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
      const t = clamp(elapsed / 1250, 0, 1);
      const landingX = clamp(50 + flightRef.current.curve * 0.75 + hole.dogleg, 12, 88);
      const x = 30 + (landingX - 30) * t;
      const y = 82 - t * (38 + flightRef.current.carryPct * 35) - Math.sin(t * Math.PI) * 14;
      setBallX(x);
      setBallY(y);
      setTail((prev) => [...prev.slice(-8), { x, y }]);
      if (t >= 1) {
        clearInterval(id);
        setPhase("result");
      }
    }, 33);
    return () => clearInterval(id);
  }, [phase, hole.dogleg]);

  async function loadScores() {
    const localScores = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as RoundScore[];
    setScores(localScores.slice(0, 10));
    const token = await supabase.auth.getSession().then(({ data }) => data.session?.access_token || "");
    if (!token) return;
    const r = await fetch("/api/tee-off-scores", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (j?.ok && j.storage === "supabase") {
      setStorageMode("supabase");
      setScores((j.scores ?? []) as RoundScore[]);
    } else {
      setStorageMode("local");
    }
  }

  useEffect(() => {
    if (session) loadScores();
  }, [session]);

  function saveLocalScore(row: RoundScore) {
    const next = [row, ...scores]
      .sort((a, b) => a.total_score - b.total_score || new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 10);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    setScores(next);
  }

  async function saveRound(row: RoundScore) {
    saveLocalScore(row);
    const token = await supabase.auth.getSession().then(({ data }) => data.session?.access_token || "");
    if (!token) return;
    const r = await fetch("/api/tee-off-scores", {
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

  function resetSwing(nextMessage = "SELECT CLUB, CLICK / TAP TO START SWING") {
    setPower(0);
    setAccuracy(100);
    setAccuracyDir(-1);
    setTail([]);
    setBallX(30);
    setBallY(82);
    setMessage(nextMessage);
    setPhase("ready");
  }

  function completeHole(finalStrokes: number) {
    const nextScores = [...holeScores, finalStrokes];
    setHoleScores(nextScores);
    setMessage(`HOLE ${holeIndex + 1}: ${finalStrokes} (${scoreName(finalStrokes, hole.par)})`);
    if (holeIndex === COURSE.length - 1) {
      const row = {
        total_score: nextScores.reduce((sum, s) => sum + s, 0),
        total_par: totalPar,
        holes: nextScores,
        created_at: new Date().toISOString(),
      };
      saveRound(row);
      setPhase("complete");
      return;
    }
    const nextHole = COURSE[holeIndex + 1];
    setHoleIndex((idx) => idx + 1);
    setRemaining(nextHole.yards);
    setStrokes(0);
    resetSwing(`HOLE ${holeIndex + 2} READY`);
  }

  function takeShot() {
    const nextStroke = strokes + 1;
    setStrokes(nextStroke);

    if (club.putter) {
      const remainingFeet = Math.round(remaining * 3);
      const puttRollFeet = Math.round((power / 100) * club.max);
      const missFeet = Math.abs(remainingFeet - puttRollFeet);
      if (missFeet <= 2 || remainingFeet <= 2) {
        setRemaining(0);
        setMessage("IN THE CUP");
        completeHole(nextStroke);
        return;
      }
      setRemaining(Math.max(1, Math.round(missFeet)) / 3);
      setMessage(`${puttRollFeet} FT PUTT - ${Math.max(1, Math.round(missFeet))} FT LEFT`);
      resetSwing();
      return;
    }

    const centerMiss = Math.abs(accuracy - 50);
    const accuracyScore = Math.round(clamp(100 - centerMiss * 2, 0, 100));
    const carry = Math.round(clamp(club.min + (club.max - club.min) * (power / 100) - centerMiss * 0.45, 1, club.max + 12));
    const offline = Math.round((accuracy - 50) / 3 + hole.dogleg * 0.35);
    const newRemaining = Math.max(0, Math.round(Math.abs(remaining - carry) + Math.abs(offline) * 0.55));

    flightRef.current.curve = offline;
    flightRef.current.carryPct = clamp(carry / Math.max(1, hole.yards), 0.18, 1);

    if (newRemaining <= 2) {
      setRemaining(0);
      setMessage(`HOLED OUT! ${carry} YDS | ACC ${accuracyScore}`);
      setPhase("flight");
      setTimeout(() => completeHole(nextStroke), 1320);
      return;
    }

    setRemaining(newRemaining);
    setMessage(`${carry} YDS | ACC ${accuracyScore} | ${newRemaining} YDS LEFT`);
    setPhase("flight");
  }

  function handleBoardClick() {
    if (phase === "complete") return;
    if (phase === "ready" || phase === "result") {
      setPower(0);
      setAccuracy(100);
      setAccuracyDir(-1);
      setTail([]);
      setMessage(club.putter ? "CLICK / TAP TO SET PUTT DISTANCE" : "CLICK / TAP TO LOCK POWER");
      setPhase("power");
      return;
    }
    if (phase === "power") {
      if (club.putter) {
        takeShot();
      } else {
        setAccuracy(100);
        setAccuracyDir(-1);
        setMessage("CLICK / TAP ON THE RED LINE");
        setPhase("accuracy");
      }
      return;
    }
    if (phase === "accuracy") takeShot();
  }

  function newRound() {
    setHoleIndex(0);
    setRemaining(COURSE[0].yards);
    setStrokes(0);
    setHoleScores([]);
    resetSwing("NEW ROUND READY");
  }

  const accuracyScore = Math.round(clamp(100 - Math.abs(accuracy - 50) * 2, 0, 100));
  const meterLabel = phase === "accuracy" ? `${accuracyScore}` : `${Math.round(power)}%`;
  const ballSize = clamp(12 - ((82 - ballY) / 73) * 7, 5, 12);
  const completedPar = holeScores.reduce((sum, _, idx) => sum + COURSE[idx].par, 0);
  const completedStrokes = holeScores.reduce((sum, s) => sum + s, 0);
  const relScore = completedStrokes - completedPar;
  const remainingLabel = club.putter ? `${Math.round(remaining * 3)} FT` : `${Math.round(remaining)} YDS`;
  const status = useMemo(() => {
    if (phase === "complete") return `ROUND COMPLETE: ${holeScores.reduce((sum, s) => sum + s, 0)} ON PAR ${totalPar}`;
    if (remaining <= 0) return message;
    return `${message} | ${remainingLabel} LEFT`;
  }, [phase, holeScores, totalPar, remaining, remainingLabel, message]);

  const page: React.CSSProperties = {
    minHeight: "100vh",
    background: "#050b18",
    color: "#7cff9b",
    fontFamily: "Consolas, 'Courier New', monospace",
    padding: 18,
  };

  const panel: React.CSSProperties = {
    maxWidth: 1060,
    margin: "0 auto",
    border: "2px solid #1ee26c",
    background: "#07111f",
    boxShadow: "0 0 0 4px #020617, 0 0 34px rgba(34,197,94,0.22)",
    padding: 16,
  };

  return (
    <main style={page}>
      <div style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#d9ffe2", fontSize: 28 }}>4PLAY TEE OFF</h1>
            <div style={{ marginTop: 6 }}>BUXTON-HOLLIS CC - 9 HOLES ONLY</div>
          </div>
          <nav style={{ display: "flex", gap: 10 }}>
            <Link href="/driver" style={{ color: "#7dd3fc" }}>DRIVER</Link>
            <Link href="/leaderboard" style={{ color: "#7dd3fc" }}>LEADERBOARD</Link>
            <Link href="/" style={{ color: "#7dd3fc" }}>HOME</Link>
          </nav>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 16 }}>
          {CLUBS.map((c) => (
            <button
              key={c.name}
              type="button"
              disabled={phase === "power" || phase === "accuracy" || phase === "flight" || phase === "complete"}
              onClick={() => setClubName(c.name)}
              style={{
                minHeight: 38,
                border: `2px solid ${clubName === c.name ? "#fde047" : "#7cff9b"}`,
                background: clubName === c.name ? "#17351f" : "#020617",
                color: "#d9ffe2",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14, color: "#fde68a" }}>
          HOLE {holeIndex + 1} / 9 | PAR {hole.par} | {hole.yards} YDS | STROKES {strokes} | TOTAL {totalStrokes} ({relScore >= 0 ? "+" : ""}{relScore})
        </div>
        <div style={{ marginTop: 8 }}>{status}</div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{phase === "accuracy" ? "ACCURACY" : club.putter ? "PUTT DISTANCE" : "POWER"}</span>
            <span>{meterLabel}</span>
          </div>
          <div style={{ position: "relative", height: 22, border: "2px solid #7cff9b", background: "#020617", marginTop: 6, overflow: "hidden" }}>
            {phase === "accuracy" ? (
              <>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #ef4444, #facc15, #22c55e 47%, #22c55e 53%, #facc15, #ef4444)", opacity: 0.8 }} />
                <div style={{ position: "absolute", left: "50%", top: -4, width: 3, height: 30, background: "#ef4444", boxShadow: "0 0 10px #ef4444", transform: "translateX(-50%)" }} />
                <div style={{ position: "absolute", left: `${clamp(accuracy, 0, 100)}%`, top: -5, width: 5, height: 32, background: "#d9ffe2", boxShadow: "0 0 10px #d9ffe2", transform: "translateX(-50%)" }} />
              </>
            ) : (
              <div style={{ width: `${clamp(power, 0, 100)}%`, height: "100%", background: "linear-gradient(90deg, #22c55e, #facc15, #ef4444)" }} />
            )}
          </div>
        </div>

        <div
          onClick={handleBoardClick}
          style={{
            position: "relative",
            height: 390,
            marginTop: 18,
            border: "2px solid #1ee26c",
            background: "linear-gradient(#0f172a 0 36%, #12351f 36% 100%)",
            overflow: "hidden",
            cursor: phase === "flight" || phase === "complete" ? "default" : "crosshair",
          }}
        >
          <div style={{ position: "absolute", left: "18%", top: "6%", width: "64%", height: "94%", background: "#1e7b35", clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)" }} />
          <div style={{ position: "absolute", left: "36%", top: "10%", width: "28%", height: "90%", background: "repeating-linear-gradient(180deg, rgba(217,255,226,0.12) 0 2px, transparent 2px 24px)", clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)" }} />
          {hole.water !== "none" ? (
            <div
              style={{
                position: "absolute",
                [hole.water]: 0,
                top: "34%",
                width: "18%",
                height: "66%",
                background: "repeating-linear-gradient(135deg, #0ea5e9 0 8px, #075985 8px 16px)",
                opacity: 0.82,
              }}
            />
          ) : null}
          <div style={{ position: "absolute", left: `${49 + hole.dogleg * 0.18}%`, top: "10%", width: 3, height: 42, background: "#d9ffe2" }} />
          <div style={{ position: "absolute", left: `${49.4 + hole.dogleg * 0.18}%`, top: "10%", width: 26, height: 15, background: "#ef4444", clipPath: "polygon(0 0, 100% 34%, 0 68%)" }} />
          <div style={{ position: "absolute", left: `${47.5 + hole.dogleg * 0.18}%`, top: "24%", width: 44, height: 10, border: "1px solid #d9ffe2", borderRadius: 999, opacity: 0.65 }} />
          <div style={{ position: "absolute", left: 14, bottom: 94, width: 134, border: "2px solid #7cff9b", background: "#07111f", color: "#d9ffe2", padding: 6, fontSize: 11, lineHeight: 1.25 }}>
            <div>BUXTON-HOLLIS CC</div>
            <div>HOLE {holeIndex + 1}</div>
            <div>{hole.yards} YARDS</div>
          </div>
          <div style={{ position: "absolute", left: 26, bottom: 42, width: 92, height: 18, background: "#22543d" }} />
          <div style={{ position: "absolute", left: 59, bottom: 80, width: 12, height: 62, background: "#d9ffe2" }} />
          <div style={{ position: "absolute", left: 52, bottom: 133, width: 26, height: 26, borderRadius: 999, background: "#d9ffe2" }} />
          <div style={{ position: "absolute", left: 37, bottom: 102, width: 48, height: 4, background: "#d9ffe2", transform: "rotate(-24deg)" }} />
          <div style={{ position: "absolute", left: 67, bottom: 43, width: 4, height: 48, background: "#d9ffe2", transform: "rotate(-18deg)" }} />
          <div style={{ position: "absolute", left: 57, bottom: 43, width: 4, height: 48, background: "#d9ffe2", transform: "rotate(18deg)" }} />

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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
          <section>
            <h2 style={{ marginBottom: 8, color: "#d9ffe2" }}>SCORECARD</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(9, minmax(28px, 1fr))", gap: 4, fontSize: 12 }}>
              {COURSE.map((h, idx) => (
                <div key={idx} style={{ border: "1px solid #7cff9b", padding: 5, minHeight: 42, color: idx === holeIndex && phase !== "complete" ? "#fde047" : "#d9ffe2" }}>
                  <div>H{idx + 1}</div>
                  <div>P{h.par}</div>
                  <div>{holeScores[idx] ?? "--"}</div>
                </div>
              ))}
            </div>
            {phase === "complete" ? (
              <button type="button" onClick={newRound} style={{ marginTop: 12, minHeight: 36, border: "2px solid #7cff9b", background: "#020617", color: "#d9ffe2", fontFamily: "inherit", cursor: "pointer" }}>
                NEW ROUND
              </button>
            ) : null}
          </section>

          <section>
            <h2 style={{ marginBottom: 8, color: "#d9ffe2" }}>TOP 10 NINE-HOLE ROUNDS ({storageMode.toUpperCase()})</h2>
            {scores.length === 0 ? (
              <div>NO COMPLETED ROUNDS YET.</div>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 26 }}>
                {scores.map((s, idx) => (
                  <li key={`${s.total_score}-${idx}`} style={{ marginBottom: 4 }}>
                    {s.display_name ? `${s.display_name}: ` : ""}{s.total_score} ON PAR {s.total_par} | {s.holes.join("-")}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
