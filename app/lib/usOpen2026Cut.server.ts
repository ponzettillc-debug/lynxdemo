import "server-only";
import { gunzipSync } from "zlib";

const PGA_TOUR_GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const PGA_TOUR_API_KEY = "da2-gsrx5bibzbb4njvhl7t37wqyl4";
const US_OPEN_LEADERBOARD_ID = "R2026026";
const US_OPEN_PAR = 70;
const CUT_POSITION = 60;

type PublicPlayer = {
  player?: { displayName?: string; firstName?: string; lastName?: string };
  scoringData?: {
    playerState?: string;
    roundStatus?: string;
    rounds?: string[];
    total?: string;
    score?: string;
  };
};

export function normalizeCutPlayerName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getUsOpen2026Cut() {
  const response = await fetch(PGA_TOUR_GRAPHQL_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
      "x-api-key": PGA_TOUR_API_KEY,
      "x-pgat-platform": "web",
    },
    body: JSON.stringify({
      query: `query LeaderboardCompressedV3($id: ID!) {
        leaderboardCompressedV3(id: $id) { payload }
      }`,
      variables: { id: US_OPEN_LEADERBOARD_ID },
    }),
  });

  if (!response.ok) throw new Error(`U.S. Open cut request failed (${response.status}).`);
  const json = await response.json();
  const payload = json?.data?.leaderboardCompressedV3?.payload;
  if (!payload) throw new Error("U.S. Open cut data is unavailable.");

  const leaderboard = JSON.parse(
    gunzipSync(Buffer.from(payload, "base64")).toString("utf8")
  );
  const players = ((leaderboard?.players ?? []) as PublicPlayer[]).filter((row) => row.player);
  const scoreByName = new Map<string, string>();
  players.forEach((row) => {
    const name =
      row.player?.displayName ||
      `${row.player?.firstName ?? ""} ${row.player?.lastName ?? ""}`;
    const score = String(row.scoringData?.total || row.scoringData?.score || "").trim();
    if (score && score !== "-") {
      scoreByName.set(normalizeCutPlayerName(name), score);
    }
  });
  const completed = players
    .map((row) => {
      const rounds = (row.scoringData?.rounds ?? []).slice(0, 2).map(Number);
      return {
        row,
        total:
          rounds.length === 2 && rounds.every(Number.isFinite)
            ? rounds[0] + rounds[1] - US_OPEN_PAR * 2
            : null,
      };
    })
    .filter((item): item is { row: PublicPlayer; total: number } => item.total !== null)
    .sort((a, b) => a.total - b.total);

  if (completed.length < CUT_POSITION) {
    return {
      established: false,
      cutLine: null as number | null,
      cutNames: new Set<string>(),
      scoreByName,
    };
  }

  const cutLine = completed[CUT_POSITION - 1].total;
  const cutNames = new Set<string>();
  players.forEach((row) => {
    const name =
      row.player?.displayName ||
      `${row.player?.firstName ?? ""} ${row.player?.lastName ?? ""}`;
    const state = String(row.scoringData?.playerState || row.scoringData?.roundStatus || "").toUpperCase();
    const rounds = (row.scoringData?.rounds ?? []).slice(0, 2).map(Number);
    const total = rounds.length === 2 && rounds.every(Number.isFinite)
      ? rounds[0] + rounds[1] - US_OPEN_PAR * 2
      : null;

    if (["CUT", "WD", "WITHDRAWN", "DQ"].includes(state) || (total !== null && total > cutLine)) {
      cutNames.add(normalizeCutPlayerName(name));
    }
  });

  return { established: true, cutLine, cutNames, scoreByName };
}
