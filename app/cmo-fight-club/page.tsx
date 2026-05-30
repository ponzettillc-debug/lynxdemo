"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type Move = "A" | "B" | "C";
type Phase = "ready" | "fighting" | "won-round" | "lost" | "champion";
type Winner = { name: string; date: string };

const WINNERS_KEY = "cmo_fight_club_winners";

const moves: Record<Move, { label: string; damage: number; accuracy: number; block: Move }> = {
  A: { label: "High Punch", damage: 13, accuracy: 0.72, block: "C" },
  B: { label: "Mid Punch", damage: 10, accuracy: 0.84, block: "A" },
  C: { label: "Kick", damage: 16, accuracy: 0.62, block: "B" },
};

const fighters = [
  { name: "Parking Lot Pat", style: "Windmill brawler", power: 7, accuracy: 0.48, color: "#94a3b8", look: "CAP" },
  { name: "Southpaw Sal", style: "Awkward lefty", power: 9, accuracy: 0.52, color: "#38bdf8", look: "S" },
  { name: "El Cart Path", style: "Counter striker", power: 11, accuracy: 0.56, color: "#f97316", look: "CP" },
  { name: "The Range Rat", style: "Volume puncher", power: 12, accuracy: 0.6, color: "#22c55e", look: "RR" },
  { name: "Bogey Bones", style: "Long reach", power: 14, accuracy: 0.64, color: "#a78bfa", look: "BB" },
  { name: "The Yardage Book", style: "Patient tactician", power: 16, accuracy: 0.68, color: "#facc15", look: "YB" },
  { name: "BOSS: CMO", style: "Final-round menace", power: 19, accuracy: 0.72, color: "#ef4444", look: "CMO" },
];

function clampHealth(value: number) {
  return Math.max(0, Math.min(100, value));
}

function randomMove(roll: number): Move {
  return (["A", "B", "C"] as Move[])[Math.floor(roll * 3)];
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function CmoFightClubPage() {
  const seedRef = useRef(48621);
  const [round, setRound] = useState(0);
  const [playerHealth, setPlayerHealth] = useState(100);
  const [enemyHealth, setEnemyHealth] = useState(100);
  const [phase, setPhase] = useState<Phase>("ready");
  const [log, setLog] = useState("Tap A, B, or C to start swinging.");
  const [winners, setWinners] = useState<Winner[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(WINNERS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as Winner[];
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    } catch {
      return [];
    }
  });
  const [winnerName, setWinnerName] = useState("");
  const [savedChampion, setSavedChampion] = useState(false);

  const fighter = fighters[round];
  const progress = `${round + 1} / ${fighters.length}`;
  const canStrike = phase === "ready" || phase === "fighting";
  const championSaved = phase === "champion" && savedChampion;

  const arenaNote = useMemo(() => {
    if (phase === "champion") return "You cleared all 7. Add your name to the winner record.";
    if (phase === "lost") return "You got dropped. Reset and run the card back.";
    if (round === fighters.length - 1) return "Boss fight. Pick clean shots and manage the life bar.";
    return "Win the knockdown to unlock the next fighter.";
  }, [phase, round]);

  function nextRoll() {
    seedRef.current = (seedRef.current * 1664525 + 1013904223) % 4294967296;
    return seedRef.current / 4294967296;
  }

  function resetFight(nextRound = round) {
    setRound(nextRound);
    setPlayerHealth(100);
    setEnemyHealth(100);
    setPhase("ready");
    setSavedChampion(false);
    setWinnerName("");
    setLog(`Round ${nextRound + 1}: ${fighters[nextRound].name} is waiting.`);
  }

  function restartCard() {
    resetFight(0);
  }

  function nextFight() {
    resetFight(Math.min(round + 1, fighters.length - 1));
  }

  function strike(move: Move) {
    if (!canStrike) return;

    const enemyMove = randomMove(nextRoll());
    const playerMove = moves[move];
    const blocked = playerMove.block === enemyMove;
    const playerHit = !blocked && nextRoll() < playerMove.accuracy;
    const enemyHit = nextRoll() < fighter.accuracy;
    const playerDamage = playerHit ? playerMove.damage + Math.floor(nextRoll() * 6) : 0;
    const enemyDamage = enemyHit ? fighter.power + Math.floor(nextRoll() * 5) : 0;
    const nextEnemyHealth = clampHealth(enemyHealth - playerDamage);
    const nextPlayerHealth = clampHealth(playerHealth - enemyDamage);

    setPhase("fighting");
    setEnemyHealth(nextEnemyHealth);
    setPlayerHealth(nextPlayerHealth);

    if (nextEnemyHealth <= 0) {
      if (round === fighters.length - 1) {
        setPhase("champion");
        setLog(`${playerMove.label} lands clean. CMO is down. You won Fight Club.`);
      } else {
        setPhase("won-round");
        setLog(`${playerMove.label} gets the knockdown. ${fighter.name} is out.`);
      }
      return;
    }

    if (nextPlayerHealth <= 0) {
      setPhase("lost");
      setLog(`${fighter.name} counters your ${playerMove.label.toLowerCase()}. You got knocked down.`);
      return;
    }

    if (blocked) {
      setLog(`${fighter.name} reads the ${playerMove.label.toLowerCase()} and blocks it. ${enemyHit ? "You eat a counter." : "You slip the counter."}`);
    } else if (playerHit) {
      setLog(`${playerMove.label} lands for ${playerDamage}. ${enemyHit ? `${fighter.name} answers back.` : "Clean shot."}`);
    } else {
      setLog(`${playerMove.label} misses. ${enemyHit ? `${fighter.name} tags you.` : "Both fighters reset."}`);
    }
  }

  function saveWinner() {
    const name = winnerName.trim();
    if (phase !== "champion" || !name) return;
    const next = [{ name, date: todayLabel() }, ...winners].slice(0, 12);
    setWinners(next);
    window.localStorage.setItem(WINNERS_KEY, JSON.stringify(next));
    setSavedChampion(true);
    setWinnerName("");
  }

  const page: React.CSSProperties = {
    minHeight: "100vh",
    background: "radial-gradient(circle at 50% 0%, rgba(239,68,68,0.24), transparent 34%), linear-gradient(180deg, #050505 0%, #111827 58%, #030712 100%)",
    color: "#f8fafc",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: 14,
  };
  const panel: React.CSSProperties = {
    border: "1px solid rgba(229,231,235,0.18)",
    background: "rgba(15,23,42,0.88)",
    borderRadius: 8,
    padding: 12,
    boxShadow: "0 18px 44px rgba(0,0,0,0.42)",
  };
  const button: React.CSSProperties = {
    border: "1px solid rgba(248,250,252,0.22)",
    background: "#e5e7eb",
    color: "#111827",
    borderRadius: 8,
    padding: "10px 12px",
    fontWeight: 950,
    cursor: "pointer",
  };
  const attackButton: React.CSSProperties = {
    ...button,
    minHeight: 72,
    display: "grid",
    gap: 4,
    alignContent: "center",
    fontSize: 18,
  };

  return (
    <main style={page}>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gap: 12 }}>
        <header style={{ ...panel, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: 0 }}>CMO FIGHT CLUB</h1>
            <p style={{ margin: "4px 0 0", color: "#d1d5db", fontSize: 14 }}>Seven fights. The seventh is the boss. First knockdown wins.</p>
          </div>
          <Link href="/" style={{ ...button, textDecoration: "none" }}>Home</Link>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
          <div style={{ ...panel, minHeight: 500, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
              <FighterCard name="You" health={playerHealth} color="#e5e7eb" look="YOU" side="left" />
              <div style={{ textAlign: "center", color: "#fca5a5", fontWeight: 950 }}>
                <div>FIGHT {progress}</div>
                <div style={{ fontSize: 12, color: "#d1d5db" }}>{arenaNote}</div>
              </div>
              <FighterCard name={fighter.name} health={enemyHealth} color={fighter.color} look={fighter.look} side="right" />
            </div>

            <div style={{ minHeight: 210, border: "1px solid rgba(229,231,235,0.12)", borderRadius: 8, background: "linear-gradient(180deg, #1f2937 0%, #050505 100%)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: "auto 0 0", height: 46, background: "repeating-linear-gradient(90deg, rgba(248,250,252,0.08) 0 20px, rgba(248,250,252,0.03) 20px 40px)" }} />
              <FighterSprite x="22%" color="#e5e7eb" label="YOU" />
              <FighterSprite x="72%" color={fighter.color} label={fighter.look} flipped />
              <div style={{ position: "absolute", left: "50%", top: "46%", transform: "translate(-50%, -50%)", color: "rgba(248,250,252,0.1)", fontSize: 76, fontWeight: 950 }}>VS</div>
            </div>

            <div style={{ ...panel, background: "rgba(3,7,18,0.8)", color: "#e5e7eb", fontWeight: 800 }}>{log}</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {(["A", "B", "C"] as Move[]).map((move) => (
                <button key={move} type="button" disabled={!canStrike} onClick={() => strike(move)} style={{ ...attackButton, opacity: canStrike ? 1 : 0.55 }}>
                  <span>{move}</span>
                  <span style={{ fontSize: 12, color: "#374151" }}>{moves[move].label}</span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {phase === "won-round" ? <button type="button" onClick={nextFight} style={button}>Next Fighter</button> : null}
              {phase === "lost" || phase === "champion" ? <button type="button" onClick={restartCard} style={button}>Restart Card</button> : null}
              <button type="button" onClick={() => resetFight(round)} style={{ ...button, background: "#111827", color: "#f8fafc" }}>Reset Fight</button>
            </div>
          </div>

          <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div style={panel}>
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Fight Card</h2>
              <div style={{ display: "grid", gap: 6 }}>
                {fighters.map((next, index) => (
                  <div key={next.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: 8, borderRadius: 8, background: index === round ? "rgba(248,250,252,0.14)" : "rgba(248,250,252,0.05)", color: index < round || phase === "champion" ? "#86efac" : "#f8fafc" }}>
                    <span>{index + 1}. {next.name}</span>
                    <span style={{ color: next.color, fontWeight: 900 }}>{index === 6 ? "BOSS" : next.style}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={panel}>
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Winner Record</h2>
              {phase === "champion" && !championSaved ? (
                <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                  <input value={winnerName} onChange={(e) => setWinnerName(e.target.value)} placeholder="Champion name" style={{ width: "100%", border: "1px solid rgba(229,231,235,0.22)", background: "#030712", color: "#f8fafc", borderRadius: 8, padding: 10, outline: "none" }} />
                  <button type="button" onClick={saveWinner} style={button}>Save Winner</button>
                </div>
              ) : null}
              {championSaved ? <div style={{ marginBottom: 10, color: "#86efac", fontWeight: 900 }}>Winner saved.</div> : null}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {winners.length ? winners.map((winner, index) => (
                    <tr key={`${winner.name}-${winner.date}-${index}`}>
                      <td style={{ padding: "7px 0", borderTop: "1px solid rgba(229,231,235,0.12)", fontWeight: 900 }}>{index + 1}. {winner.name}</td>
                      <td style={{ padding: "7px 0", borderTop: "1px solid rgba(229,231,235,0.12)", color: "#d1d5db", textAlign: "right" }}>{winner.date}</td>
                    </tr>
                  )) : (
                    <tr><td style={{ padding: "7px 0", color: "#d1d5db" }}>Win the full card to add a name.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function FighterCard({
  name,
  health,
  color,
  look,
  side,
}: {
  name: string;
  health: number;
  color: string;
  look: string;
  side: "left" | "right";
}) {
  return (
    <div style={{ display: "grid", gap: 5, textAlign: side }}>
      <div style={{ display: "flex", justifyContent: side === "left" ? "flex-start" : "flex-end", gap: 8, alignItems: "center" }}>
        <span style={{ color, fontWeight: 950 }}>{look}</span>
        <span style={{ fontWeight: 950 }}>{name}</span>
      </div>
      <div style={{ height: 18, borderRadius: 999, overflow: "hidden", background: "#030712", border: "1px solid rgba(229,231,235,0.2)" }}>
        <div style={{ width: `${health}%`, height: "100%", background: health > 35 ? "linear-gradient(90deg, #22c55e, #86efac)" : "linear-gradient(90deg, #ef4444, #fca5a5)", transition: "width 180ms ease" }} />
      </div>
      <div style={{ color: "#d1d5db", fontSize: 12 }}>{health} HP</div>
    </div>
  );
}

function FighterSprite({
  x,
  color,
  label,
  flipped,
}: {
  x: string;
  color: string;
  label: string;
  flipped?: boolean;
}) {
  return (
    <div style={{ position: "absolute", left: x, bottom: 34, transform: `translateX(-50%) scaleX(${flipped ? -1 : 1})`, width: 86, height: 150 }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", margin: "0 auto", background: color, border: "3px solid #f8fafc", boxShadow: "0 8px 18px rgba(0,0,0,0.35)" }} />
      <div style={{ width: 62, height: 72, margin: "-2px auto 0", borderRadius: "20px 20px 12px 12px", background: color, border: "3px solid #f8fafc" }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: -46 }}>
        <div style={{ width: 16, height: 68, borderRadius: 999, background: "#f8fafc", transform: "rotate(28deg)" }} />
        <div style={{ width: 16, height: 68, borderRadius: 999, background: "#f8fafc", transform: "rotate(-28deg)" }} />
      </div>
      <div style={{ color: "#030712", background: "#f8fafc", borderRadius: 999, padding: "2px 6px", fontWeight: 950, fontSize: 11, textAlign: "center", transform: `scaleX(${flipped ? -1 : 1})` }}>{label}</div>
    </div>
  );
}
