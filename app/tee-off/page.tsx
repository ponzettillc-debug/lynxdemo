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
type SwingMode = "full" | "half" | "quarter";
type Lie = "fairway" | "green" | "sand";
type GolferLook = "flagBack" | "forwardCap" | "topHat" | "oldSchoolCap" | "longHair";
type Hole = {
  yards: number;
  par: number;
  dogleg: number;
  water: "left" | "right" | "none";
  green: string;
};
type RoundScore = {
  total_score: number;
  total_par: number;
  holes: number[];
  created_at?: string;
  display_name?: string;
};
type FlightState = {
  started: number;
  curve: number;
  carryPct: number;
  startX: number;
  startY: number;
  landingX: number;
  landingY: number;
};

const LOCAL_KEY = "4play_tee_off_scores_v1";
const GOLFER_LEFT = 39;
const BALL_START_X = 47;
const BALL_START_Y = 82;
const CLUBS: Club[] = [
  { name: "DRIVER", max: 260, min: 150 },
  { name: "3 WOOD", max: 225, min: 135 },
  { name: "7 IRON", max: 165, min: 85 },
  { name: "WEDGE", max: 105, min: 25 },
  { name: "CHIPPER", max: 25, min: 15 },
  { name: "PUTTER", max: 60, min: 1, putter: true },
];
const COURSE: Hole[] = [
  { yards: 365, par: 4, dogleg: 0, water: "right", green: "oval" },
  { yards: 250, par: 4, dogleg: -16, water: "none", green: "kidney" },
  { yards: 190, par: 3, dogleg: 0, water: "none", green: "long" },
  { yards: 500, par: 5, dogleg: 8, water: "none", green: "peanut" },
  { yards: 455, par: 5, dogleg: 5, water: "none", green: "round" },
  { yards: 165, par: 3, dogleg: 0, water: "none", green: "tilt" },
  { yards: 303, par: 4, dogleg: 2, water: "none", green: "double" },
  { yards: 251, par: 4, dogleg: 6, water: "none", green: "wide" },
  { yards: 404, par: 4, dogleg: -15, water: "none", green: "crown" },
];
const SAND_JOKES = [
  "GUY SPENDS MORE TIME IN THE SAND THAN A BEACH CHAIR",
  "BRING A RAKE AND A COOLER",
  "THAT ONE NEEDED SPF 50",
  "WELCOME TO THE PRIVATE BEACH",
];
const GOLFER_LOOKS: GolferLook[] = ["flagBack", "forwardCap", "topHat", "oldSchoolCap", "longHair"];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function randomGolferLook() {
  return GOLFER_LOOKS[Math.floor(Math.random() * GOLFER_LOOKS.length)] ?? "flagBack";
}

function randomRain() {
  return Math.random() < 0.05;
}

function scoreName(strokes: number, par: number) {
  const rel = strokes - par;
  if (rel <= -2) return "EAGLE";
  if (rel === -1) return "BIRDIE";
  if (rel === 0) return "PAR";
  if (rel === 1) return "BOGEY";
  return `+${rel}`;
}

function relativeScore(score: number, par: number) {
  const rel = score - par;
  if (rel === 0) return "E";
  return rel > 0 ? `+${rel}` : `${rel}`;
}

function scoreDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function windText(wind: number) {
  if (wind === 0) return "CALM";
  return wind > 0 ? `TAIL +${wind}` : `HEAD ${wind}`;
}

function greenShape(shape: string) {
  if (shape === "kidney") return "ellipse(42% 34% at 58% 48%)";
  if (shape === "long") return "ellipse(26% 44% at 50% 50%)";
  if (shape === "peanut") return "polygon(22% 28%, 42% 18%, 64% 24%, 78% 42%, 70% 66%, 48% 78%, 25% 66%, 16% 46%)";
  if (shape === "round") return "circle(36% at 50% 50%)";
  if (shape === "tilt") return "ellipse(34% 45% at 50% 50%)";
  if (shape === "double") return "polygon(28% 18%, 52% 22%, 72% 34%, 78% 58%, 62% 80%, 38% 76%, 20% 60%, 18% 34%)";
  if (shape === "wide") return "ellipse(44% 28% at 50% 50%)";
  if (shape === "crown") return "polygon(20% 34%, 36% 18%, 50% 28%, 64% 18%, 80% 34%, 76% 70%, 50% 84%, 24% 70%)";
  return "ellipse(36% 30% at 50% 50%)";
}

function distanceToTarget(afterForwardYards: number, lateralYards: number) {
  return Math.sqrt(afterForwardYards * afterForwardYards + lateralYards * lateralYards);
}

function teeDriverBonusFactor(accuracyScore: number) {
  if (accuracyScore >= 90) return 1.08 + Math.random() * 0.02;
  if (accuracyScore >= 80) return 1.05 + Math.random() * 0.02;
  return 1;
}

function puttSettings(feet: number) {
  if (feet <= 10) return { speed: 0.58, makeRange: 3 };
  if (feet <= 15) return { speed: 1.05, makeRange: 2.5 };
  if (feet <= 20) return { speed: 1.38, makeRange: 2 };
  if (feet <= 30) return { speed: 1.75, makeRange: 1.5 };
  if (feet <= 40) return { speed: 2.15, makeRange: 1 };
  return { speed: 2.75, makeRange: 1 };
}

function puttMeterMaxFeet(feet: number) {
  if (feet <= 15) return 15;
  if (feet <= 25) return 25;
  if (feet <= 50) return 50;
  return 60;
}

function puttMeterTicks(maxFeet: number) {
  if (maxFeet <= 15) return [5, 10, 15];
  if (maxFeet <= 25) return [5, 10, 15, 20, 25];
  if (maxFeet <= 50) return [5, 10, 15, 20, 25, 30, 40, 50];
  return [5, 10, 15, 20, 25, 30, 45, 60];
}

function puttSpeedLabel(feet: number) {
  if (feet <= 10) return "EASY";
  if (feet <= 15) return "QUICK";
  if (feet <= 20) return "FAST";
  if (feet <= 30) return "FASTER";
  if (feet <= 40) return "TOUCHY";
  return "WHITE KNUCKLE";
}

export default function TeeOffPage() {
  const [session, setSession] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [holeIndex, setHoleIndex] = useState(0);
  const [remaining, setRemaining] = useState(COURSE[0].yards);
  const [clubName, setClubName] = useState(CLUBS[0].name);
  const [swingMode, setSwingMode] = useState<SwingMode>("full");
  const [power, setPower] = useState(0);
  const [powerDir, setPowerDir] = useState(1);
  const [accuracy, setAccuracy] = useState(100);
  const [accuracyDir, setAccuracyDir] = useState(-1);
  const [strokes, setStrokes] = useState(0);
  const [holeScores, setHoleScores] = useState<number[]>([]);
  const [message, setMessage] = useState("SELECT CLUB, CLICK / TAP TO START SWING");
  const [lastShot, setLastShot] = useState("");
  const [wind, setWind] = useState(() => Math.round(Math.random() * 25 - 12));
  const [isRaining, setIsRaining] = useState(() => randomRain());
  const [golferLook, setGolferLook] = useState<GolferLook>(() => randomGolferLook());
  const [lie, setLie] = useState<Lie>("fairway");
  const [ballX, setBallX] = useState(BALL_START_X);
  const [ballY, setBallY] = useState(BALL_START_Y);
  const [tail, setTail] = useState<Array<{ x: number; y: number }>>([]);
  const [scores, setScores] = useState<RoundScore[]>([]);
  const [storageMode, setStorageMode] = useState("local");
  const flightRef = useRef<FlightState>({
    started: 0,
    curve: 0,
    carryPct: 0,
    startX: BALL_START_X,
    startY: BALL_START_Y,
    landingX: BALL_START_X,
    landingY: BALL_START_Y,
  });

  const hole = COURSE[holeIndex];
  const club = CLUBS.find((c) => c.name === clubName) || CLUBS[0];
  const modeFactor = club.name === "CHIPPER" && swingMode === "half" ? 0.6 : swingMode === "quarter" ? 0.25 : swingMode === "half" ? 0.5 : 1;
  const lieFactor = lie === "sand" && !club.putter ? 0.55 : 1;
  const offTeeDriverFactor = club.name === "DRIVER" && strokes > 0 ? 0.8 : 1;
  const effectiveClub = {
    ...club,
    max: Math.round(club.max * modeFactor * lieFactor * offTeeDriverFactor),
    min: Math.max(1, Math.round(club.min * modeFactor * lieFactor * offTeeDriverFactor)),
  };
  const currentPuttFeet = Math.max(1, Math.round(remaining * 3));
  const currentPuttSettings = puttSettings(currentPuttFeet);
  const totalPar = COURSE.reduce((sum, h) => sum + h.par, 0);
  const totalStrokes = holeScores.reduce((sum, s) => sum + s, 0) + (phase === "complete" ? 0 : strokes);
  function clubDisplayMax(c: Club) {
    const displayModeFactor = c.name === "CHIPPER" && swingMode === "half" ? 0.6 : swingMode === "quarter" ? 0.25 : swingMode === "half" ? 0.5 : 1;
    const displayLieFactor = lie === "sand" && !c.putter ? 0.55 : 1;
    const displayOffTeeDriverFactor = c.name === "DRIVER" && strokes > 0 ? 0.8 : 1;
    return Math.round(c.max * displayModeFactor * displayLieFactor * displayOffTeeDriverFactor);
  }

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
    const id = setInterval(() => {
      setPower((prev) => {
        const speed = club.putter ? currentPuttSettings.speed : 2.25;
        let next = prev + powerDir * speed;
        if (next >= 100) {
          next = 100;
          setPowerDir(-1);
        }
        if (next <= 0) {
          next = 0;
          setPowerDir(1);
        }
        return next;
      });
    }, 24);
    return () => clearInterval(id);
  }, [phase, powerDir, club.putter, currentPuttSettings.speed]);

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
      const smooth = 1 - Math.pow(1 - t, 2);
      const x =
        flightRef.current.startX +
        (flightRef.current.landingX - flightRef.current.startX) * smooth +
        Math.sin(t * Math.PI) * flightRef.current.curve * 0.08;
      const baseY =
        flightRef.current.startY +
        (flightRef.current.landingY - flightRef.current.startY) * smooth;
      const y = baseY - Math.sin(t * Math.PI) * (20 + flightRef.current.carryPct * 24);
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
    setPowerDir(1);
    setAccuracy(100);
    setAccuracyDir(-1);
    setTail([]);
    setBallX(BALL_START_X);
    setBallY(BALL_START_Y);
    setMessage(nextMessage);
    setPhase("ready");
  }

  function prepareFlight(offline: number, carryYards: number, remainingAfter: number) {
    const nextProgress = clamp(1 - remainingAfter / Math.max(1, hole.yards), 0, 0.96);
    const nextTargetTop = clamp(10 + nextProgress * 48, 10, 58);
    const landingX = clamp(50 + offline * 0.36 + hole.dogleg * 0.18, 24, 82);
    const landingY =
      remainingAfter <= 2
        ? clamp(nextTargetTop + 10, 18, 66)
        : remainingAfter <= 20
        ? clamp(nextTargetTop + 17, 30, 76)
        : clamp(nextTargetTop + 30, 46, 84);

    flightRef.current = {
      started: 0,
      curve: offline,
      carryPct: clamp(carryYards / Math.max(1, hole.yards), 0.18, 1),
      startX: BALL_START_X,
      startY: BALL_START_Y,
      landingX,
      landingY,
    };
  }

  function completeHole(finalStrokes: number) {
    const nextScores = [...holeScores, finalStrokes];
    setHoleScores(nextScores);
    setMessage(`HOLE ${holeIndex + 1}: ${finalStrokes} (${scoreName(finalStrokes, hole.par)})`);
    if (holeIndex === COURSE.length - 1) {
      const currentUser = session?.user;
      const row = {
        total_score: nextScores.reduce((sum, s) => sum + s, 0),
        total_par: totalPar,
        holes: nextScores,
        created_at: new Date().toISOString(),
        display_name:
          String(currentUser?.user_metadata?.display_name || "").trim() ||
          String(currentUser?.email || "").split("@")[0] ||
          "PLAYER",
      };
      saveRound(row);
      setPhase("complete");
      return;
    }
    const nextHole = COURSE[holeIndex + 1];
    setHoleIndex((idx) => idx + 1);
    setRemaining(nextHole.yards);
    setStrokes(0);
    setWind(Math.round(Math.random() * 25 - 12));
    setClubName(CLUBS[0].name);
    setSwingMode("full");
    setLie("fairway");
    resetSwing(`HOLE ${holeIndex + 2} READY`);
  }

  function takeShot() {
    const nextStroke = strokes + 1;
    setStrokes(nextStroke);
    const isTeeShot = strokes === 0;

    if (club.putter) {
      const remainingFeet = Math.round(remaining * 3);
      const puttRollFeet = Math.round((power / 100) * puttMeterMaxFeet(remainingFeet));
      const missFeet = Math.abs(remainingFeet - puttRollFeet);
      const { makeRange } = puttSettings(remainingFeet);
      if (missFeet <= makeRange || remainingFeet <= makeRange) {
        setRemaining(0);
        setLastShot(`${puttRollFeet} FT PUTT | IN THE CUP | MAKE RANGE ${makeRange}'`);
        setMessage("IN THE CUP");
        completeHole(nextStroke);
        return;
      }
      setRemaining(Math.max(1, Math.round(missFeet)) / 3);
      setLastShot(`${puttRollFeet} FT PUTT | ${Math.max(1, Math.round(missFeet))} FT LEFT`);
      resetSwing(`${puttRollFeet} FT PUTT - ${Math.max(1, Math.round(missFeet))} FT LEFT`);
      return;
    }

    const centerMiss = Math.abs(accuracy - 50);
    const accuracyScore = Math.round(clamp(100 - centerMiss * 2, 0, 100));
    const windBoost = wind * clamp(effectiveClub.max / 260, 0.12, 1) * (effectiveClub.max >= 160 ? 1 : 0.42);
    const teeDriverBonus = club.name === "DRIVER" && isTeeShot ? teeDriverBonusFactor(accuracyScore) : 1;
    const weatherFactor = isRaining ? 0.9 : 1;
    const carry = Math.round(clamp((effectiveClub.min + (effectiveClub.max - effectiveClub.min) * (power / 100) + windBoost) * teeDriverBonus * weatherFactor, 1, effectiveClub.max * teeDriverBonus + 18));
    const missRatio = centerMiss / 50;
    const lateralYards = Math.round(
      carry * missRatio * 0.8 * (accuracy < 50 ? -1 : 1) +
        hole.dogleg * 0.9 +
        wind * 0.35 * clamp(effectiveClub.max / 180, 0.1, 1)
    );
    const forwardYards = Math.round(Math.sqrt(Math.max(0, carry * carry - lateralYards * lateralYards)));
    const offline = Math.round(lateralYards / 4);
    let adjustedCarry = carry;
    let newRemaining = Math.max(0, Math.round(distanceToTarget(remaining - forwardYards, lateralYards)));
    let nextLie: Lie = newRemaining <= 20 ? "green" : "fairway";
    let note = teeDriverBonus > 1 ? `TEE DRIVER BONUS +${Math.round((teeDriverBonus - 1) * 100)}%` : "";
    if (isRaining) note = note ? `${note} | RAIN -10%` : "RAIN -10%";

    if (forwardYards > remaining + 50) {
      const penaltyStroke = nextStroke + 1;
      setStrokes(penaltyStroke);
      setRemaining(remaining);
      setLie(lie);
      setLastShot(`${adjustedCarry} YDS | ACC ${accuracyScore} | OUT OF BOUNDS LONG | PENALTY | RE-HIT FROM ${Math.round(remaining)} YDS`);
      setMessage(`OUT OF BOUNDS LONG - PENALTY STROKE - RE-HIT FROM ${Math.round(remaining)} YDS`);
      prepareFlight(offline, adjustedCarry, 0);
      setPhase("flight");
      return;
    }

    if (adjustedCarry > 200 && accuracyScore < 20) {
      const penaltyStroke = nextStroke + 1;
      const dropProgress = Math.round(forwardYards * 0.72);
      const dropRemaining = Math.max(35, Math.round(distanceToTarget(remaining - dropProgress, Math.abs(lateralYards) * 0.2)));
      setStrokes(penaltyStroke);
      setRemaining(dropRemaining);
      setLie("fairway");
      setLastShot(`${adjustedCarry} YDS | ACC ${accuracyScore} | BIG MISS | LOST BALL OUT OF BOUNDS | PENALTY DROP | ${dropRemaining} YDS LEFT`);
      setMessage(`LOST BALL OUT OF BOUNDS - PENALTY DROP - ${dropRemaining} YDS LEFT`);
      prepareFlight(offline, adjustedCarry, dropRemaining);
      setPhase("flight");
      return;
    }

    if (holeIndex === 1 && offline < -11) {
      adjustedCarry = 50;
      newRemaining = Math.max(20, Math.round(remaining - adjustedCarry));
      nextLie = "fairway";
      note = "TREE LEFT - KNOCKED DOWN";
    }

    if (holeIndex === 2 && isTeeShot && adjustedCarry >= 150 && adjustedCarry <= 170) {
      const penaltyStroke = nextStroke + 1;
      setStrokes(penaltyStroke);
      setRemaining(100);
      setLie("fairway");
      setClubName("7 IRON");
      setLastShot(`${adjustedCarry} YDS | WATER | PENALTY DROP | 100 YDS LEFT`);
      setMessage("WATER BALL - PENALTY DROP AT 100 YDS");
      prepareFlight(offline, adjustedCarry, 100);
      setPhase("flight");
      return;
    }

    if ((holeIndex === 2 || holeIndex === 5) && isTeeShot && newRemaining <= 20 && Math.random() < 0.05) {
      setRemaining(0);
      setLie("green");
      setLastShot(`${adjustedCarry} YDS | ACE!`);
      setMessage("HOLE IN ONE!");
      prepareFlight(offline, adjustedCarry, 0);
      setPhase("flight");
      setTimeout(() => completeHole(nextStroke), 1320);
      return;
    }

    if (holeIndex === 5 && isTeeShot && offline < -12) {
      setStrokes(2);
      setRemaining(hole.yards);
      setLie("fairway");
      setClubName("DRIVER");
      setSwingMode("full");
      setLastShot(`${adjustedCarry} YDS | WHAT ARE WE GONNA DO NOW GUYS | CRASH | $100 FINE | PENALTY | RE-TEE HITTING 3`);
      setMessage("PARKING LOT CRASH - PENALTY STROKE - RE-TEE HITTING 3");
      prepareFlight(offline, adjustedCarry, hole.yards);
      setPhase("flight");
      return;
    }

    if (holeIndex === 3 && strokes === 1 && accuracyScore < 80 && Math.random() < 0.45) {
      newRemaining = 150;
      nextLie = "fairway";
      note = "TREE ON APPROACH - 150 LEFT";
    }

    if (holeIndex === 4 && isTeeShot && adjustedCarry >= 210 && adjustedCarry <= 245 && offline > 8) {
      adjustedCarry = 75;
      newRemaining = Math.max(180, Math.round(remaining - adjustedCarry));
      nextLie = "fairway";
      note = "BIG TREE RIGHT - KNOCKED DOWN";
    }

    if (holeIndex === 6 && newRemaining >= 25 && newRemaining <= 40 && Math.abs(offline) > 6) {
      nextLie = "sand";
      note = SAND_JOKES[Math.floor(Math.random() * SAND_JOKES.length)];
    }

    if (holeIndex === 8 && offline < -9) {
      newRemaining = 180;
      nextLie = "fairway";
      note = "LEFT TREES - 180 LEFT";
    }

    prepareFlight(offline, adjustedCarry, newRemaining);

    if (newRemaining <= 2) {
      setRemaining(0);
      setLie("green");
      setLastShot(`${adjustedCarry} YDS | ACC ${accuracyScore} | HOLED OUT`);
      setMessage(`HOLED OUT! ${adjustedCarry} YDS | ACC ${accuracyScore}`);
      setPhase("flight");
      setTimeout(() => completeHole(nextStroke), 1320);
      return;
    }

    setRemaining(newRemaining);
    setLie(nextLie);
    setLastShot(`${adjustedCarry} YDS | ACC ${accuracyScore} | ${note ? `${note} | ` : ""}${nextLie === "green" ? "ON GREEN" : nextLie === "sand" ? "IN SAND" : `${newRemaining} YDS LEFT`} | WIND ${windText(wind)}`);
    if (nextLie === "green") {
      setClubName("PUTTER");
      setSwingMode("full");
    } else if (nextLie === "sand") {
      setClubName("CHIPPER");
      setSwingMode("full");
    }
    setMessage(`${adjustedCarry} YDS | ACC ${accuracyScore} | ${note ? `${note} | ` : ""}${nextLie === "green" ? `${Math.round(newRemaining * 3)} FT PUTT` : nextLie === "sand" ? `${Math.round(newRemaining)} YDS IN SAND` : `${newRemaining} YDS LEFT`}`);
    setPhase("flight");
  }

  function handleBoardClick() {
    if (phase === "complete") return;
    if (phase === "ready" || phase === "result") {
      setPower(0);
      setPowerDir(1);
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
    setLastShot("");
    setWind(Math.round(Math.random() * 25 - 12));
    setIsRaining(randomRain());
    setGolferLook(randomGolferLook());
    setLie("fairway");
    setClubName(CLUBS[0].name);
    setSwingMode("full");
    resetSwing("NEW ROUND READY");
  }

  const accuracyScore = Math.round(clamp(100 - Math.abs(accuracy - 50) * 2, 0, 100));
  const meterLabel = phase === "accuracy" ? `${accuracyScore}` : `${Math.round(power)}%`;
  const ballSize = clamp(12 - ((82 - ballY) / 73) * 7, 5, 12);
  const completedPar = holeScores.reduce((sum, _, idx) => sum + COURSE[idx].par, 0);
  const completedStrokes = holeScores.reduce((sum, s) => sum + s, 0);
  const relScore = completedStrokes - completedPar;
  const finalRoundScore = phase === "complete" ? completedStrokes : totalStrokes;
  const finalRoundRel = finalRoundScore - totalPar;
  const finalRoundLabel = relativeScore(finalRoundScore, totalPar);
  const finalScoreColor = finalRoundRel < 0 ? "#dc2626" : "#020617";
  const onGreen = remaining > 0 && (lie === "green" || (remaining <= 20 && lie !== "sand"));
  const puttFeet = currentPuttFeet;
  const puttMeterMax = puttMeterMaxFeet(puttFeet);
  const puttTicks = puttMeterTicks(puttMeterMax);
  const powerTicks = [25, 50, 75, 100].map((pct) => ({
    pct,
    value: club.putter
      ? Math.round((puttMeterMax * pct) / 100)
      : Math.round(effectiveClub.min + ((effectiveClub.max - effectiveClub.min) * pct) / 100),
  }));
  const remainingLabel = onGreen || club.putter ? `${puttFeet} FT` : `${Math.round(remaining)} YDS`;
  const miniBallY = clamp(92 - (1 - remaining / Math.max(1, hole.yards)) * 76, 12, 92);
  const fairwayProgress = clamp(1 - remaining / Math.max(1, hole.yards), 0, 0.95);
  const targetTop = clamp(10 + fairwayProgress * 48, 10, 58);
  const targetScale = 1 + fairwayProgress * 1.15;
  const targetCenterX = 50 + hole.dogleg * 0.18;
  const showTeeObstacles = strokes === 0;
  const swingActive = phase === "flight";
  const clubVisual = club.putter ? "putter" : club.name === "DRIVER" ? "driver" : club.name === "3 WOOD" ? "wood" : "iron";
  const clubLength = clubVisual === "driver" ? 86 : clubVisual === "wood" ? 72 : clubVisual === "putter" ? 36 : 58;
  const clubLeftOffset = clubLength - 62;
  const clubRestAngle = clubVisual === "putter" ? -22 : clubVisual === "driver" ? -62 : -54;
  const clubSwingAngle = clubVisual === "putter" ? -70 : clubVisual === "driver" ? -138 : -122;
  const puttBallLeft = clamp(50 - puttFeet * 0.65, 18, 82);
  const status = useMemo(() => {
    if (phase === "complete") return `ROUND COMPLETE: ${holeScores.reduce((sum, s) => sum + s, 0)} ON PAR ${totalPar}`;
    if (remaining <= 0) return message;
    return `${message} | ${remainingLabel} LEFT`;
  }, [phase, holeScores, totalPar, remaining, remainingLabel, message]);
  const lastShotWasCup = lastShot.includes("IN THE CUP");

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
        <nav style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
          <Link href="/driver" style={{ color: "#7dd3fc" }}>DRIVER</Link>
          <Link href="/leaderboard" style={{ color: "#7dd3fc" }}>LEADERBOARD</Link>
          <Link href="/" style={{ color: "#7dd3fc" }}>HOME</Link>
        </nav>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#d9ffe2", fontSize: 28 }}>4PLAY TEE OFF</h1>
            <div style={{ marginTop: 6 }}>BUXTON-HOLLIS CC - 9 HOLES ONLY</div>
          </div>
        </div>


        <div style={{ marginTop: 14, color: "#fde68a" }}>
          HOLE {holeIndex + 1} / 9 | PAR {hole.par} | {hole.yards} YDS | WIND {windText(wind)}{isRaining ? " | RAIN -10%" : ""} | LIE {lie.toUpperCase()} | STROKES {strokes} | TOTAL {totalStrokes} ({relScore >= 0 ? "+" : ""}{relScore})
        </div>

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
              <>
                <div style={{ position: "relative", width: `${clamp(power, 0, 100)}%`, height: "100%", background: "linear-gradient(90deg, #22c55e, #facc15, #ef4444)" }} />
                {powerTicks.map(({ pct, value }) => (
                  <div
                    key={pct}
                    style={{
                      position: "absolute",
                      left: `${pct}%`,
                      top: "50%",
                      transform: pct === 100 ? "translate(-100%, -50%)" : "translate(-50%, -50%)",
                      zIndex: 2,
                      color: "#f8fafc",
                      fontSize: 10,
                      fontWeight: 900,
                      lineHeight: 1,
                      textShadow: "0 1px 2px #020617, 0 0 5px #020617",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {value}{club.putter ? "'" : "y"}
                  </div>
                ))}
              </>
            )}
          </div>
          <div style={{ marginTop: 8, color: "#7cff9b", fontSize: 13, fontWeight: 800, letterSpacing: 0.2 }}>{status}</div>
          {lastShot ? (
            <div style={{ marginTop: 8, border: "2px solid #fde047", background: "#1f2937", color: "#fef3c7", padding: "8px 10px", boxShadow: "0 0 16px rgba(250,204,21,0.22)", fontSize: 12, lineHeight: 1.45 }}>
              PREVIOUS SHOT: {lastShot}{lastShotWasCup ? "" : ` | NOW: ${remainingLabel} LEFT`}
            </div>
          ) : null}
          {club.putter ? (
            <div style={{ position: "relative", height: 18, marginTop: 4, color: "#bae6fd", fontSize: 10 }}>
              {puttTicks.map((ft) => (
                <span key={ft} style={{ position: "absolute", left: `${clamp((ft / Math.max(1, puttMeterMax)) * 100, 0, 100)}%`, transform: "translateX(-50%)" }}>
                  {ft}'
                </span>
              ))}
            </div>
          ) : null}
          {club.putter ? (
            <div style={{ marginTop: 4, color: "#fde68a", fontSize: 12 }}>
              {puttFeet}' PUTT | 100% = {puttMeterMax}' | MADE IF WITHIN {currentPuttSettings.makeRange}' | METER SPEED {puttSpeedLabel(puttFeet)}
            </div>
          ) : null}
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
          {isRaining ? (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3, opacity: 0.75 }}>
              {Array.from({ length: 34 }).map((_, idx) => (
                <div
                  key={`rain-${idx}`}
                  style={{
                    position: "absolute",
                    left: `${(idx * 17) % 100}%`,
                    top: `${(idx * 29) % 100}%`,
                    width: 2,
                    height: 16,
                    background: "rgba(125,211,252,0.58)",
                    transform: "rotate(18deg)",
                    boxShadow: "0 0 5px rgba(186,230,253,0.4)",
                  }}
                />
              ))}
            </div>
          ) : null}
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
          {holeIndex === 2 ? (
            <div style={{ position: "absolute", left: "24%", top: "45%", width: "52%", height: 34, background: "repeating-linear-gradient(90deg, #0ea5e9 0 9px, #075985 9px 18px)", border: "2px solid #7dd3fc", opacity: 0.86 }} />
          ) : null}
          {holeIndex === 5 ? (
            <>
              <div style={{ position: "absolute", left: 0, top: "30%", width: "20%", height: "70%", background: "#334155" }} />
              <div style={{ position: "absolute", left: "20%", top: "32%", width: 10, height: "68%", background: "#94a3b8" }} />
              {[36, 50, 64, 78].map((top, idx) => (
                <div key={top} style={{ position: "absolute", left: `${idx % 2 === 0 ? 3 : 11}%`, top: `${top}%`, width: 28, height: 13, background: idx % 3 === 0 ? "#ef4444" : idx % 3 === 1 ? "#38bdf8" : "#f8fafc", border: "1px solid #020617", boxShadow: "inset 0 -4px 0 rgba(15,23,42,0.45)" }}>
                  <div style={{ position: "absolute", left: 4, top: 2, width: 6, height: 4, background: "#0f172a" }} />
                  <div style={{ position: "absolute", right: 4, top: 2, width: 6, height: 4, background: "#0f172a" }} />
                </div>
              ))}
              {[12, 28, 46, 66, 86].map((top) => (
                <div key={top} style={{ position: "absolute", left: "18%", top: `${top}%`, width: 18, height: 18, borderRadius: 999, background: "#166534", boxShadow: "0 0 0 4px #14532d" }} />
              ))}
            </>
          ) : null}
          {holeIndex === 6 ? (
            <>
              <div style={{ position: "absolute", right: 0, top: "30%", width: "16%", height: "70%", background: "#475569" }} />
              <div style={{ position: "absolute", right: "16%", top: "32%", width: 10, height: "68%", background: "#94a3b8" }} />
              {[-29, 29].map((offset) => (
                <div
                  key={offset}
                  style={{
                    position: "absolute",
                    left: `calc(${targetCenterX}% + ${offset * targetScale}px)`,
                    top: `calc(${targetTop + 24}% + ${17 * targetScale}px)`,
                    width: 34 * targetScale,
                    height: 16 * targetScale,
                    borderRadius: "50%",
                    background: "#d6a94a",
                    border: "2px solid #facc15",
                    boxShadow: "inset 0 -4px 0 rgba(120,53,15,0.28)",
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
            </>
          ) : null}
          {holeIndex === 7 ? (
            <>
              {[20, 34, 48, 62, 76].map((top) => (
                <div key={top} style={{ position: "absolute", right: "9%", top: `${top}%`, width: 20, height: 20, borderRadius: 999, background: "#166534", boxShadow: "0 0 0 5px #14532d" }} />
              ))}
            </>
          ) : null}
          {(holeIndex === 1 || holeIndex === 3 || holeIndex === 4 || holeIndex === 8) && showTeeObstacles ? (
            <>
              {holeIndex === 1 ? <div style={{ position: "absolute", left: "10%", top: "42%", width: 32, height: 32, borderRadius: 999, background: "#166534", boxShadow: "0 0 0 9px #14532d" }} /> : null}
              {holeIndex === 3 ? (
                <>
                  <div style={{ position: "absolute", left: "7%", top: "20%", width: 52, height: "64%", background: "linear-gradient(105deg, transparent 0 45%, rgba(132,204,22,0.35) 45% 100%)" }} />
                  {[18, 36, 54].map((top) => <div key={top} style={{ position: "absolute", left: "22%", top: `${top}%`, width: 28, height: 28, borderRadius: 999, background: "#166534", boxShadow: "0 0 0 8px #14532d" }} />)}
                </>
              ) : null}
              {holeIndex === 4 ? <div style={{ position: "absolute", right: "18%", top: "46%", width: 38, height: 38, borderRadius: 999, background: "#166534", boxShadow: "0 0 0 10px #14532d" }} /> : null}
              {holeIndex === 8 ? (
                <>
                  {[24, 40, 56].map((top) => <div key={top} style={{ position: "absolute", left: "13%", top: `${top}%`, width: 26, height: 26, borderRadius: 999, background: "#166534", boxShadow: "0 0 0 8px #14532d" }} />)}
                  <div style={{ position: "absolute", left: "48%", top: "47%", width: 30, height: 30, borderRadius: 999, background: "#166534", boxShadow: "0 0 0 9px #14532d" }} />
                </>
              ) : null}
            </>
          ) : null}
          {holeIndex === 3 && strokes === 1 ? (
            <>
              <div style={{ position: "absolute", left: "43%", top: "50%", width: 34, height: 34, borderRadius: 999, background: "#166534", boxShadow: "0 0 0 9px #14532d" }} />
              <div style={{ position: "absolute", left: "59%", top: "50%", width: 34, height: 34, borderRadius: 999, background: "#166534", boxShadow: "0 0 0 9px #14532d" }} />
            </>
          ) : null}
          {holeIndex === 4 && strokes >= 1 && !onGreen ? (
            <>
              {[-42, 0, 42].map((offset) => (
                <div
                  key={offset}
                  style={{
                    position: "absolute",
                    left: `calc(${targetCenterX}% + ${offset * targetScale}px)`,
                    top: `calc(${targetTop + 24}% - ${29 * targetScale}px)`,
                    width: 30 * targetScale,
                    height: 30 * targetScale,
                    borderRadius: 999,
                    background: "#166534",
                    boxShadow: `0 0 0 ${8 * targetScale}px #14532d`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
            </>
          ) : null}
          <div style={{ position: "absolute", left: `${targetCenterX}%`, top: `${targetTop + 24}%`, width: 86 * targetScale, height: 28 * targetScale, border: "2px solid #d9ffe2", background: "rgba(34,197,94,0.28)", borderRadius: "50%", opacity: 0.82, transform: "translate(-50%, -50%)" }} />
          <div style={{ position: "absolute", left: `${targetCenterX}%`, top: `${targetTop + 24}%`, width: 3, height: 42 * targetScale, background: "#d9ffe2", transform: "translate(-50%, -100%)" }} />
          <div style={{ position: "absolute", left: `${targetCenterX}%`, top: `${targetTop + 24 - 12 * targetScale}%`, width: 26 * targetScale, height: 15 * targetScale, background: "#ef4444", clipPath: "polygon(0 0, 100% 34%, 0 68%)" }} />
          {holeIndex === 3 && strokes >= 2 && !onGreen ? (
            <div style={{ position: "absolute", left: `calc(${targetCenterX}% - ${55 * targetScale}px)`, top: `calc(${targetTop + 24}% - ${24 * targetScale}px)`, width: 18 * targetScale, height: 32 * targetScale, background: "#38bdf8", border: "2px solid #bae6fd", boxShadow: "inset 0 -5px 0 rgba(15,23,42,0.28)", transform: "translate(-50%, -50%)" }}>
              <div style={{ position: "absolute", left: "18%", top: "14%", width: "64%", height: "18%", background: "#0f172a" }} />
              <div style={{ position: "absolute", left: "38%", bottom: 0, width: "24%", height: "34%", background: "#075985" }} />
            </div>
          ) : null}
          {holeIndex === 8 && strokes >= 1 ? (
            <div style={{ position: "absolute", left: `${61 + hole.dogleg * 0.18}%`, top: `${Math.max(8, targetTop - 5)}%`, width: 90, height: 54, opacity: 0.92 }}>
              <div style={{ position: "absolute", left: 8, top: 18, width: 72, height: 30, background: "#7f5539", border: "2px solid #facc15" }} />
              <div style={{ position: "absolute", left: 0, top: 6, width: 88, height: 18, background: "#991b1b", clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }} />
              <div style={{ position: "absolute", left: 18, top: 29, width: 10, height: 10, background: "#bae6fd" }} />
              <div style={{ position: "absolute", left: 48, top: 29, width: 10, height: 10, background: "#bae6fd" }} />
              <div style={{ position: "absolute", left: 34, top: 31, width: 12, height: 17, background: "#422006" }} />
              <div style={{ position: "absolute", left: 4, top: 49, color: "#fef3c7", fontSize: 9 }}>CLUBHOUSE</div>
            </div>
          ) : null}
          <div style={{ position: "absolute", left: 14, top: 118, width: 134, border: "2px solid #7cff9b", background: "#07111f", color: "#d9ffe2", padding: 6, fontSize: 11, lineHeight: 1.25 }}>
            <div>BUXTON-HOLLIS CC</div>
            <div>HOLE {holeIndex + 1}</div>
            <div>{hole.yards} YARDS</div>
          </div>
          <div style={{ position: "absolute", left: `${GOLFER_LEFT}%`, bottom: 42, width: 92, height: 18, background: "#22543d", zIndex: 5 }} />
          <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 33px)`, bottom: 80, width: 12, height: 62, background: "#d9ffe2", transform: swingActive ? "rotate(-7deg)" : "rotate(0deg)", transformOrigin: "bottom center", transition: "transform 180ms ease-out", zIndex: 5 }} />
          {golferLook === "longHair" ? (
            <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 20px)`, bottom: 127, width: 38, height: 38, borderRadius: "50% 50% 42% 42%", background: "#3f1f13", zIndex: 5 }} />
          ) : null}
          <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 26px)`, bottom: 133, width: 26, height: 26, borderRadius: 999, background: "#d9ffe2", zIndex: 6 }} />
          {golferLook === "flagBack" ? (
            <>
              <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 24px)`, bottom: 154, width: 30, height: 12, background: "#1d4ed8", borderRadius: "10px 10px 3px 3px", overflow: "hidden", transform: "rotate(-8deg)", zIndex: 7 }}>
                <div style={{ position: "absolute", left: 0, top: 0, width: 9, height: 12, background: "#1e3a8a" }} />
                <div style={{ position: "absolute", left: 9, top: 2, width: 21, height: 2, background: "#ef4444" }} />
                <div style={{ position: "absolute", left: 9, top: 6, width: 21, height: 2, background: "#f8fafc" }} />
                <div style={{ position: "absolute", left: 9, top: 10, width: 21, height: 2, background: "#ef4444" }} />
              </div>
              <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 17px)`, bottom: 151, width: 14, height: 5, background: "#1d4ed8", borderRadius: 999, transform: "rotate(-18deg)", zIndex: 7 }} />
            </>
          ) : golferLook === "forwardCap" ? (
            <>
              <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 24px)`, bottom: 154, width: 30, height: 12, background: "#0ea5e9", borderRadius: "10px 10px 3px 3px", transform: "rotate(4deg)", zIndex: 7 }} />
              <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 48px)`, bottom: 151, width: 18, height: 5, background: "#0ea5e9", borderRadius: 999, transform: "rotate(12deg)", zIndex: 7 }} />
            </>
          ) : golferLook === "topHat" ? (
            <>
              <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 23px)`, bottom: 153, width: 32, height: 5, background: "#020617", zIndex: 7 }} />
              <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 29px)`, bottom: 157, width: 20, height: 24, background: "#020617", border: "1px solid #94a3b8", zIndex: 7 }} />
            </>
          ) : golferLook === "oldSchoolCap" ? (
            <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 22px)`, bottom: 153, width: 36, height: 14, background: "#92400e", borderRadius: "50% 50% 20% 20%", transform: "rotate(-5deg)", zIndex: 7 }} />
          ) : null}
          <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 11px)`, bottom: 102, width: 52, height: 4, background: "#d9ffe2", transform: swingActive ? "rotate(-76deg)" : "rotate(-24deg)", transformOrigin: "44px 2px", transition: "transform 220ms cubic-bezier(.2,.8,.2,1)", zIndex: 5 }} />
          <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% ${clubLeftOffset >= 0 ? "-" : "+"} ${Math.abs(clubLeftOffset)}px)`, bottom: clubVisual === "putter" ? 106 : 116, width: clubLength, height: clubVisual === "driver" ? 4 : 3, background: clubVisual === "driver" ? "#e5e7eb" : "#bae6fd", transform: swingActive ? `rotate(${clubSwingAngle}deg)` : `rotate(${clubRestAngle}deg)`, transformOrigin: `${clubLength - 4}px 1px`, opacity: 0.95, transition: "transform 220ms cubic-bezier(.2,.8,.2,1)", zIndex: 5 }}>
            <div style={{ position: "absolute", left: 0, top: clubVisual === "putter" ? -2 : -4, width: clubVisual === "driver" ? 15 : clubVisual === "wood" ? 12 : clubVisual === "putter" ? 13 : 9, height: clubVisual === "putter" ? 7 : clubVisual === "iron" ? 12 : 14, background: clubVisual === "driver" ? "#f8fafc" : "#94a3b8", borderRadius: clubVisual === "driver" || clubVisual === "wood" ? "50%" : 2 }} />
          </div>
          <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 41px)`, bottom: 43, width: 4, height: 48, background: "#d9ffe2", transform: "rotate(-18deg)" }} />
          <div style={{ position: "absolute", left: `calc(${GOLFER_LEFT}% + 31px)`, bottom: 43, width: 4, height: 48, background: "#d9ffe2", transform: "rotate(18deg)" }} />

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

          {onGreen ? (
            <div style={{ position: "absolute", inset: 0, zIndex: 4, background: "#082112", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, rgba(124,255,155,0.06) 0 2px, transparent 2px 22px), repeating-linear-gradient(90deg, rgba(124,255,155,0.05) 0 2px, transparent 2px 22px)" }} />
              <div style={{ position: "absolute", left: "18%", top: "8%", width: "64%", height: "82%", background: "#1e7b35", clipPath: greenShape(hole.green), boxShadow: "inset 0 0 0 3px rgba(217,255,226,0.35), 0 0 28px rgba(34,197,94,0.28)" }} />
              {[5, 10, 15, 20, 25, 30, 45, 60].map((ft) => (
                <div
                  key={ft}
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: `${ft * 4}px`,
                    height: `${ft * 2.6}px`,
                    border: "1px dashed rgba(217,255,226,0.45)",
                    borderRadius: "50%",
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
              <div style={{ position: "absolute", left: "50%", top: "50%", width: 5, height: 40, background: "#d9ffe2", transform: "translate(-50%, -100%)" }} />
              <div style={{ position: "absolute", left: "50.4%", top: "39%", width: 30, height: 16, background: "#ef4444", clipPath: "polygon(0 0, 100% 34%, 0 68%)" }} />
              <div style={{ position: "absolute", left: "50%", top: "50%", width: 12, height: 12, borderRadius: 999, background: "#020617", border: "2px solid #d9ffe2", transform: "translate(-50%, -50%)" }} />
              <div style={{ position: "absolute", left: `calc(${puttBallLeft}% - 34px)`, top: "59%", width: 4, height: 32, background: "#d9ffe2", transform: swingActive ? "rotate(-7deg)" : "rotate(0deg)", transformOrigin: "bottom center", transition: "transform 180ms ease-out" }} />
              <div style={{ position: "absolute", left: `calc(${puttBallLeft}% - 41px)`, top: "54%", width: 15, height: 15, borderRadius: 999, background: "#d9ffe2" }} />
              <div style={{ position: "absolute", left: `calc(${puttBallLeft}% - 52px)`, top: "63%", width: 28, height: 3, background: "#d9ffe2", transform: swingActive ? "rotate(-72deg)" : "rotate(-18deg)", transformOrigin: "24px 1px", transition: "transform 220ms cubic-bezier(.2,.8,.2,1)" }} />
              <div style={{ position: "absolute", left: `calc(${puttBallLeft}% - 30px)`, top: "68%", width: 3, height: 24, background: "#d9ffe2", transform: "rotate(-18deg)" }} />
              <div style={{ position: "absolute", left: `calc(${puttBallLeft}% - 38px)`, top: "68%", width: 3, height: 24, background: "#d9ffe2", transform: "rotate(18deg)" }} />
              <div style={{ position: "absolute", left: `${puttBallLeft}%`, top: "64%", width: 12, height: 12, borderRadius: 999, background: "#f8fafc", boxShadow: "0 0 12px #bae6fd", transform: "translate(-50%, -50%)" }} />
              <div style={{ position: "absolute", left: 14, top: 14, border: "2px solid #7cff9b", background: "#07111f", color: "#d9ffe2", padding: 8, fontSize: 12 }}>
                ON GREEN | {puttFeet} FT TO CUP
              </div>
            </div>
          ) : null}

          <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 8, width: 118, height: 138, border: "2px solid #7cff9b", background: "#07111f", color: "#d9ffe2", fontSize: 10, padding: 6 }}>
            <div>MINI MAP</div>
            <div style={{ position: "relative", margin: "6px auto 0", width: 58, height: 108, background: "#1e7b35", clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0 100%)" }}>
              <div style={{ position: "absolute", left: "50%", top: "8%", width: 8, height: 8, borderRadius: 999, background: "#020617", border: "1px solid #d9ffe2", transform: "translate(-50%, -50%)" }} />
              <div style={{ position: "absolute", left: "50%", top: `${miniBallY}%`, width: 7, height: 7, borderRadius: 999, background: "#f8fafc", boxShadow: "0 0 8px #bae6fd", transform: "translate(-50%, -50%)" }} />
            </div>
          </div>
          {phase === "complete" ? (
            <div style={{ position: "absolute", inset: 0, zIndex: 12, pointerEvents: "none", background: "linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.28))" }}>
              {[18, 30, 42, 69, 81].map((left, idx) => (
                <div key={left} style={{ position: "absolute", left: `${left}%`, top: `${12 + (idx % 2) * 8}%`, width: 54, height: 54, transform: "translate(-50%, -50%)" }}>
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                    <div
                      key={deg}
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: 4,
                        height: 28,
                        background: idx % 2 === 0 ? "#fde047" : "#38bdf8",
                        boxShadow: `0 0 9px ${idx % 2 === 0 ? "#fde047" : "#38bdf8"}`,
                        transform: `translate(-50%, -100%) rotate(${deg}deg)`,
                        transformOrigin: "50% 100%",
                      }}
                    />
                  ))}
                </div>
              ))}

              <div style={{ position: "absolute", right: 26, top: 22, minWidth: 192, border: "3px solid #f8fafc", background: "rgba(254,243,199,0.93)", color: finalScoreColor, padding: "12px 14px", textAlign: "center", boxShadow: "0 0 26px rgba(248,250,252,0.28)" }}>
                <div style={{ color: "#020617", fontSize: 12, fontWeight: 900, letterSpacing: 1.4 }}>FINAL SCORE</div>
                <div style={{ fontSize: 50, lineHeight: 1, fontWeight: 900 }}>{finalRoundLabel}</div>
                <div style={{ color: "#020617", fontSize: 12, fontWeight: 900 }}>{finalRoundScore} STROKES</div>
              </div>

              <div style={{ position: "absolute", left: "50%", bottom: 38, transform: "translateX(-50%)", border: "3px solid #fde047", background: "rgba(7,17,31,0.88)", color: "#fde68a", padding: "12px 18px", textAlign: "center", boxShadow: "0 0 30px rgba(250,204,21,0.35)" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#d9ffe2" }}>ROUND COMPLETE</div>
                <div style={{ marginTop: 6, fontSize: 13, color: "#bae6fd" }}>BEERS CLINKING AT THE CLUBHOUSE</div>
                <div style={{ position: "relative", width: 112, height: 54, margin: "8px auto 0" }}>
                  <div style={{ position: "absolute", left: 24, top: 8, width: 28, height: 36, background: "#f59e0b", border: "3px solid #fef3c7", borderRadius: "3px 3px 8px 8px", transform: "rotate(-13deg)", boxShadow: "inset 0 9px 0 rgba(254,243,199,0.55)" }} />
                  <div style={{ position: "absolute", right: 24, top: 8, width: 28, height: 36, background: "#f59e0b", border: "3px solid #fef3c7", borderRadius: "3px 3px 8px 8px", transform: "rotate(13deg)", boxShadow: "inset 0 9px 0 rgba(254,243,199,0.55)" }} />
                  <div style={{ position: "absolute", left: 47, top: 18, width: 18, height: 4, background: "#fef3c7", transform: "rotate(-18deg)" }} />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 8, marginTop: 14 }}>
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
                padding: 8,
                textAlign: "left",
              }}
            >
              <span style={{ display: "block", color: "#d9ffe2" }}>{c.name}</span>
              <span style={{ display: "block", marginTop: 4, color: "#7cff9b", fontSize: 12 }}>
                100%: {clubDisplayMax(c)} {c.putter ? "FT" : "YDS"}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {(["full", "half", "quarter"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={phase === "power" || phase === "accuracy" || phase === "flight" || phase === "complete"}
              onClick={() => setSwingMode(mode)}
              style={{
                minHeight: 34,
                minWidth: 96,
                border: `2px solid ${swingMode === mode ? "#fde047" : "#7cff9b"}`,
                background: swingMode === mode ? "#17351f" : "#020617",
                color: "#d9ffe2",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>

        <section style={{ marginTop: 18 }}>
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

        <section style={{ marginTop: 18, borderTop: "1px solid rgba(124,255,155,0.28)", paddingTop: 14 }}>
          <h2 style={{ marginBottom: 8, color: "#d9ffe2" }}>TOP 10 NINE-HOLE ROUNDS ({storageMode.toUpperCase()})</h2>
          {scores.length === 0 ? (
            <div>NO COMPLETED ROUNDS YET.</div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 0, listStylePosition: "inside" }}>
              {scores.map((s, idx) => (
                <li key={`${s.total_score}-${idx}`} style={{ marginBottom: 6, border: "1px solid rgba(124,255,155,0.35)", padding: "7px 8px", overflowWrap: "anywhere" }}>
                  {(s.display_name || "PLAYER").toUpperCase()} | {s.total_score} STROKES | {relativeScore(s.total_score, s.total_par)}
                  {scoreDate(s.created_at) ? ` | ${scoreDate(s.created_at)}` : ""}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
