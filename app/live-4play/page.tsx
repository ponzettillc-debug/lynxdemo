"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Format = "Points" | "Skins" | "Ryder Cup" | "Coon" | "Salmon Falls - Regular";
type Tournament = {
  id: string;
  name: string;
  format: Format;
  holes_count: 9 | 18;
  team_names: string[];
  scores: ScoreGrid | SalmonScores;
  status: "live" | "complete";
  created_by?: string;
  created_at?: string;
  updated_at?: string;
};
type ScoreGrid = Array<Array<number | null>>;
type SalmonScores = {
  kind: "salmon_falls_regular";
  player_options: string[];
  team_player_counts: number[];
  team_players: string[][];
  player_scores: Array<Array<Array<number | null>>>;
};

const LOCAL_KEY = "4play_live_tournaments_v1";
const PLAYER_OPTIONS_KEY = "4play_live_player_options_v1";
const SALMON_FORMAT: Format = "Salmon Falls - Regular";
const FORMATS: Format[] = ["Points", "Skins", "Ryder Cup", SALMON_FORMAT, "Coon"];
const SALMON_PARS = [4, 4, 3, 5, 5, 3, 4, 4, 4];
const BASE_SALMON_PLAYERS = ["Bird", "Owen", "Dyer", "Chapman", "Proper", "JR", "Jake", "Dan", "Justin"];

function blankScores(teamCount: number, holesCount: number): ScoreGrid {
  return Array.from({ length: teamCount }, () => Array.from({ length: holesCount }, () => null));
}

function cleanScores(scores: ScoreGrid | undefined, teamCount: number, holesCount: number): ScoreGrid {
  return Array.from({ length: teamCount }, (_, teamIndex) =>
    Array.from({ length: holesCount }, (_, holeIndex) => {
      const raw = scores?.[teamIndex]?.[holeIndex];
      return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    })
  );
}

function isScoreGrid(scores: Tournament["scores"]): scores is ScoreGrid {
  return Array.isArray(scores);
}

function blankSalmonScores(teamCount: number, playerCounts: number[], playerOptions: string[], teamPlayers?: string[][]): SalmonScores {
  const players = Array.from({ length: teamCount }, (_team, teamIndex) =>
    Array.from({ length: playerCounts[teamIndex] || 1 }, (_player, playerIndex) => teamPlayers?.[teamIndex]?.[playerIndex] || "")
  );

  return {
    kind: "salmon_falls_regular",
    player_options: Array.from(new Set([...playerOptions, ...players.flat().filter(Boolean)])),
    team_player_counts: playerCounts.slice(0, teamCount),
    team_players: players,
    player_scores: players.map((team) => team.map(() => Array.from({ length: 9 }, () => null))),
  };
}

function salmonScores(value: Tournament["scores"] | undefined, teamNames: string[]): SalmonScores {
  if (value && !Array.isArray(value) && value.kind === "salmon_falls_regular") {
    const counts = teamNames.map((_, teamIndex) => Math.max(1, Math.min(4, value.team_player_counts?.[teamIndex] || value.team_players?.[teamIndex]?.length || 1)));
    const normalized = blankSalmonScores(teamNames.length, counts, value.player_options || [], value.team_players || []);
    normalized.player_scores = normalized.team_players.map((players, teamIndex) =>
      players.map((_player, playerIndex) =>
        Array.from({ length: 9 }, (_hole, holeIndex) => {
          const raw = value.player_scores?.[teamIndex]?.[playerIndex]?.[holeIndex];
          return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        })
      )
    );
    return normalized;
  }
  return blankSalmonScores(teamNames.length, teamNames.map(() => 1), [], []);
}

function teamTotal(scores: Array<number | null>) {
  return scores.reduce<number>((sum, score) => sum + (typeof score === "number" ? score : 0), 0);
}

function salmonPoints(strokes: number | null, par: number) {
  if (typeof strokes !== "number") return 0;
  if (strokes <= par - 1) return 3;
  if (strokes === par) return 2;
  if (strokes === par + 1) return 1;
  return 0;
}

function salmonPlayerTotal(scores: Array<number | null>) {
  return scores.reduce<number>((total, strokes, holeIndex) => total + salmonPoints(strokes, SALMON_PARS[holeIndex]), 0);
}

function salmonTeamHoleTotal(salmon: SalmonScores, teamIndex: number, holeIndex: number) {
  return (salmon.player_scores[teamIndex] || []).reduce<number>(
    (total, playerScores) => total + salmonPoints(playerScores[holeIndex], SALMON_PARS[holeIndex]),
    0
  );
}

function salmonTeamTotal(salmon: SalmonScores, teamIndex: number) {
  return Array.from({ length: 9 }, (_hole, holeIndex) => salmonTeamHoleTotal(salmon, teamIndex, holeIndex))
    .reduce((sum, value) => sum + value, 0);
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

function findSingleWinner(values: Array<number | null>, highWins: boolean) {
  const entered = values
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => typeof item.value === "number");

  if (entered.length < 2) return null;
  const target = highWins
    ? Math.max(...entered.map((item) => item.value))
    : Math.min(...entered.map((item) => item.value));
  const winners = entered.filter((item) => item.value === target);
  return winners.length === 1 ? winners[0].index : null;
}

function skinsByTeam(tournament: Tournament) {
  const skins = Array.from({ length: tournament.team_names.length }, () => 0);
  const scores = tournament.scores;
  if (!isScoreGrid(scores)) return { skins, carryOpen: 0 };
  let carry = 1;

  for (let hole = 0; hole < tournament.holes_count; hole += 1) {
    const winner = findSingleWinner(
      scores.map((teamScores) => teamScores[hole]),
      false
    );

    if (winner === null) {
      carry += 1;
    } else {
      skins[winner] += carry;
      carry = 1;
    }
  }

  return { skins, carryOpen: carry > 1 ? carry : 0 };
}

function ryderSegments(holesCount: 9 | 18) {
  const size = holesCount === 18 ? 6 : 3;
  return [
    { label: "Points", start: 0, end: size, highWins: true },
    { label: "Best Ball", start: size, end: size * 2, highWins: false },
    { label: "Scramble", start: size * 2, end: size * 3, highWins: false },
  ];
}

function ryderPoints(tournament: Tournament) {
  const points = Array.from({ length: tournament.team_names.length }, () => 0);
  const scores = tournament.scores;
  if (!isScoreGrid(scores)) return points;
  const segments = ryderSegments(tournament.holes_count);

  segments.forEach((segment, segmentIndex) => {
    if (segmentIndex === 0) {
      for (let hole = segment.start; hole < segment.end; hole += 1) {
        const winner = findSingleWinner(
          scores.map((teamScores) => teamScores[hole]),
          true
        );
        if (winner !== null) points[winner] += 1;
      }
      return;
    }

    const totals = scores.map((teamScores) => {
      const segmentScores = teamScores.slice(segment.start, segment.end);
      if (segmentScores.some((score) => typeof score !== "number")) return null;
      return teamTotal(segmentScores);
    });
    const winner = findSingleWinner(totals, segment.highWins);
    if (winner !== null) points[winner] += 1;
  });

  return points;
}

function localTournaments() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "[]") as Tournament[];
  } catch {
    return [];
  }
}

export default function Live4PlayPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageMode, setStorageMode] = useState("local");
  const [message, setMessage] = useState("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("Saturday Nassau");
  const [holesCount, setHolesCount] = useState<9 | 18>(18);
  const [format, setFormat] = useState<Format>("Points");
  const [teamCount, setTeamCount] = useState(2);
  const [teamNames, setTeamNames] = useState(["Team 1", "Team 2", "Team 3", "Team 4"]);
  const [salmonPlayerCounts, setSalmonPlayerCounts] = useState([2, 2, 2, 2]);
  const [salmonTeamPlayers, setSalmonTeamPlayers] = useState<string[][]>([
    ["", ""],
    ["", ""],
    ["", ""],
    ["", ""],
  ]);
  const [playerOptions, setPlayerOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedId) || tournaments[0] || null,
    [selectedId, tournaments]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PLAYER_OPTIONS_KEY);
      const savedPlayers = saved ? JSON.parse(saved) as string[] : [];
      setPlayerOptions(Array.from(new Set([...BASE_SALMON_PLAYERS, ...savedPlayers])).sort((a, b) => a.localeCompare(b)));
    } catch {
      setPlayerOptions(BASE_SALMON_PLAYERS);
    }
  }, []);

  useEffect(() => {
    if (format !== SALMON_FORMAT) return;
    setHolesCount(9);
  }, [format]);

  async function token() {
    return supabase.auth.getSession().then(({ data }) => data.session?.access_token || "");
  }

  const savePlayerOptions = useCallback((nextOptions: string[]) => {
    const next = Array.from(new Set(nextOptions.map((name) => name.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    if (next.join("\n") === playerOptions.join("\n")) return next;
    setPlayerOptions(next);
    window.localStorage.setItem(PLAYER_OPTIONS_KEY, JSON.stringify(next));
    return next;
  }, [playerOptions]);

  const mergeTournamentPlayerOptions = useCallback((nextTournaments: Tournament[]) => {
    const names = nextTournaments.flatMap((tournament) => {
      if (tournament.format !== SALMON_FORMAT) return [];
      const salmon = salmonScores(tournament.scores, tournament.team_names);
      return [...salmon.player_options, ...salmon.team_players.flat()];
    });
    if (names.length > 0) savePlayerOptions([...playerOptions, ...names]);
  }, [playerOptions, savePlayerOptions]);

  function setSalmonPlayerCount(teamIndex: number, count: number) {
    setSalmonPlayerCounts((prev) => prev.map((value, index) => (index === teamIndex ? count : value)));
    setSalmonTeamPlayers((prev) =>
      prev.map((players, index) => {
        if (index !== teamIndex) return players;
        return Array.from({ length: count }, (_player, playerIndex) => players[playerIndex] || "");
      })
    );
  }

  function assignSalmonPlayer(teamIndex: number, playerIndex: number, value: string) {
    let nextName = value;
    if (value === "__add_new__") {
      const manualName = window.prompt("Add player name");
      nextName = String(manualName || "").trim();
      if (!nextName) return;
      savePlayerOptions([...playerOptions, nextName]);
    }

    setSalmonTeamPlayers((prev) =>
      prev.map((players, currentTeamIndex) =>
        currentTeamIndex === teamIndex
          ? players.map((player, currentPlayerIndex) => (currentPlayerIndex === playerIndex ? nextName : player))
          : players
      )
    );
  }

  function saveLocal(next: Tournament[]) {
    const sorted = [...next].sort(
      (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
    );
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(sorted));
    setTournaments(sorted);
    if (!selectedId && sorted[0]) setSelectedId(sorted[0].id);
  }

  const loadTournaments = useCallback(async (silent = false) => {
    const local = localTournaments();
    setTournaments(local);
    mergeTournamentPlayerOptions(local);
    if (!selectedId && local[0]) setSelectedId(local[0].id);

    const accessToken = await token();
    if (!accessToken) return;

    const r = await fetch("/api/live-4play", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const j = await r.json().catch(() => ({}));

    if (j?.ok && j.storage === "supabase") {
      setStorageMode("supabase");
      const remote = (j.tournaments ?? []) as Tournament[];
      setTournaments(remote);
      mergeTournamentPlayerOptions(remote);
      if (!selectedId && remote[0]) setSelectedId(remote[0].id);
      if (!silent) setMessage("Live tournaments synced.");
    } else {
      setStorageMode("local");
      if (!silent) setMessage("Live 4Play is using this device until the Supabase table is installed.");
    }
  }, [selectedId, mergeTournamentPlayerOptions]);

  useEffect(() => {
    if (!session) return;
    loadTournaments(true);
    const id = window.setInterval(() => loadTournaments(true), 12000);
    return () => window.clearInterval(id);
  }, [session, loadTournaments]);

  async function createTournament() {
    if (format === "Coon") {
      setMessage("Coon Style is not available until next release.");
      return;
    }

    const names = teamNames.slice(0, teamCount).map((teamName, index) => teamName.trim() || `Team ${index + 1}`);
    const gameHoles = format === SALMON_FORMAT ? 9 : holesCount;
    const salmonPlayerNames = salmonTeamPlayers
      .slice(0, teamCount)
      .map((players, teamIndex) =>
        Array.from({ length: salmonPlayerCounts[teamIndex] || 1 }, (_player, playerIndex) => players[playerIndex] || "")
      );

    if (format === SALMON_FORMAT && salmonPlayerNames.flat().some((player) => !player.trim())) {
      setMessage("Assign every Salmon Falls player before creating the game.");
      return;
    }

    const nextPlayerOptions = format === SALMON_FORMAT
      ? savePlayerOptions([...playerOptions, ...salmonPlayerNames.flat()])
      : playerOptions;
    const salmonPayload = blankSalmonScores(teamCount, salmonPlayerCounts, nextPlayerOptions, salmonPlayerNames);
    const now = new Date().toISOString();
    const localTournament: Tournament = {
      id: `local-${Date.now()}`,
      name: name.trim() || "Live 4Play Match",
      format,
      holes_count: gameHoles,
      team_names: names,
      scores: format === SALMON_FORMAT ? salmonPayload : blankScores(names.length, gameHoles),
      status: "live",
      created_by: session?.user?.email?.split("@")[0] || "Player",
      created_at: now,
      updated_at: now,
    };

    setSaving(true);
    setMessage("Creating tournament...");

    try {
      const accessToken = await token();
      if (accessToken) {
        const r = await fetch("/api/live-4play", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name: localTournament.name,
            format,
            holes_count: gameHoles,
            team_count: teamCount,
            team_names: names,
            scores: format === SALMON_FORMAT ? salmonPayload : undefined,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.ok && j.storage === "supabase" && j.tournament) {
          setStorageMode("supabase");
          setTournaments((prev) => [j.tournament, ...prev.filter((item) => item.id !== j.tournament.id)]);
          setSelectedId(j.tournament.id);
          setMessage("Tournament created and shared.");
          return;
        }
      }

      saveLocal([localTournament, ...localTournaments()]);
      setSelectedId(localTournament.id);
      setMessage("Tournament created on this device.");
    } finally {
      setSaving(false);
    }
  }

  async function updateTournament(next: Tournament, nextMessage = "Scores saved.") {
    const normalized = {
      ...next,
      scores: next.format === SALMON_FORMAT
        ? salmonScores(next.scores, next.team_names)
        : cleanScores(isScoreGrid(next.scores) ? next.scores : [], next.team_names.length, next.holes_count),
      updated_at: new Date().toISOString(),
    };

    setTournaments((prev) => prev.map((item) => (item.id === normalized.id ? normalized : item)));

    if (storageMode === "local" || normalized.id.startsWith("local-")) {
      saveLocal(localTournaments().map((item) => (item.id === normalized.id ? normalized : item)));
      setMessage(nextMessage);
      return;
    }

    setSaving(true);
    try {
      const accessToken = await token();
      const r = await fetch("/api/live-4play", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "update",
          id: normalized.id,
          format: normalized.format,
          holes_count: normalized.holes_count,
          team_names: normalized.team_names,
          scores: normalized.scores,
          status: normalized.status,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.ok && j.tournament) {
        setTournaments((prev) => prev.map((item) => (item.id === normalized.id ? j.tournament : item)));
        setMessage(nextMessage);
      } else {
        setMessage(j?.error || "Unable to save scores.");
      }
    } finally {
      setSaving(false);
    }
  }

  function setScore(teamIndex: number, holeIndex: number, value: string) {
    if (!selected) return;
    const nextScores = cleanScores(isScoreGrid(selected.scores) ? selected.scores : [], selected.team_names.length, selected.holes_count);
    const score = value === "" ? null : Number(value);
    nextScores[teamIndex][holeIndex] = Number.isFinite(score) ? score : null;
    updateTournament({ ...selected, scores: nextScores }, "Score updated.");
  }

  function setSalmonScore(teamIndex: number, playerIndex: number, holeIndex: number, value: string) {
    if (!selected || selected.format !== SALMON_FORMAT) return;
    const nextSalmon = salmonScores(selected.scores, selected.team_names);
    const score = value === "" ? null : Number(value);
    nextSalmon.player_scores[teamIndex][playerIndex][holeIndex] = Number.isFinite(score) ? score : null;
    updateTournament({ ...selected, scores: nextSalmon }, "Score updated.");
  }

  const leaderboard = useMemo(() => {
    if (!selected) return [];
    if (selected.format === SALMON_FORMAT) {
      const salmon = salmonScores(selected.scores, selected.team_names);
      return selected.team_names.map((teamName, index) => ({
        teamName,
        value: salmonTeamTotal(salmon, index),
        label: `${salmonTeamTotal(salmon, index)} pts`,
      }));
    }
    if (selected.format === "Skins") {
      const result = skinsByTeam(selected);
      return selected.team_names.map((teamName, index) => ({
        teamName,
        value: result.skins[index],
        label: `${result.skins[index]} skins`,
      }));
    }
    if (selected.format === "Ryder Cup") {
      const points = ryderPoints(selected);
      return selected.team_names.map((teamName, index) => ({
        teamName,
        value: points[index],
        label: `${points[index]} pts`,
      }));
    }
    return selected.team_names.map((teamName, index) => ({
      teamName,
      value: teamTotal(isScoreGrid(selected.scores) ? selected.scores[index] || [] : []),
      label: `${teamTotal(isScoreGrid(selected.scores) ? selected.scores[index] || [] : [])} pts`,
    }));
  }, [selected]);

  const page: React.CSSProperties = {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #06130d 0%, #020617 52%, #07111f 100%)",
    color: "#ecfdf5",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: 18,
  };
  const panel: React.CSSProperties = {
    border: "1px solid rgba(134,239,172,0.22)",
    background: "rgba(8,27,18,0.82)",
    borderRadius: 8,
    padding: 16,
    boxShadow: "0 16px 36px rgba(0,0,0,0.28)",
  };
  const button: React.CSSProperties = {
    minHeight: 40,
    border: "1px solid rgba(134,239,172,0.34)",
    background: "#10251a",
    color: "#ecfdf5",
    borderRadius: 7,
    padding: "9px 12px",
    fontWeight: 800,
    cursor: "pointer",
  };
  const input: React.CSSProperties = {
    width: "100%",
    minHeight: 38,
    border: "1px solid rgba(148,163,184,0.24)",
    background: "#020617",
    color: "#f8fafc",
    borderRadius: 7,
    padding: "8px 10px",
    outline: "none",
  };

  if (loading) {
    return (
      <main style={page}>
        <div style={{ maxWidth: 1120, margin: "40px auto", ...panel }}>Loading Live 4Play...</div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 16 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: 0 }}>Live 4Play</h1>
            <p style={{ margin: "6px 0 0", color: "#a7f3d0" }}>
              Live scorekeeping for your group. Storage: {storageMode.toUpperCase()}
            </p>
          </div>
          <nav style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="button" onClick={() => loadTournaments()} style={button}>
              Refresh
            </button>
            <Link href="/" style={{ ...button, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Home
            </Link>
          </nav>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <div style={panel}>
              <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Create Tournament</h2>
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 5, color: "#bbf7d0", fontSize: 13 }}>
                  Name
                  <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
                </label>

                {format !== SALMON_FORMAT ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[9, 18].map((holes) => (
                      <button
                        key={holes}
                        type="button"
                        onClick={() => setHolesCount(holes as 9 | 18)}
                        style={{ ...button, background: holesCount === holes ? "#22c55e" : "#10251a", color: holesCount === holes ? "#03120a" : "#ecfdf5" }}
                      >
                        {holes} Holes
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ border: "1px solid rgba(134,239,172,0.22)", borderRadius: 7, padding: 10, color: "#a7f3d0", background: "rgba(2,6,23,0.35)" }}>
                    Salmon Falls Regular uses the 9-hole 4Play course pars.
                  </div>
                )}

                <label style={{ display: "grid", gap: 5, color: "#bbf7d0", fontSize: 13 }}>
                  Format
                  <select
                    value={format}
                    onChange={(e) => {
                      const nextFormat = e.target.value as Format;
                      setFormat(nextFormat);
                      if (nextFormat === SALMON_FORMAT && name === "Saturday Nassau") setName(SALMON_FORMAT);
                    }}
                    style={input}
                  >
                    {FORMATS.map((formatName) => (
                      <option key={formatName} value={formatName}>
                        {formatName}
                      </option>
                    ))}
                  </select>
                </label>

                {format === "Coon" ? (
                  <div style={{ border: "1px solid rgba(250,204,21,0.4)", borderRadius: 7, padding: 10, color: "#fde68a", background: "rgba(113,63,18,0.24)" }}>
                    Not available until next release.
                  </div>
                ) : null}

                <label style={{ display: "grid", gap: 5, color: "#bbf7d0", fontSize: 13 }}>
                  Teams
                  <select value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))} style={input}>
                    {[2, 3, 4].map((count) => (
                      <option key={count} value={count}>
                        {count} Teams
                      </option>
                    ))}
                  </select>
                </label>

                {Array.from({ length: teamCount }, (_, index) => (
                  <label key={index} style={{ display: "grid", gap: 5, color: "#bbf7d0", fontSize: 13 }}>
                    Team {index + 1}
                    <input
                      value={teamNames[index]}
                      onChange={(e) =>
                        setTeamNames((prev) => prev.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)))
                      }
                      style={input}
                    />
                  </label>
                ))}

                {format === SALMON_FORMAT ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ borderTop: "1px solid rgba(134,239,172,0.18)", paddingTop: 12, color: "#bbf7d0", fontSize: 13, fontWeight: 800 }}>
                      Players Per Team
                    </div>
                    {Array.from({ length: teamCount }, (_team, teamIndex) => (
                      <label key={teamIndex} style={{ display: "grid", gap: 5, color: "#bbf7d0", fontSize: 13 }}>
                        {teamNames[teamIndex] || `Team ${teamIndex + 1}`}
                        <select
                          value={salmonPlayerCounts[teamIndex]}
                          onChange={(e) => setSalmonPlayerCount(teamIndex, Number(e.target.value))}
                          style={input}
                        >
                          {[1, 2, 3, 4].map((count) => (
                            <option key={count} value={count}>
                              {count} Player{count === 1 ? "" : "s"}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}

                    <div style={{ borderTop: "1px solid rgba(134,239,172,0.18)", paddingTop: 12, color: "#bbf7d0", fontSize: 13, fontWeight: 800 }}>
                      Assign Players
                    </div>
                    {Array.from({ length: teamCount }, (_team, teamIndex) => (
                      <div key={teamIndex} style={{ display: "grid", gap: 8 }}>
                        <div style={{ color: "#a7f3d0", fontSize: 13 }}>{teamNames[teamIndex] || `Team ${teamIndex + 1}`}</div>
                        {Array.from({ length: salmonPlayerCounts[teamIndex] || 1 }, (_player, playerIndex) => (
                          <select
                            key={playerIndex}
                            value={salmonTeamPlayers[teamIndex]?.[playerIndex] || ""}
                            onChange={(e) => assignSalmonPlayer(teamIndex, playerIndex, e.target.value)}
                            style={input}
                          >
                            <option value="">Select player {playerIndex + 1}</option>
                            {playerOptions.map((playerName) => (
                              <option key={playerName} value={playerName}>
                                {playerName}
                              </option>
                            ))}
                            <option value="__add_new__">Add New</option>
                          </select>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}

                <button type="button" onClick={createTournament} disabled={saving || format === "Coon"} style={{ ...button, background: "#22c55e", color: "#03120a", opacity: saving || format === "Coon" ? 0.55 : 1 }}>
                  {saving ? "Saving..." : "Create"}
                </button>
              </div>
            </div>

            <div style={panel}>
              <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Live Tournaments</h2>
              {tournaments.length === 0 ? (
                <p style={{ margin: 0, color: "#94a3b8" }}>No tournaments yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {tournaments.map((tournament) => (
                    <button
                      key={tournament.id}
                      type="button"
                      onClick={() => setSelectedId(tournament.id)}
                      style={{
                        ...button,
                        textAlign: "left",
                        borderColor: selected?.id === tournament.id ? "#86efac" : "rgba(134,239,172,0.22)",
                        background: selected?.id === tournament.id ? "#17351f" : "#07111f",
                      }}
                    >
                      <span style={{ display: "block" }}>{tournament.name}</span>
                      <span style={{ display: "block", marginTop: 4, color: "#a7f3d0", fontSize: 12 }}>
                        {tournament.format} | {tournament.holes_count} holes | {scoreDate(tournament.updated_at)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...panel, minWidth: 0 }}>
            {!selected ? (
              <div style={{ color: "#94a3b8" }}>Create or select a tournament to begin live scoring.</div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 24 }}>{selected.name}</h2>
                    <p style={{ margin: "6px 0 0", color: "#a7f3d0" }}>
                      {selected.format} | {selected.holes_count} holes | Created by {selected.created_by || "Player"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateTournament({ ...selected, status: selected.status === "complete" ? "live" : "complete" }, selected.status === "complete" ? "Tournament reopened." : "Tournament marked complete.")}
                    style={button}
                  >
                    {selected.status === "complete" ? "Reopen" : "Complete"}
                  </button>
                </div>

                {selected.format === "Skins" ? (
                  <div style={{ color: "#fde68a", fontSize: 14 }}>
                    Low score wins the skin. Ties carry forward and stack until the next won hole.
                  </div>
                ) : null}

                {selected.format === "Ryder Cup" ? (
                  <div style={{ display: "grid", gap: 6, color: "#fde68a", fontSize: 14 }}>
                    {ryderSegments(selected.holes_count).map((segment) => (
                      <div key={segment.label}>
                        Holes {segment.start + 1}-{segment.end}: {segment.label}
                      </div>
                    ))}
                  </div>
                ) : null}

                {selected.format === SALMON_FORMAT ? (
                  <>
                    <div style={{ color: "#fde68a", fontSize: 14 }}>
                      Enter gross strokes. Points: birdie or better 3, par 2, bogey 1, double bogey or worse 0.
                    </div>

                    <div style={{ overflowX: "auto", border: "1px solid rgba(134,239,172,0.18)", borderRadius: 8 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: 8, background: "#10251a", color: "#bbf7d0", position: "sticky", left: 0, zIndex: 1 }}>Team / Player</th>
                            {SALMON_PARS.map((par, holeIndex) => (
                              <th key={holeIndex} style={{ padding: 8, background: "#10251a", color: "#bbf7d0", minWidth: 62 }}>
                                H{holeIndex + 1}<br />
                                <span style={{ color: "#94a3b8", fontSize: 11 }}>P{par}</span>
                              </th>
                            ))}
                            <th style={{ padding: 8, background: "#10251a", color: "#bbf7d0" }}>Player Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.team_names.map((teamName, teamIndex) => {
                            const salmon = salmonScores(selected.scores, selected.team_names);
                            const players = salmon.team_players[teamIndex] || [];

                            return (
                              <Fragment key={teamName}>
                                <tr key={`${teamName}-team`}>
                                  <td style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.22)", background: "#12351f", position: "sticky", left: 0, fontWeight: 900 }}>
                                    {teamName}
                                  </td>
                                  {SALMON_PARS.map((_par, holeIndex) => (
                                    <td key={holeIndex} style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.22)", background: "#12351f", textAlign: "center", fontWeight: 900 }}>
                                      {salmonTeamHoleTotal(salmon, teamIndex, holeIndex)}
                                    </td>
                                  ))}
                                  <td style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.22)", background: "#12351f", textAlign: "center", fontWeight: 900 }}>
                                    {salmonTeamTotal(salmon, teamIndex)}
                                  </td>
                                </tr>
                                {players.map((playerName, playerIndex) => (
                                  <tr key={`${teamName}-${playerIndex}-${playerName}`}>
                                    <td style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.14)", background: "#07111f", position: "sticky", left: 0, fontWeight: 800 }}>
                                      {playerName || `Player ${playerIndex + 1}`}
                                    </td>
                                    {SALMON_PARS.map((_par, holeIndex) => {
                                      const strokes = salmon.player_scores[teamIndex]?.[playerIndex]?.[holeIndex] ?? null;
                                      const points = salmonPoints(strokes, SALMON_PARS[holeIndex]);

                                      return (
                                        <td key={holeIndex} style={{ padding: 5, borderTop: "1px solid rgba(134,239,172,0.14)" }}>
                                          <input
                                            type="number"
                                            inputMode="numeric"
                                            value={strokes ?? ""}
                                            onChange={(e) => setSalmonScore(teamIndex, playerIndex, holeIndex, e.target.value)}
                                            style={{ ...input, minHeight: 34, padding: "6px 7px", textAlign: "center" }}
                                          />
                                          <div style={{ marginTop: 3, color: "#a7f3d0", fontSize: 11, textAlign: "center" }}>
                                            {typeof strokes === "number" ? `${points} pts` : "--"}
                                          </div>
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.14)", textAlign: "center", fontWeight: 900 }}>
                                      {salmonPlayerTotal(salmon.player_scores[teamIndex]?.[playerIndex] || [])}
                                    </td>
                                  </tr>
                                ))}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ overflowX: "auto", border: "1px solid rgba(134,239,172,0.18)", borderRadius: 8 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: selected.holes_count === 18 ? 980 : 620 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: 8, background: "#10251a", color: "#bbf7d0", position: "sticky", left: 0, zIndex: 1 }}>Team</th>
                            {Array.from({ length: selected.holes_count }, (_, holeIndex) => (
                              <th key={holeIndex} style={{ padding: 8, background: "#10251a", color: "#bbf7d0", minWidth: 48 }}>
                                {holeIndex + 1}
                              </th>
                            ))}
                            <th style={{ padding: 8, background: "#10251a", color: "#bbf7d0" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.team_names.map((teamName, teamIndex) => (
                            <tr key={teamName}>
                              <td style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.14)", background: "#07111f", position: "sticky", left: 0, fontWeight: 800 }}>
                                {teamName}
                              </td>
                              {Array.from({ length: selected.holes_count }, (_, holeIndex) => (
                                <td key={holeIndex} style={{ padding: 5, borderTop: "1px solid rgba(134,239,172,0.14)" }}>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={isScoreGrid(selected.scores) ? selected.scores[teamIndex]?.[holeIndex] ?? "" : ""}
                                    onChange={(e) => setScore(teamIndex, holeIndex, e.target.value)}
                                    style={{ ...input, minHeight: 34, padding: "6px 7px", textAlign: "center" }}
                                  />
                                </td>
                              ))}
                              <td style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.14)", textAlign: "center", fontWeight: 900 }}>
                                {teamTotal(isScoreGrid(selected.scores) ? selected.scores[teamIndex] || [] : [])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {selected.format === "Skins" ? (
                      <div style={{ color: "#a7f3d0", fontSize: 14 }}>
                        {skinsByTeam(selected).carryOpen ? `${skinsByTeam(selected).carryOpen} skins are currently carried forward.` : "No open carryover."}
                      </div>
                    ) : null}
                  </>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  {leaderboard.map((row) => (
                    <div key={row.teamName} style={{ border: "1px solid rgba(134,239,172,0.2)", background: "#07111f", borderRadius: 8, padding: 12 }}>
                      <div style={{ color: "#bbf7d0", fontSize: 13 }}>{row.teamName}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{row.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {message ? <div style={{ color: "#cbd5e1" }}>{message}</div> : null}
      </div>
    </main>
  );
}
