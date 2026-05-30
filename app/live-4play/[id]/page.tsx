"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Format = "Points" | "Skins" | "Ryder Cup" | "Coon" | "Salmon Falls - Regular" | "CMO Goes to Point Sebago";
type ScoreGrid = Array<Array<number | null>>;
type SalmonScores = {
  kind: "salmon_falls_regular";
  scoring_mode: SalmonScoringMode;
  player_options: string[];
  team_player_counts: number[];
  team_players: string[][];
  player_scores: Array<Array<Array<number | null>>>;
};
type SalmonScoringMode = "all" | "top3" | "top2";
type CmoScores = {
  kind: "cmo_point_sebago";
  player_options: string[];
  team_player_counts: number[];
  team_players: string[][];
  scramble_scores: ScoreGrid;
  point_scores: Array<Array<Array<number | null>>>;
  chip_ins: Array<Array<boolean[]>>;
  h2h_scores: Array<Array<Array<number | null>>>;
  h2h_matchups: Array<{ team1: string; team2: string }>;
};
type Tournament = {
  id: string;
  name: string;
  format: Format;
  holes_count: 9 | 18;
  team_names: string[];
  scores: ScoreGrid | SalmonScores | CmoScores;
  status: "live" | "complete";
  created_by?: string;
  created_at?: string;
  updated_at?: string;
};

const LOCAL_KEY = "4play_live_tournaments_v1";
const SALMON_FORMAT: Format = "Salmon Falls - Regular";
const CMO_FORMAT: Format = "CMO Goes to Point Sebago";
const SALMON_PARS = [4, 4, 3, 5, 5, 3, 4, 4, 4];
const POINT_SEBAGO_PARS = [5, 3, 4, 4, 4, 4, 5, 3, 4, 4, 5, 4, 4, 3, 4, 4, 3, 5];
const POINT_SEBAGO_YARDS = [457, 154, 405, 379, 387, 341, 550, 178, 432, 381, 533, 391, 381, 169, 286, 398, 184, 479];
const POINT_SEBAGO_NOTES = [
  "Majestic dogleg par 5 with framed fairway bunkers.",
  "Mid-to-short iron par 3 guarded by right bunkers.",
  "Demanding elevated tee shot to a narrow landing area.",
  "Accuracy hole with bunkers and wetlands right.",
  "Shorter par 4 with a pond protecting most pins.",
  "Left-center tee shot sets up birdie possibility.",
  "Longest par 5, wetlands and pond left, OB right.",
  "Two-tiered green where par is a good score.",
  "Long par 4 with an elevated green.",
  "Dogleg left with downhill approach.",
  "Par 5 with wetland stream and hidden cross bunker.",
  "Narrow landing area and elevated two-tier green.",
  "Approach over pond to shallow green.",
  "Par 3 with pond carry on left pins.",
  "Tempting drivable par 4 protected by pond.",
  "Narrow sloping fairway guarded by bunkers.",
  "Uphill amphitheater par 3.",
  "Risk-reward par 5 finishing over water.",
];
const VALID_SALMON_SCORING_MODES = new Set(["all", "top3", "top2"]);

function isScoreGrid(scores: Tournament["scores"]): scores is ScoreGrid {
  return Array.isArray(scores);
}

function cleanScores(scores: ScoreGrid | undefined, teamCount: number, holesCount: number): ScoreGrid {
  return Array.from({ length: teamCount }, (_, teamIndex) =>
    Array.from({ length: holesCount }, (_, holeIndex) => {
      const raw = scores?.[teamIndex]?.[holeIndex];
      return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    })
  );
}

function salmonScores(value: Tournament["scores"] | undefined, teamNames: string[]): SalmonScores {
  if (value && !Array.isArray(value) && value.kind === "salmon_falls_regular") {
    const counts = teamNames.map((_, teamIndex) => Math.max(1, Math.min(4, value.team_player_counts?.[teamIndex] || value.team_players?.[teamIndex]?.length || 1)));
    const teamPlayers = Array.from({ length: teamNames.length }, (_team, teamIndex) =>
      Array.from({ length: counts[teamIndex] }, (_player, playerIndex) => value.team_players?.[teamIndex]?.[playerIndex] || "")
    );
    return {
      kind: "salmon_falls_regular",
      scoring_mode: VALID_SALMON_SCORING_MODES.has(value.scoring_mode) ? value.scoring_mode : "all",
      player_options: value.player_options || [],
      team_player_counts: counts,
      team_players: teamPlayers,
      player_scores: teamPlayers.map((players, teamIndex) =>
        players.map((_player, playerIndex) =>
          Array.from({ length: 9 }, (_hole, holeIndex) => {
            const raw = value.player_scores?.[teamIndex]?.[playerIndex]?.[holeIndex];
            return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
          })
        )
      ),
    };
  }
  return {
    kind: "salmon_falls_regular",
    scoring_mode: "all",
    player_options: [],
    team_player_counts: teamNames.map(() => 1),
    team_players: teamNames.map(() => [""]),
    player_scores: teamNames.map(() => [Array.from({ length: 9 }, () => null)]),
  };
}

function cmoScores(value: Tournament["scores"] | undefined, teamNames: string[]): CmoScores {
  if (value && !Array.isArray(value) && value.kind === "cmo_point_sebago") {
    const counts = teamNames.map((_, teamIndex) => Math.max(1, Math.min(4, value.team_player_counts?.[teamIndex] || value.team_players?.[teamIndex]?.length || 1)));
    const teamPlayers = Array.from({ length: teamNames.length }, (_team, teamIndex) =>
      Array.from({ length: counts[teamIndex] }, (_player, playerIndex) => value.team_players?.[teamIndex]?.[playerIndex] || "")
    );
    return {
      kind: "cmo_point_sebago",
      player_options: value.player_options || [],
      team_player_counts: counts,
      team_players: teamPlayers,
      scramble_scores: cleanScores(value.scramble_scores, teamNames.length, 6),
      point_scores: teamPlayers.map((players, teamIndex) =>
        players.map((_player, playerIndex) =>
          Array.from({ length: 6 }, (_hole, holeIndex) => {
            const raw = value.point_scores?.[teamIndex]?.[playerIndex]?.[holeIndex];
            return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
          })
        )
      ),
      chip_ins: teamPlayers.map((players, teamIndex) =>
        players.map((_player, playerIndex) =>
          Array.from({ length: 6 }, (_hole, holeIndex) => !!value.chip_ins?.[teamIndex]?.[playerIndex]?.[holeIndex])
        )
      ),
      h2h_scores: teamPlayers.map((players, teamIndex) =>
        players.map((_player, playerIndex) =>
          Array.from({ length: 6 }, (_hole, holeIndex) => {
            const raw = value.h2h_scores?.[teamIndex]?.[playerIndex]?.[holeIndex];
            return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
          })
        )
      ),
      h2h_matchups: Array.from({ length: 4 }, (_match, matchIndex) => ({
        team1: value.h2h_matchups?.[matchIndex]?.team1 || teamPlayers[0]?.[matchIndex] || "",
        team2: value.h2h_matchups?.[matchIndex]?.team2 || teamPlayers[1]?.[matchIndex] || "",
      })),
    };
  }
  return {
    kind: "cmo_point_sebago",
    player_options: [],
    team_player_counts: teamNames.map(() => 1),
    team_players: teamNames.map(() => [""]),
    scramble_scores: cleanScores([], teamNames.length, 6),
    point_scores: teamNames.map(() => [Array.from({ length: 6 }, () => null)]),
    chip_ins: teamNames.map(() => [Array.from({ length: 6 }, () => false)]),
    h2h_scores: teamNames.map(() => [Array.from({ length: 6 }, () => null)]),
    h2h_matchups: Array.from({ length: 4 }, () => ({ team1: "", team2: "" })),
  };
}

function teamTotal(scores: Array<number | null>) {
  return scores.reduce<number>((sum, score) => sum + (typeof score === "number" ? score : 0), 0);
}

function salmonPoints(strokes: number | null, par: number) {
  if (typeof strokes !== "number") return 0;
  if (strokes <= par - 2) return 4;
  if (strokes === par - 1) return 3;
  if (strokes === par) return 2;
  if (strokes === par + 1) return 1;
  return 0;
}

function salmonPlayerTotal(scores: Array<number | null>) {
  return scores.reduce<number>((total, strokes, holeIndex) => total + salmonPoints(strokes, SALMON_PARS[holeIndex]), 0);
}

function salmonTeamHoleTotal(salmon: SalmonScores, teamIndex: number, holeIndex: number) {
  const points = (salmon.player_scores[teamIndex] || [])
    .map((playerScores) => salmonPoints(playerScores[holeIndex], SALMON_PARS[holeIndex]))
    .sort((a, b) => b - a);
  const limit = salmon.scoring_mode === "top2" ? 2 : salmon.scoring_mode === "top3" ? 3 : points.length;
  return points.slice(0, limit).reduce<number>((total, value) => total + value, 0);
}

function salmonTeamTotal(salmon: SalmonScores, teamIndex: number) {
  return Array.from({ length: 9 }, (_hole, holeIndex) => salmonTeamHoleTotal(salmon, teamIndex, holeIndex))
    .reduce((sum, value) => sum + value, 0);
}

function cmoScrambleStrokes(cmo: CmoScores, teamIndex: number) {
  return (cmo.scramble_scores[teamIndex] || []).reduce<number>(
    (total, strokes) => total + (typeof strokes === "number" ? strokes : 0),
    0
  );
}

function cmoScrambleRelative(cmo: CmoScores, teamIndex: number) {
  const entered = (cmo.scramble_scores[teamIndex] || []).filter((score) => typeof score === "number").length;
  const par = POINT_SEBAGO_PARS.slice(0, entered).reduce((sum, value) => sum + value, 0);
  return cmoScrambleStrokes(cmo, teamIndex) - par;
}

function relativeLabel(value: number) {
  if (value === 0) return "EVEN";
  return value > 0 ? `+${value}` : `${value}`;
}

function cmoScramblePoint(cmo: CmoScores, teamIndex: number) {
  const totals = [0, 1].map((index) => cmoScrambleStrokes(cmo, index));
  const complete = [0, 1].every((index) => (cmo.scramble_scores[index] || []).filter((score) => typeof score === "number").length === 6);
  if (!complete) return 0;
  if (totals[0] === totals[1]) return 0.5;
  return totals[teamIndex] < totals[1 - teamIndex] ? 1 : 0;
}

function cmoStageTwoHoleTotal(cmo: CmoScores, teamIndex: number, holeIndex: number) {
  return (cmo.point_scores[teamIndex] || []).reduce<number>((total, playerScores, playerIndex) => {
    const base = salmonPoints(playerScores[holeIndex], POINT_SEBAGO_PARS[holeIndex + 6]);
    return total + base + (cmo.chip_ins[teamIndex]?.[playerIndex]?.[holeIndex] ? 2 : 0);
  }, 0);
}

function cmoStageTwoTotal(cmo: CmoScores, teamIndex: number) {
  return Array.from({ length: 6 }, (_hole, holeIndex) => cmoStageTwoHoleTotal(cmo, teamIndex, holeIndex))
    .reduce((sum, value) => sum + value, 0);
}

function cmoStageTwoPoint(cmo: CmoScores, teamIndex: number) {
  const totals = [0, 1].map((index) => cmoStageTwoTotal(cmo, index));
  const complete = [0, 1].every((teamIndex) =>
    (cmo.point_scores[teamIndex] || []).some((playerScores) => playerScores.some((score) => typeof score === "number"))
  );
  if (!complete) return 0;
  if (totals[0] === totals[1]) return 0.5;
  return totals[teamIndex] > totals[1 - teamIndex] ? 1 : 0;
}

function cmoMatchPlayerIndex(cmo: CmoScores, teamIndex: number, matchIndex: number) {
  const selected = teamIndex === 0 ? cmo.h2h_matchups[matchIndex]?.team1 : cmo.h2h_matchups[matchIndex]?.team2;
  const idx = (cmo.team_players[teamIndex] || []).findIndex((name) => name === selected);
  return idx >= 0 ? idx : matchIndex;
}

function cmoH2HMatchPoint(cmo: CmoScores, matchIndex: number, teamIndex: number) {
  const skins = cmoH2HMatchSkins(cmo, matchIndex);
  const complete = cmoH2HMatchComplete(cmo, matchIndex);
  if (!complete) return 0;
  if (skins[0] === skins[1]) return 0.5;
  return skins[teamIndex] > skins[1 - teamIndex] ? 1 : 0;
}

function cmoH2HMatchSkins(cmo: CmoScores, matchIndex: number) {
  const playerIndexes = [cmoMatchPlayerIndex(cmo, 0, matchIndex), cmoMatchPlayerIndex(cmo, 1, matchIndex)];
  const scores = [0, 1].map((idx) => cmo.h2h_scores[idx]?.[playerIndexes[idx]] || []);
  const skins = [0, 0];
  for (let holeIndex = 0; holeIndex < 6; holeIndex += 1) {
    const a = scores[0][holeIndex];
    const b = scores[1][holeIndex];
    if (typeof a !== "number" || typeof b !== "number") continue;
    if (a === b) {
      skins[0] += 0.5;
      skins[1] += 0.5;
    } else {
      skins[a < b ? 0 : 1] += 1;
    }
  }
  return skins;
}

function cmoH2HMatchComplete(cmo: CmoScores, matchIndex: number) {
  const playerIndexes = [cmoMatchPlayerIndex(cmo, 0, matchIndex), cmoMatchPlayerIndex(cmo, 1, matchIndex)];
  const scores = [0, 1].map((idx) => cmo.h2h_scores[idx]?.[playerIndexes[idx]] || []);
  return scores.every((row) => row.filter((score) => typeof score === "number").length === 6);
}

function cmoH2HTotal(cmo: CmoScores, teamIndex: number) {
  return Array.from({ length: 4 }, (_match, matchIndex) => cmoH2HMatchPoint(cmo, matchIndex, teamIndex))
    .reduce<number>((sum, value) => sum + value, 0);
}

function cmoTeamTotal(cmo: CmoScores, teamIndex: number) {
  return cmoScramblePoint(cmo, teamIndex) + cmoStageTwoPoint(cmo, teamIndex) + cmoH2HTotal(cmo, teamIndex);
}

function findSingleWinner(values: Array<number | null>, highWins: boolean) {
  const entered = values
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => typeof item.value === "number");
  if (entered.length < 2) return null;
  const target = highWins ? Math.max(...entered.map((item) => item.value)) : Math.min(...entered.map((item) => item.value));
  const winners = entered.filter((item) => item.value === target);
  return winners.length === 1 ? winners[0].index : null;
}

function skinsByTeam(tournament: Tournament) {
  const skins = Array.from({ length: tournament.team_names.length }, () => 0);
  const scores = tournament.scores;
  if (!isScoreGrid(scores)) return { skins, carryOpen: 0 };
  let carry = 1;
  for (let hole = 0; hole < tournament.holes_count; hole += 1) {
    const winner = findSingleWinner(scores.map((teamScores) => teamScores[hole]), false);
    if (winner === null) carry += 1;
    else {
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
  ryderSegments(tournament.holes_count).forEach((segment, segmentIndex) => {
    if (segmentIndex === 0) {
      for (let hole = segment.start; hole < segment.end; hole += 1) {
        const winner = findSingleWinner(scores.map((teamScores) => teamScores[hole]), true);
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
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "[]") as Tournament[];
  } catch {
    return [];
  }
}

export default function Live4PlayScoringPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tournamentId = params.id;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageMode, setStorageMode] = useState("local");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [tournament, setTournament] = useState<Tournament | null>(null);

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

  async function token() {
    return supabase.auth.getSession().then(({ data }) => data.session?.access_token || "");
  }

  const loadTournament = useCallback(async (silent = false) => {
    const local = localTournaments().find((item) => item.id === tournamentId) || null;
    if (local) setTournament(local);

    const accessToken = await token();
    if (!accessToken) return;
    const r = await fetch(`/api/live-4play?id=${encodeURIComponent(tournamentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const j = await r.json().catch(() => ({}));
    if (j?.ok && j.storage === "supabase") {
      setStorageMode("supabase");
      setTournament((j.tournaments ?? [])[0] || null);
      if (!silent) setMessage("Scorecard synced.");
    } else {
      setStorageMode("local");
      if (!silent) setMessage("Using this device until the Supabase table is installed.");
    }
  }, [tournamentId]);

  useEffect(() => {
    if (!session) return;
    loadTournament(true);
    const id = window.setInterval(() => loadTournament(true), 10000);
    return () => window.clearInterval(id);
  }, [session, loadTournament]);

  function saveLocal(next: Tournament) {
    const nextRows = localTournaments().map((item) => (item.id === next.id ? next : item));
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(nextRows));
    setTournament(next);
  }

  async function updateTournament(next: Tournament, nextMessage = "Score updated.") {
    const normalized: Tournament = {
      ...next,
      scores: next.format === SALMON_FORMAT
        ? salmonScores(next.scores, next.team_names)
        : next.format === CMO_FORMAT
        ? cmoScores(next.scores, next.team_names)
        : cleanScores(isScoreGrid(next.scores) ? next.scores : [], next.team_names.length, next.holes_count),
      updated_at: new Date().toISOString(),
    };
    setTournament(normalized);
    if (storageMode === "local" || normalized.id.startsWith("local-")) {
      saveLocal(normalized);
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
        setTournament(j.tournament);
        setMessage(nextMessage);
      } else {
        setMessage(j?.error || "Unable to save score.");
      }
    } finally {
      setSaving(false);
    }
  }

  function setTeamScore(teamIndex: number, holeIndex: number, value: string) {
    if (!tournament) return;
    const nextScores = cleanScores(isScoreGrid(tournament.scores) ? tournament.scores : [], tournament.team_names.length, tournament.holes_count);
    const score = value === "" ? null : Number(value);
    nextScores[teamIndex][holeIndex] = Number.isFinite(score) ? score : null;
    updateTournament({ ...tournament, scores: nextScores });
  }

  function setSalmonScore(teamIndex: number, playerIndex: number, holeIndex: number, value: string) {
    if (!tournament) return;
    const nextSalmon = salmonScores(tournament.scores, tournament.team_names);
    const score = value === "" ? null : Number(value);
    nextSalmon.player_scores[teamIndex][playerIndex][holeIndex] = Number.isFinite(score) ? score : null;
    updateTournament({ ...tournament, scores: nextSalmon });
  }

  function updateCmo(mutator: (nextCmo: CmoScores) => void) {
    if (!tournament || tournament.format !== CMO_FORMAT) return;
    const nextCmo = cmoScores(tournament.scores, tournament.team_names);
    mutator(nextCmo);
    updateTournament({ ...tournament, scores: nextCmo });
  }

  function setCmoScrambleScore(teamIndex: number, holeIndex: number, value: string) {
    updateCmo((nextCmo) => {
      const score = value === "" ? null : Number(value);
      nextCmo.scramble_scores[teamIndex][holeIndex] = Number.isFinite(score) ? score : null;
    });
  }

  function setCmoPointScore(teamIndex: number, playerIndex: number, holeIndex: number, value: string) {
    updateCmo((nextCmo) => {
      const score = value === "" ? null : Number(value);
      nextCmo.point_scores[teamIndex][playerIndex][holeIndex] = Number.isFinite(score) ? score : null;
    });
  }

  function setCmoChipIn(teamIndex: number, playerIndex: number, holeIndex: number, checked: boolean) {
    updateCmo((nextCmo) => {
      nextCmo.chip_ins[teamIndex][playerIndex][holeIndex] = checked;
    });
  }

  function setCmoH2HScore(teamIndex: number, playerIndex: number, holeIndex: number, value: string) {
    updateCmo((nextCmo) => {
      const score = value === "" ? null : Number(value);
      nextCmo.h2h_scores[teamIndex][playerIndex][holeIndex] = Number.isFinite(score) ? score : null;
    });
  }

  function setCmoMatchup(matchIndex: number, teamIndex: number, playerName: string) {
    updateCmo((nextCmo) => {
      nextCmo.h2h_matchups[matchIndex] = {
        ...nextCmo.h2h_matchups[matchIndex],
        [teamIndex === 0 ? "team1" : "team2"]: playerName,
      };
    });
  }

  async function completeTournament() {
    if (!tournament) return;
    await updateTournament({ ...tournament, status: "complete" }, "Tournament completed.");
    router.push("/live-4play");
  }

  const leaderboard = useMemo(() => {
    if (!tournament) return [];
    if (tournament.format === SALMON_FORMAT) {
      const salmon = salmonScores(tournament.scores, tournament.team_names);
      return tournament.team_names.map((teamName, index) => ({ teamName, label: `${salmonTeamTotal(salmon, index)} pts` }));
    }
    if (tournament.format === CMO_FORMAT) {
      const cmo = cmoScores(tournament.scores, tournament.team_names);
      return tournament.team_names.map((teamName, index) => ({ teamName, label: `${cmoTeamTotal(cmo, index)} pts` }));
    }
    if (tournament.format === "Skins") {
      const result = skinsByTeam(tournament);
      return tournament.team_names.map((teamName, index) => ({ teamName, label: `${result.skins[index]} skins` }));
    }
    if (tournament.format === "Ryder Cup") {
      const points = ryderPoints(tournament);
      return tournament.team_names.map((teamName, index) => ({ teamName, label: `${points[index]} pts` }));
    }
    return tournament.team_names.map((teamName, index) => ({
      teamName,
      label: `${teamTotal(isScoreGrid(tournament.scores) ? tournament.scores[index] || [] : [])} pts`,
    }));
  }, [tournament]);

  const isCmoPage = tournament?.format === CMO_FORMAT;
  const page: React.CSSProperties = {
    minHeight: "100vh",
    background: isCmoPage
      ? "linear-gradient(180deg, #050505 0%, #111827 48%, #d1d5db 100%)"
      : "linear-gradient(180deg, #06130d 0%, #020617 52%, #07111f 100%)",
    color: isCmoPage ? "#f8fafc" : "#ecfdf5",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: 12,
  };
  const panel: React.CSSProperties = {
    border: isCmoPage ? "1px solid rgba(229,231,235,0.34)" : "1px solid rgba(134,239,172,0.22)",
    background: isCmoPage ? "rgba(17,24,39,0.94)" : "rgba(8,27,18,0.82)",
    borderRadius: 8,
    padding: 12,
    boxShadow: isCmoPage ? "0 18px 42px rgba(0,0,0,0.42)" : "0 16px 36px rgba(0,0,0,0.28)",
  };
  const button: React.CSSProperties = {
    minHeight: 38,
    border: isCmoPage ? "1px solid rgba(229,231,235,0.62)" : "1px solid rgba(134,239,172,0.34)",
    background: isCmoPage ? "#e5e7eb" : "#10251a",
    color: isCmoPage ? "#111827" : "#ecfdf5",
    borderRadius: 7,
    padding: "8px 10px",
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "none",
  };
  const input: React.CSSProperties = {
    width: "100%",
    minHeight: 34,
    border: isCmoPage ? "1px solid rgba(156,163,175,0.72)" : "1px solid rgba(148,163,184,0.24)",
    background: isCmoPage ? "#f8fafc" : "#020617",
    color: isCmoPage ? "#0f172a" : "#f8fafc",
    borderRadius: 7,
    padding: "6px 7px",
    outline: "none",
    textAlign: "center",
  };
  const stickyTotal: React.CSSProperties = {
    position: "sticky",
    right: 0,
    zIndex: 3,
    background: isCmoPage ? "#e5e7eb" : "#12351f",
    color: isCmoPage ? "#111827" : "#ecfdf5",
    boxShadow: isCmoPage ? "-8px 0 12px rgba(15,23,42,0.16)" : "-8px 0 12px rgba(2,6,23,0.42)",
  };

  if (loading) {
    return <main style={page}><div style={panel}>Loading scorecard...</div></main>;
  }

  if (!tournament) {
    return (
      <main style={page}>
        <div style={{ maxWidth: 980, margin: "0 auto", ...panel }}>
          <p style={{ color: "#94a3b8" }}>Tournament not found.</p>
          <Link href="/live-4play" style={button}>Back to Live 4Play</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 12 }}>
        <header style={{ ...panel, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26 }}>{tournament.name}</h1>
              <p style={{ margin: "5px 0 0", color: isCmoPage ? "#d1d5db" : "#a7f3d0", fontSize: 13 }}>
                {tournament.format} | {tournament.holes_count} holes | {storageMode.toUpperCase()} {saving ? "| Saving..." : ""}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => loadTournament()} style={button}>Refresh</button>
              {tournament.status !== "complete" ? (
                <button type="button" onClick={completeTournament} style={{ ...button, background: isCmoPage ? "#f8fafc" : "#22c55e", color: isCmoPage ? "#111827" : "#03120a" }}>
                  COMPLETE
                </button>
              ) : (
                <span style={{ ...button, cursor: "default", color: isCmoPage ? "#111827" : "#a7f3d0" }}>COMPLETED</span>
              )}
              <Link href="/live-4play" style={button}>All Live</Link>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
            {leaderboard.map((row) => (
              <div key={row.teamName} style={{ border: isCmoPage ? "1px solid rgba(229,231,235,0.34)" : "1px solid rgba(134,239,172,0.18)", borderRadius: 8, padding: 10, background: isCmoPage ? "#f8fafc" : "#07111f", color: isCmoPage ? "#111827" : "#ecfdf5" }}>
                <div style={{ color: isCmoPage ? "#374151" : "#bbf7d0", fontSize: 12 }}>{row.teamName}</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{row.label}</div>
              </div>
            ))}
          </div>
          {tournament.format === CMO_FORMAT ? <CmoHeaderStageScores tournament={tournament} stickyTotal={stickyTotal} /> : null}
        </header>

        <section style={panel}>
          {tournament.format === SALMON_FORMAT ? (
            <SalmonTable tournament={tournament} input={input} stickyTotal={stickyTotal} setSalmonScore={setSalmonScore} />
          ) : tournament.format === CMO_FORMAT ? (
            <CmoTable
              tournament={tournament}
              input={input}
              stickyTotal={stickyTotal}
              setScrambleScore={setCmoScrambleScore}
              setPointScore={setCmoPointScore}
              setChipIn={setCmoChipIn}
              setH2HScore={setCmoH2HScore}
              setMatchup={setCmoMatchup}
            />
          ) : (
            <TeamScoreTable tournament={tournament} input={input} stickyTotal={stickyTotal} setTeamScore={setTeamScore} />
          )}
        </section>

        {tournament.format === "Skins" ? (
          <div style={{ color: "#a7f3d0", fontSize: 14 }}>
            {skinsByTeam(tournament).carryOpen ? `${skinsByTeam(tournament).carryOpen} skins are currently carried forward.` : "No open carryover."}
          </div>
        ) : null}
        {message ? <div style={{ color: "#cbd5e1", fontSize: 13 }}>{message}</div> : null}
        {tournament.format === CMO_FORMAT ? <CmoFightClubFooter /> : null}
      </div>
    </main>
  );
}

function CmoFightClubFooter() {
  return (
    <footer className="fourplay-cartoon-footer" aria-label="CMO Fight Club footer">
      <Link href="/cmo-fight-club" aria-label="Open CMO Fight Club">
        <Image
          src="/4play-cartoon-footer.png"
          alt="Cartoon golfer celebrating with the 4Play crew on a golf course"
          width={2048}
          height={768}
          sizes="(max-width: 1180px) 100vw, 1180px"
        />
      </Link>
    </footer>
  );
}

function CmoHeaderStageScores({
  tournament,
  stickyTotal,
}: {
  tournament: Tournament;
  stickyTotal: React.CSSProperties;
}) {
  const cmo = cmoScores(tournament.scores, tournament.team_names);
  const stages = [
    { label: "Stage 1", detail: "Holes 1-6 Scramble", value: "Worth 1 pt", scorer: cmoScramblePoint },
    { label: "Stage 2", detail: "Holes 7-12 Points", value: "Worth 1 pt", scorer: cmoStageTwoPoint },
    { label: "Stage 3", detail: "Holes 13-18 H2H Skins", value: "Worth 4 pts", scorer: cmoH2HTotal },
  ];

  return (
    <div style={{ overflowX: "auto", border: "1px solid rgba(229,231,235,0.26)", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8, background: "#e5e7eb", color: "#111827", position: "sticky", left: 0, zIndex: 4 }}>Team</th>
            {stages.map((stage) => (
              <th key={stage.label} style={{ padding: 8, background: "#e5e7eb", color: "#111827", minWidth: 132 }}>
                {stage.label}
                <div style={{ color: "#374151", fontSize: 11, fontWeight: 800 }}>{stage.detail}</div>
                <div style={{ color: "#0f172a", fontSize: 11, fontWeight: 900 }}>{stage.value}</div>
              </th>
            ))}
            <th style={{ ...stickyTotal, padding: 8 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {tournament.team_names.map((teamName, teamIndex) => (
            <tr key={teamName}>
              <td style={{ padding: 8, borderTop: "1px solid rgba(229,231,235,0.18)", background: "#111827", position: "sticky", left: 0, zIndex: 2, fontWeight: 900 }}>{teamName}</td>
              {stages.map((stage) => (
                <td key={stage.label} style={{ padding: 8, borderTop: "1px solid rgba(229,231,235,0.18)", textAlign: "center", fontWeight: 900, color: "#f8fafc" }}>
                  {stage.scorer(cmo, teamIndex)} pts
                </td>
              ))}
              <td style={{ ...stickyTotal, padding: 8, borderTop: "1px solid rgba(229,231,235,0.18)", textAlign: "center", fontWeight: 900 }}>
                {cmoTeamTotal(cmo, teamIndex)} pts
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SalmonTable({
  tournament,
  input,
  stickyTotal,
  setSalmonScore,
}: {
  tournament: Tournament;
  input: React.CSSProperties;
  stickyTotal: React.CSSProperties;
  setSalmonScore: (teamIndex: number, playerIndex: number, holeIndex: number, value: string) => void;
}) {
  const salmon = salmonScores(tournament.scores, tournament.team_names);
  return (
    <div style={{ overflowX: "auto", border: "1px solid rgba(134,239,172,0.18)", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8, background: "#10251a", color: "#bbf7d0", position: "sticky", left: 0, zIndex: 4, minWidth: 128 }}>Player</th>
            {SALMON_PARS.map((par, holeIndex) => (
              <th key={holeIndex} style={{ padding: 8, background: "#10251a", color: "#bbf7d0", minWidth: 70 }}>
                H{holeIndex + 1}<br /><span style={{ color: "#94a3b8", fontSize: 11 }}>P{par}</span>
              </th>
            ))}
            <th style={{ ...stickyTotal, padding: 8, color: "#bbf7d0", minWidth: 72 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {tournament.team_names.map((teamName, teamIndex) => (
            <Fragment key={teamName}>
              <tr>
                <td style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.22)", background: "#12351f", position: "sticky", left: 0, zIndex: 2, fontWeight: 900 }}>{teamName}</td>
                {SALMON_PARS.map((_par, holeIndex) => (
                  <td key={holeIndex} style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.22)", background: "#12351f", textAlign: "center", fontWeight: 900 }}>
                    {salmonTeamHoleTotal(salmon, teamIndex, holeIndex)}
                  </td>
                ))}
                <td style={{ ...stickyTotal, padding: 8, borderTop: "1px solid rgba(134,239,172,0.22)", textAlign: "center", fontWeight: 900 }}>
                  {salmonTeamTotal(salmon, teamIndex)}
                </td>
              </tr>
              {(salmon.team_players[teamIndex] || []).map((playerName, playerIndex) => (
                <tr key={`${teamName}-${playerIndex}-${playerName}`}>
                  <td style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.14)", background: "#07111f", position: "sticky", left: 0, zIndex: 2, fontWeight: 800 }}>
                    {playerName || `Player ${playerIndex + 1}`}
                  </td>
                  {SALMON_PARS.map((par, holeIndex) => {
                    const strokes = salmon.player_scores[teamIndex]?.[playerIndex]?.[holeIndex] ?? null;
                    const points = salmonPoints(strokes, par);
                    return (
                      <td key={holeIndex} style={{ padding: 5, borderTop: "1px solid rgba(134,239,172,0.14)" }}>
                        <input type="number" inputMode="numeric" value={strokes ?? ""} onChange={(e) => setSalmonScore(teamIndex, playerIndex, holeIndex, e.target.value)} style={input} />
                        <div style={{ marginTop: 3, color: "#a7f3d0", fontSize: 11, textAlign: "center" }}>{typeof strokes === "number" ? `${points} pts` : "--"}</div>
                      </td>
                    );
                  })}
                  <td style={{ ...stickyTotal, padding: 8, borderTop: "1px solid rgba(134,239,172,0.14)", textAlign: "center", fontWeight: 900 }}>
                    {salmonPlayerTotal(salmon.player_scores[teamIndex]?.[playerIndex] || [])}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamScoreTable({
  tournament,
  input,
  stickyTotal,
  setTeamScore,
}: {
  tournament: Tournament;
  input: React.CSSProperties;
  stickyTotal: React.CSSProperties;
  setTeamScore: (teamIndex: number, holeIndex: number, value: string) => void;
}) {
  const scores = cleanScores(isScoreGrid(tournament.scores) ? tournament.scores : [], tournament.team_names.length, tournament.holes_count);
  return (
    <div style={{ overflowX: "auto", border: "1px solid rgba(134,239,172,0.18)", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: tournament.holes_count === 18 ? 1040 : 700 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8, background: "#10251a", color: "#bbf7d0", position: "sticky", left: 0, zIndex: 4, minWidth: 120 }}>Team</th>
            {Array.from({ length: tournament.holes_count }, (_, holeIndex) => (
              <th key={holeIndex} style={{ padding: 8, background: "#10251a", color: "#bbf7d0", minWidth: 64 }}>H{holeIndex + 1}</th>
            ))}
            <th style={{ ...stickyTotal, padding: 8, color: "#bbf7d0", minWidth: 72 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {tournament.team_names.map((teamName, teamIndex) => (
            <tr key={teamName}>
              <td style={{ padding: 8, borderTop: "1px solid rgba(134,239,172,0.14)", background: "#07111f", position: "sticky", left: 0, zIndex: 2, fontWeight: 800 }}>{teamName}</td>
              {Array.from({ length: tournament.holes_count }, (_, holeIndex) => (
                <td key={holeIndex} style={{ padding: 5, borderTop: "1px solid rgba(134,239,172,0.14)" }}>
                  <input type="number" inputMode="decimal" value={scores[teamIndex]?.[holeIndex] ?? ""} onChange={(e) => setTeamScore(teamIndex, holeIndex, e.target.value)} style={input} />
                </td>
              ))}
              <td style={{ ...stickyTotal, padding: 8, borderTop: "1px solid rgba(134,239,172,0.14)", textAlign: "center", fontWeight: 900 }}>
                {teamTotal(scores[teamIndex] || [])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CmoTable({
  tournament,
  input,
  stickyTotal,
  setScrambleScore,
  setPointScore,
  setChipIn,
  setH2HScore,
  setMatchup,
}: {
  tournament: Tournament;
  input: React.CSSProperties;
  stickyTotal: React.CSSProperties;
  setScrambleScore: (teamIndex: number, holeIndex: number, value: string) => void;
  setPointScore: (teamIndex: number, playerIndex: number, holeIndex: number, value: string) => void;
  setChipIn: (teamIndex: number, playerIndex: number, holeIndex: number, checked: boolean) => void;
  setH2HScore: (teamIndex: number, playerIndex: number, holeIndex: number, value: string) => void;
  setMatchup: (matchIndex: number, teamIndex: number, playerName: string) => void;
}) {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const cmo = cmoScores(tournament.scores, tournament.team_names);
  const stageButton = (value: 1 | 2 | 3, label: string, detail: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setStage(value)}
      style={{
        minHeight: 38,
        border: "1px solid rgba(229,231,235,0.44)",
        background: stage === value ? "#e5e7eb" : "#111827",
        color: stage === value ? "#111827" : "#f8fafc",
        borderRadius: 7,
        padding: "8px 10px",
        fontWeight: 900,
        cursor: "pointer",
        display: "grid",
        gap: 2,
        textAlign: "left",
      }}
    >
      <span>{label}</span>
      <span style={{ color: stage === value ? "#374151" : "#d1d5db", fontSize: 11, fontWeight: 800 }}>{detail}</span>
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ border: "1px solid rgba(229,231,235,0.28)", borderRadius: 8, padding: 10, background: "#050505" }}>
        <div style={{ fontWeight: 900, color: "#f8fafc" }}>Point Sebago Card</div>
        <div style={{ marginTop: 4, color: "#d1d5db", fontSize: 12 }}>
          Par 72 | Blue tees 6,485 yards | Stage holes use Point Sebago holes 1-18.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
        {stageButton(1, "Stage 1", "Holes 1-6 Scramble")}
        {stageButton(2, "Stage 2", "Holes 7-12 Points")}
        {stageButton(3, "Stage 3", "Holes 13-18 H2H Skins")}
      </div>

      {stage === 1 ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ color: "#f8fafc", fontSize: 14 }}>Stage 1, holes 1-6: team scramble. Enter gross team score by hole. Lowest 6-hole total wins 1 match point; tie splits 0.5 each.</div>
          <div style={{ overflowX: "auto", border: "1px solid rgba(229,231,235,0.22)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, background: "#111827", color: "#f8fafc", position: "sticky", left: 0, zIndex: 4 }}>Team</th>
                  {Array.from({ length: 6 }, (_hole, holeIndex) => (
                    <th key={holeIndex} style={{ padding: 8, background: "#111827", color: "#f8fafc", minWidth: 76 }}>
                      H{holeIndex + 1}<br /><span style={{ color: "#94a3b8", fontSize: 11 }}>{POINT_SEBAGO_YARDS[holeIndex]} | P{POINT_SEBAGO_PARS[holeIndex]}</span>
                    </th>
                  ))}
                  <th style={{ ...stickyTotal, padding: 8 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {tournament.team_names.map((teamName, teamIndex) => (
                  <tr key={teamName}>
                    <td style={{ padding: 8, borderTop: "1px solid rgba(229,231,235,0.16)", background: "#0f172a", position: "sticky", left: 0, zIndex: 2, fontWeight: 800 }}>{teamName}</td>
                    {Array.from({ length: 6 }, (_hole, holeIndex) => {
                      const score = cmo.scramble_scores[teamIndex]?.[holeIndex] ?? null;
                      return (
                        <td key={holeIndex} title={POINT_SEBAGO_NOTES[holeIndex]} style={{ padding: 5, borderTop: "1px solid rgba(229,231,235,0.16)" }}>
                          <input type="number" inputMode="numeric" value={score ?? ""} onChange={(e) => setScrambleScore(teamIndex, holeIndex, e.target.value)} style={input} />
                          <div style={{ marginTop: 3, color: "#d1d5db", fontSize: 11, textAlign: "center" }}>{typeof score === "number" ? relativeLabel(score - POINT_SEBAGO_PARS[holeIndex]) : "--"}</div>
                        </td>
                      );
                    })}
                    <td style={{ ...stickyTotal, padding: 8, borderTop: "1px solid rgba(229,231,235,0.16)", textAlign: "center", fontWeight: 900 }}>
                      {relativeLabel(cmoScrambleRelative(cmo, teamIndex))}
                      <div style={{ color: "#374151", fontSize: 11 }}>{cmoScramblePoint(cmo, teamIndex)} pt</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {stage === 2 ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ color: "#f8fafc", fontSize: 14 }}>Stage 2, holes 7-12: Salmon-style player points. Most team points wins 1 match point; tie splits 0.5 each. Check chip-in for +2.</div>
          <div style={{ overflowX: "auto", border: "1px solid rgba(229,231,235,0.22)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, background: "#111827", color: "#f8fafc", position: "sticky", left: 0, zIndex: 4 }}>Player</th>
                  {Array.from({ length: 6 }, (_hole, idx) => (
                    <th key={idx} style={{ padding: 8, background: "#111827", color: "#f8fafc", minWidth: 86 }}>
                      H{idx + 7}<br /><span style={{ color: "#94a3b8", fontSize: 11 }}>{POINT_SEBAGO_YARDS[idx + 6]} | P{POINT_SEBAGO_PARS[idx + 6]}</span>
                    </th>
                  ))}
                  <th style={{ ...stickyTotal, padding: 8 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {tournament.team_names.map((teamName, teamIndex) => (
                  <Fragment key={teamName}>
                    <tr>
                      <td style={{ padding: 8, borderTop: "1px solid rgba(229,231,235,0.22)", background: "#1f2937", position: "sticky", left: 0, zIndex: 2, fontWeight: 900 }}>{teamName}</td>
                      {Array.from({ length: 6 }, (_hole, holeIndex) => (
                        <td key={holeIndex} style={{ padding: 8, borderTop: "1px solid rgba(229,231,235,0.22)", background: "#1f2937", textAlign: "center", fontWeight: 900 }}>{cmoStageTwoHoleTotal(cmo, teamIndex, holeIndex)}</td>
                      ))}
                      <td style={{ ...stickyTotal, padding: 8, borderTop: "1px solid rgba(229,231,235,0.22)", textAlign: "center", fontWeight: 900 }}>
                        {cmoStageTwoTotal(cmo, teamIndex)}
                        <div style={{ color: "#374151", fontSize: 11 }}>{cmoStageTwoPoint(cmo, teamIndex)} pt</div>
                      </td>
                    </tr>
                    {(cmo.team_players[teamIndex] || []).map((playerName, playerIndex) => (
                      <tr key={`${teamName}-${playerName}-${playerIndex}`}>
                        <td style={{ padding: 8, borderTop: "1px solid rgba(229,231,235,0.16)", background: "#0f172a", position: "sticky", left: 0, zIndex: 2, fontWeight: 800 }}>{playerName}</td>
                        {Array.from({ length: 6 }, (_hole, holeIndex) => {
                          const score = cmo.point_scores[teamIndex]?.[playerIndex]?.[holeIndex] ?? null;
                          const chip = !!cmo.chip_ins[teamIndex]?.[playerIndex]?.[holeIndex];
                          return (
                            <td key={holeIndex} title={POINT_SEBAGO_NOTES[holeIndex + 6]} style={{ padding: 5, borderTop: "1px solid rgba(229,231,235,0.16)" }}>
                              <input type="number" inputMode="numeric" value={score ?? ""} onChange={(e) => setPointScore(teamIndex, playerIndex, holeIndex, e.target.value)} style={input} />
                              <label style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4, color: "#d1d5db", fontSize: 11 }}>
                                <input type="checkbox" checked={chip} onChange={(e) => setChipIn(teamIndex, playerIndex, holeIndex, e.target.checked)} />
                                Chip in
                              </label>
                            </td>
                          );
                        })}
                        <td style={{ ...stickyTotal, padding: 8, borderTop: "1px solid rgba(229,231,235,0.16)", textAlign: "center", fontWeight: 900 }}>
                          {(cmo.point_scores[teamIndex]?.[playerIndex] || []).reduce<number>((total, score, holeIndex) => total + salmonPoints(score, POINT_SEBAGO_PARS[holeIndex + 6]) + (cmo.chip_ins[teamIndex]?.[playerIndex]?.[holeIndex] ? 2 : 0), 0)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {stage === 3 ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ color: "#f8fafc", fontSize: 14 }}>Stage 3, holes 13-18: four head-to-head matchups, each worth 1 match point. Each hole won earns 1 skin; tied holes split 0.5 skins each.</div>
          <div style={{ display: "grid", gap: 8 }}>
            {Array.from({ length: 4 }, (_match, matchIndex) => (
              <div key={matchIndex} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(229,231,235,0.22)", borderRadius: 8, padding: 8, background: "#0f172a" }}>
                {[0, 1].map((teamIndex) => (
                  <label key={teamIndex} style={{ display: "grid", gap: 4, color: "#f8fafc", fontSize: 12 }}>
                    Match {matchIndex + 1} - {tournament.team_names[teamIndex]}
                    <select
                      value={teamIndex === 0 ? cmo.h2h_matchups[matchIndex]?.team1 || "" : cmo.h2h_matchups[matchIndex]?.team2 || ""}
                      onChange={(e) => setMatchup(matchIndex, teamIndex, e.target.value)}
                      style={{ ...input, textAlign: "left" }}
                    >
                      <option value="">Select player</option>
                      {(cmo.team_players[teamIndex] || []).map((playerName) => (
                        <option key={playerName} value={playerName}>{playerName}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div style={{ overflowX: "auto", border: "1px solid rgba(229,231,235,0.22)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, background: "#111827", color: "#f8fafc", position: "sticky", left: 0, zIndex: 4 }}>Match</th>
                  {Array.from({ length: 6 }, (_hole, idx) => (
                    <th key={idx} style={{ padding: 8, background: "#111827", color: "#f8fafc", minWidth: 78 }}>
                      H{idx + 13}<br /><span style={{ color: "#94a3b8", fontSize: 11 }}>{POINT_SEBAGO_YARDS[idx + 12]} | P{POINT_SEBAGO_PARS[idx + 12]}</span>
                    </th>
                  ))}
                  <th style={{ ...stickyTotal, padding: 8 }}>Skins</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }, (_match, matchIndex) => (
                  <Fragment key={matchIndex}>
                    {[0, 1].map((teamIndex) => {
                      const playerIndex = cmoMatchPlayerIndex(cmo, teamIndex, matchIndex);
                      const playerName = cmo.team_players[teamIndex]?.[playerIndex] || `${tournament.team_names[teamIndex]} Player ${matchIndex + 1}`;
                      const skins = cmoH2HMatchSkins(cmo, matchIndex)[teamIndex] || 0;
                      return (
                        <tr key={`${teamIndex}-${matchIndex}`}>
                          <td style={{ padding: 8, borderTop: teamIndex === 0 ? "4px solid rgba(229,231,235,0.42)" : "1px solid rgba(229,231,235,0.16)", background: "#0f172a", position: "sticky", left: 0, zIndex: 2, fontWeight: 800 }}>
                            <div style={{ color: "#d1d5db", fontSize: 11 }}>Match {matchIndex + 1}</div>
                            {playerName}
                          </td>
                          {Array.from({ length: 6 }, (_hole, holeIndex) => (
                            <td key={holeIndex} title={POINT_SEBAGO_NOTES[holeIndex + 12]} style={{ padding: 5, borderTop: teamIndex === 0 ? "4px solid rgba(229,231,235,0.42)" : "1px solid rgba(229,231,235,0.16)" }}>
                              <input type="number" inputMode="numeric" value={cmo.h2h_scores[teamIndex]?.[playerIndex]?.[holeIndex] ?? ""} onChange={(e) => setH2HScore(teamIndex, playerIndex, holeIndex, e.target.value)} style={input} />
                            </td>
                          ))}
                          <td style={{ ...stickyTotal, padding: 8, borderTop: teamIndex === 0 ? "4px solid rgba(229,231,235,0.42)" : "1px solid rgba(229,231,235,0.16)", textAlign: "center", fontWeight: 900 }}>
                            Skins: {skins}
                            <div style={{ color: "#374151", fontSize: 11 }}>{cmoH2HMatchPoint(cmo, matchIndex, teamIndex)} pt</div>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
