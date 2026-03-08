"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Pool = { id: string; name: string };

type Tournament = {
  id: string;
  name: string;
  round1_lock?: string | null;
  round2_lock?: string | null;
  round3_lock?: string | null;
  round4_lock?: string | null;
};

type Golfer = { id: string; name: string };

type ScoreMap = Record<
  string,
  {
    1: string;
    2: string;
    3: string;
    4: string;
  }
>;

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function getLastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1].toLowerCase() : name.toLowerCase();
}

function emptyScoreRow() {
  return { 1: "", 2: "", 3: "", 4: "" };
}

export default function AdminPage() {
  const [pool, setPool] = useState<Pool | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  // Create tournament
  const [tName, setTName] = useState("Demo Tournament");
  const [r1, setR1] = useState("");
  const [r2, setR2] = useState("");
  const [r3, setR3] = useState("");
  const [r4, setR4] = useState("");

  // Add golfer
  const [gName, setGName] = useState("");

  // Edit tournament
  const [editingTournamentId, setEditingTournamentId] = useState<string>("");
  const [editTName, setEditTName] = useState("");
  const [editR1, setEditR1] = useState("");
  const [editR2, setEditR2] = useState("");
  const [editR3, setEditR3] = useState("");
  const [editR4, setEditR4] = useState("");

  // Edit golfer
  const [editingGolferId, setEditingGolferId] = useState<string>("");
  const [editGolferName, setEditGolferName] = useState("");

  // Busy states
  const [busyTournamentId, setBusyTournamentId] = useState<string>("");
  const [busyGolferId, setBusyGolferId] = useState<string>("");
  const [scoresBusy, setScoresBusy] = useState(false);

  // Search
  const [golferQuery, setGolferQuery] = useState("");

  // Scores
  const [scoreTournamentId, setScoreTournamentId] = useState<string>("");
  const [scoreEdits, setScoreEdits] = useState<ScoreMap>({});

  const isReady = useMemo(() => !!pool, [pool]);

  const filteredGolfers = useMemo(() => {
    const q = golferQuery.trim().toLowerCase();
    if (!q) return golfers;
    return golfers.filter((g) => g.name.toLowerCase().includes(q));
  }, [golfers, golferQuery]);

  const golfersByLastName = useMemo(() => {
    return [...golfers].sort((a, b) => {
      const lastA = getLastName(a.name);
      const lastB = getLastName(b.name);
      if (lastA !== lastB) return lastA.localeCompare(lastB);
      return a.name.localeCompare(b.name);
    });
  }, [golfers]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        window.location.href = "/";
        return;
      }

      const poolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";

      const { data: poolRow, error: pErr } = await supabase
        .from("pools")
        .select("id,name")
        .eq("name", poolName)
        .maybeSingle();

      if (pErr || !poolRow) {
        setStatus("Pool not found. Go back and click Setup LynxDemo Pool.");
        setLoading(false);
        return;
      }

      setPool(poolRow);
      await refresh(poolRow.id);
      setLoading(false);
    })();
  }, []);

  async function refresh(poolId?: string) {
    const activePoolId = poolId || pool?.id;
    if (!activePoolId) return;

    const { data: tData, error: tErr } = await supabase
      .from("tournaments")
      .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock")
      .eq("pool_id", activePoolId)
      .order("created_at", { ascending: false });

    const { data: gData, error: gErr } = await supabase
      .from("golfers")
      .select("id,name")
      .eq("pool_id", activePoolId)
      .order("name", { ascending: true });

    if (tErr) {
      setStatus(`Error loading tournaments: ${tErr.message}`);
    } else if (gErr) {
      setStatus(`Error loading golfers: ${gErr.message}`);
    } else {
      setStatus("");
    }

    const nextTournaments = (tData ?? []) as Tournament[];
    const nextGolfers = (gData ?? []) as Golfer[];

    setTournaments(nextTournaments);
    setGolfers(nextGolfers);

    if (!scoreTournamentId && nextTournaments.length > 0) {
      setScoreTournamentId(nextTournaments[0].id);
    } else if (
      scoreTournamentId &&
      !nextTournaments.some((t) => t.id === scoreTournamentId)
    ) {
      setScoreTournamentId(nextTournaments[0]?.id ?? "");
    }
  }

  useEffect(() => {
    loadScoresForTournament(scoreTournamentId);
  }, [scoreTournamentId, golfers]);

  async function loadScoresForTournament(tournamentId: string) {
    if (!pool || !tournamentId) {
      setScoreEdits({});
      return;
    }

    const base: ScoreMap = {};
    for (const g of golfers) {
      base[g.id] = emptyScoreRow();
    }

    const { data, error } = await supabase
      .from("scores")
      .select("golfer_id,round,strokes")
      .eq("pool_id", pool.id)
      .eq("tournament_id", tournamentId);

    if (error) {
      setStatus(`Error loading scores: ${error.message}`);
      setScoreEdits(base);
      return;
    }

    for (const row of data ?? []) {
      const gid = row.golfer_id as string;
      const round = row.round as 1 | 2 | 3 | 4;
      const strokes = row.strokes as number;

      if (!base[gid]) base[gid] = emptyScoreRow();
      if ([1, 2, 3, 4].includes(round)) {
        base[gid][round] = String(strokes);
      }
    }

    setScoreEdits(base);
  }

  async function createTournament() {
    if (!pool) return;

    if (!tName.trim()) {
      setStatus("Tournament name is required.");
      return;
    }

    setStatus("Creating tournament...");

    const { error } = await supabase.from("tournaments").insert({
      pool_id: pool.id,
      name: tName.trim(),
      round1_lock: r1 ? new Date(r1).toISOString() : null,
      round2_lock: r2 ? new Date(r2).toISOString() : null,
      round3_lock: r3 ? new Date(r3).toISOString() : null,
      round4_lock: r4 ? new Date(r4).toISOString() : null,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Tournament created ✅");
    setTName("Demo Tournament");
    setR1("");
    setR2("");
    setR3("");
    setR4("");
    await refresh(pool.id);
  }

  async function addGolfer() {
    if (!pool) return;

    if (!gName.trim()) {
      setStatus("Golfer name is required.");
      return;
    }

    setStatus("Adding golfer...");

    const { error } = await supabase.from("golfers").insert({
      pool_id: pool.id,
      name: gName.trim(),
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setGName("");
    setStatus("Golfer added ✅");
    await refresh(pool.id);
  }

  function startEditTournament(t: Tournament) {
    setEditingTournamentId(t.id);
    setEditTName(t.name);
    setEditR1(toDatetimeLocal(t.round1_lock));
    setEditR2(toDatetimeLocal(t.round2_lock));
    setEditR3(toDatetimeLocal(t.round3_lock));
    setEditR4(toDatetimeLocal(t.round4_lock));
  }

  function cancelEditTournament() {
    setEditingTournamentId("");
    setEditTName("");
    setEditR1("");
    setEditR2("");
    setEditR3("");
    setEditR4("");
  }

  async function saveTournamentEdits(tournamentId: string) {
    if (!pool) return;

    if (!editTName.trim()) {
      setStatus("Tournament name is required.");
      return;
    }

    setBusyTournamentId(tournamentId);
    setStatus("Saving tournament...");

    try {
      const { error } = await supabase
        .from("tournaments")
        .update({
          name: editTName.trim(),
          round1_lock: editR1 ? new Date(editR1).toISOString() : null,
          round2_lock: editR2 ? new Date(editR2).toISOString() : null,
          round3_lock: editR3 ? new Date(editR3).toISOString() : null,
          round4_lock: editR4 ? new Date(editR4).toISOString() : null,
        })
        .eq("id", tournamentId);

      if (error) {
        setStatus(`Save tournament failed: ${error.message}`);
        return;
      }

      setStatus("Tournament updated ✅");
      cancelEditTournament();
      await refresh(pool.id);
    } finally {
      setBusyTournamentId("");
    }
  }

  async function deleteTournament(tournamentId: string, tournamentName: string) {
    if (!pool) return;

    const ok = window.confirm(
      `Delete "${tournamentName}"?\n\nThis will also delete ALL picks and scores for that tournament.`
    );
    if (!ok) return;

    setBusyTournamentId(tournamentId);
    setStatus(`Deleting tournament "${tournamentName}"...`);

    try {
      const { error: sErr } = await supabase
        .from("scores")
        .delete()
        .eq("tournament_id", tournamentId);

      if (sErr) {
        setStatus(`Delete scores failed: ${sErr.message}`);
        return;
      }

      const { error: pErr } = await supabase
        .from("picks")
        .delete()
        .eq("tournament_id", tournamentId);

      if (pErr) {
        setStatus(`Delete picks failed: ${pErr.message}`);
        return;
      }

      const { error: tErr } = await supabase
        .from("tournaments")
        .delete()
        .eq("id", tournamentId);

      if (tErr) {
        setStatus(`Delete tournament failed: ${tErr.message}`);
        return;
      }

      if (editingTournamentId === tournamentId) cancelEditTournament();
      if (scoreTournamentId === tournamentId) {
        setScoreTournamentId("");
        setScoreEdits({});
      }

      setStatus("Tournament deleted ✅");
      await refresh(pool.id);
    } finally {
      setBusyTournamentId("");
    }
  }

  function startEditGolfer(g: Golfer) {
    setEditingGolferId(g.id);
    setEditGolferName(g.name);
  }

  function cancelEditGolfer() {
    setEditingGolferId("");
    setEditGolferName("");
  }

  async function saveGolferEdit(golferId: string) {
    if (!pool) return;

    if (!editGolferName.trim()) {
      setStatus("Golfer name is required.");
      return;
    }

    setBusyGolferId(golferId);
    setStatus("Saving golfer...");

    try {
      const { error } = await supabase
        .from("golfers")
        .update({ name: editGolferName.trim() })
        .eq("id", golferId);

      if (error) {
        setStatus(`Save golfer failed: ${error.message}`);
        return;
      }

      setStatus("Golfer updated ✅");
      cancelEditGolfer();
      await refresh(pool.id);
    } finally {
      setBusyGolferId("");
    }
  }

  async function deleteGolfer(golferId: string, golferName: string) {
    if (!pool) return;

    const ok = window.confirm(
      `Delete golfer "${golferName}"?\n\nThis will also delete ALL picks and scores involving that golfer.`
    );
    if (!ok) return;

    setBusyGolferId(golferId);
    setStatus(`Deleting golfer "${golferName}"...`);

    try {
      const { error: sErr } = await supabase
        .from("scores")
        .delete()
        .eq("golfer_id", golferId);

      if (sErr) {
        setStatus(`Delete scores failed: ${sErr.message}`);
        return;
      }

      const { error: pErr } = await supabase
        .from("picks")
        .delete()
        .eq("golfer_id", golferId);

      if (pErr) {
        setStatus(`Delete picks failed: ${pErr.message}`);
        return;
      }

      const { error: gErr } = await supabase
        .from("golfers")
        .delete()
        .eq("id", golferId);

      if (gErr) {
        setStatus(`Delete golfer failed: ${gErr.message}`);
        return;
      }

      if (editingGolferId === golferId) cancelEditGolfer();

      setStatus("Golfer deleted ✅");
      await refresh(pool.id);
    } finally {
      setBusyGolferId("");
    }
  }

  function updateScoreCell(golferId: string, round: 1 | 2 | 3 | 4, value: string) {
    if (!/^\d*$/.test(value)) return;
    setScoreEdits((prev) => ({
      ...prev,
      [golferId]: {
        ...(prev[golferId] || emptyScoreRow()),
        [round]: value,
      },
    }));
  }

  async function saveScores() {
    if (!pool || !scoreTournamentId) {
      setStatus("Select a tournament for scoring.");
      return;
    }

    setScoresBusy(true);
    setStatus("Saving scores...");

    try {
      const rows: Array<{
        pool_id: string;
        tournament_id: string;
        round: number;
        golfer_id: string;
        strokes: number;
      }> = [];

      for (const g of golfersByLastName) {
        const row = scoreEdits[g.id] || emptyScoreRow();

        ([1, 2, 3, 4] as const).forEach((round) => {
          const raw = row[round];
          if (raw !== "") {
            const n = Number(raw);
            if (!Number.isNaN(n)) {
              rows.push({
                pool_id: pool.id,
                tournament_id: scoreTournamentId,
                round,
                golfer_id: g.id,
                strokes: n,
              });
            }
          }
        });
      }

      const { error: deleteErr } = await supabase
        .from("scores")
        .delete()
        .eq("pool_id", pool.id)
        .eq("tournament_id", scoreTournamentId);

      if (deleteErr) {
        setStatus(`Clear existing scores failed: ${deleteErr.message}`);
        return;
      }

      if (rows.length > 0) {
        const { error: insertErr } = await supabase
          .from("scores")
          .insert(rows);

        if (insertErr) {
          setStatus(`Save scores failed: ${insertErr.message}`);
          return;
        }
      }

      setStatus("Scores saved ✅");
      await loadScoresForTournament(scoreTournamentId);
    } finally {
      setScoresBusy(false);
    }
  }

  async function clearScores() {
    if (!pool || !scoreTournamentId) return;

    const t = tournaments.find((x) => x.id === scoreTournamentId);
    const ok = window.confirm(
      `Clear all scores for "${t?.name || "this tournament"}"?`
    );
    if (!ok) return;

    setScoresBusy(true);
    setStatus("Clearing scores...");

    try {
      const { error } = await supabase
        .from("scores")
        .delete()
        .eq("pool_id", pool.id)
        .eq("tournament_id", scoreTournamentId);

      if (error) {
        setStatus(`Clear scores failed: ${error.message}`);
        return;
      }

      setScoreEdits({});
      await loadScoresForTournament(scoreTournamentId);
      setStatus("Scores cleared ✅");
    } finally {
      setScoresBusy(false);
    }
  }

  function fmtLock(v?: string | null) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(v);
  }

  const shell: React.CSSProperties = {
    maxWidth: 1040,
    margin: "24px auto",
    padding: 16,
    fontFamily: "system-ui",
    color: "#111",
  };

  const card: React.CSSProperties = {
    border: "1px solid #ddd",
    borderRadius: 16,
    padding: 16,
    background: "#fff",
    boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #d7d7d7",
    fontSize: 15,
  };

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    padding: 12,
    fontSize: 16,
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    fontWeight: 700,
  };

  const secondaryBtn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ccc",
    background: "#f7f7f7",
    fontWeight: 700,
    cursor: "pointer",
  };

  const dangerBtn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ffb3b3",
    background: "#fff2f2",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <main style={shell}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 4px" }}>LynxDemo Admin</h1>
          <div style={{ opacity: 0.7 }}>
            Manage tournaments, golfers, locks, scoring, and cleanup.
          </div>
        </div>

        <button onClick={() => refresh()} style={secondaryBtn} disabled={!pool}>
          Refresh
        </button>
      </div>

      <div style={{ marginTop: 12, marginBottom: 16 }}>
        <a href="/" style={{ textDecoration: "none" }}>Home</a>
        {" · "}
        <a href="/picks" style={{ textDecoration: "none" }}>Picks</a>
        {" · "}
        <a href="/leaderboard" style={{ textDecoration: "none" }}>Leaderboard</a>
      </div>

      {status ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            background: "#f6f6f6",
            border: "1px solid #ececec",
          }}
        >
          {status}
        </div>
      ) : null}

      {loading || !isReady ? (
        <p>{status || "Loading..."}</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <section style={card}>
              <h2 style={{ marginTop: 0 }}>Create Tournament</h2>

              <label>Name</label>
              <input
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                style={{ ...inputStyle, margin: "6px 0 12px" }}
              />

              <p style={{ margin: "0 0 8px", opacity: 0.8 }}>
                Lock times are local. Leave blank for “no lock” during testing.
              </p>

              <label>Round 1 Lock</label>
              <input
                type="datetime-local"
                value={r1}
                onChange={(e) => setR1(e.target.value)}
                style={{ ...inputStyle, margin: "6px 0 12px" }}
              />

              <label>Round 2 Lock</label>
              <input
                type="datetime-local"
                value={r2}
                onChange={(e) => setR2(e.target.value)}
                style={{ ...inputStyle, margin: "6px 0 12px" }}
              />

              <label>Round 3 Lock</label>
              <input
                type="datetime-local"
                value={r3}
                onChange={(e) => setR3(e.target.value)}
                style={{ ...inputStyle, margin: "6px 0 12px" }}
              />

              <label>Round 4 Lock</label>
              <input
                type="datetime-local"
                value={r4}
                onChange={(e) => setR4(e.target.value)}
                style={{ ...inputStyle, margin: "6px 0 12px" }}
              />

              <button onClick={createTournament} style={primaryBtn}>
                Create Tournament
              </button>
            </section>

            <section style={card}>
              <h2 style={{ marginTop: 0 }}>Add Golfer</h2>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  placeholder="Golfer name"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={addGolfer} style={{ ...secondaryBtn, minWidth: 84 }}>
                  Add
                </button>
              </div>

              <p style={{ marginTop: 12, opacity: 0.8 }}>
                Total golfers: <strong>{golfers.length}</strong>
              </p>
            </section>

            <section style={card}>
              <h2 style={{ marginTop: 0 }}>Tournament Score Grid</h2>

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <select
                  value={scoreTournamentId}
                  onChange={(e) => setScoreTournamentId(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="">Select tournament</option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={saveScores}
                  style={secondaryBtn}
                  disabled={!scoreTournamentId || scoresBusy}
                >
                  {scoresBusy ? "Saving…" : "Save Scores"}
                </button>

                <button
                  onClick={clearScores}
                  style={dangerBtn}
                  disabled={!scoreTournamentId || scoresBusy}
                >
                  Clear Scores
                </button>
              </div>

              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
                Sorted by golfer last name. Leave a cell blank if that round has no score yet.
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd" }}>Golfer</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd", width: 90 }}>R1</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd", width: 90 }}>R2</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd", width: 90 }}>R3</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd", width: 90 }}>R4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {golfersByLastName.map((g) => {
                      const row = scoreEdits[g.id] || emptyScoreRow();

                      return (
                        <tr key={g.id}>
                          <td style={{ padding: 10, borderBottom: "1px solid #f1f1f1", fontWeight: 700 }}>
                            {g.name}
                          </td>
                          {[1, 2, 3, 4].map((round) => (
                            <td key={round} style={{ padding: 10, borderBottom: "1px solid #f1f1f1" }}>
                              <input
                                value={row[round as 1 | 2 | 3 | 4]}
                                onChange={(e) =>
                                  updateScoreCell(
                                    g.id,
                                    round as 1 | 2 | 3 | 4,
                                    e.target.value
                                  )
                                }
                                inputMode="numeric"
                                placeholder="—"
                                style={{
                                  width: "100%",
                                  padding: 8,
                                  borderRadius: 8,
                                  border: "1px solid #d7d7d7",
                                  fontSize: 14,
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={card}>
              <h2 style={{ marginTop: 0 }}>Current Data</h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                  <div style={{ opacity: 0.65, fontSize: 13 }}>Pool</div>
                  <div style={{ fontWeight: 800, marginTop: 4 }}>{pool?.name}</div>
                </div>
                <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                  <div style={{ opacity: 0.65, fontSize: 13 }}>Tournaments</div>
                  <div style={{ fontWeight: 800, marginTop: 4 }}>{tournaments.length}</div>
                </div>
                <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                  <div style={{ opacity: 0.65, fontSize: 13 }}>Golfers</div>
                  <div style={{ fontWeight: 800, marginTop: 4 }}>{golfers.length}</div>
                </div>
              </div>

              <h3 style={{ marginBottom: 8 }}>Tournaments</h3>

              {tournaments.length === 0 ? (
                <p style={{ opacity: 0.8 }}>No tournaments yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {tournaments.map((t) => {
                    const editing = editingTournamentId === t.id;
                    const busy = busyTournamentId === t.id;

                    return (
                      <div
                        key={t.id}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: 14,
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        {!editing ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 800,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {t.name}
                              </div>

                              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6, lineHeight: 1.5 }}>
                                R1: {fmtLock(t.round1_lock)}<br />
                                R2: {fmtLock(t.round2_lock)}<br />
                                R3: {fmtLock(t.round3_lock)}<br />
                                R4: {fmtLock(t.round4_lock)}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                              <button
                                onClick={() => startEditTournament(t)}
                                style={secondaryBtn}
                                disabled={busy}
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => deleteTournament(t.id, t.name)}
                                disabled={busy}
                                style={{
                                  ...dangerBtn,
                                  cursor: busy ? "not-allowed" : "pointer",
                                }}
                              >
                                {busy ? "Working…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 800 }}>Edit Tournament</div>

                            <label>Name</label>
                            <input
                              value={editTName}
                              onChange={(e) => setEditTName(e.target.value)}
                              style={inputStyle}
                            />

                            <label>Round 1 Lock</label>
                            <input
                              type="datetime-local"
                              value={editR1}
                              onChange={(e) => setEditR1(e.target.value)}
                              style={inputStyle}
                            />

                            <label>Round 2 Lock</label>
                            <input
                              type="datetime-local"
                              value={editR2}
                              onChange={(e) => setEditR2(e.target.value)}
                              style={inputStyle}
                            />

                            <label>Round 3 Lock</label>
                            <input
                              type="datetime-local"
                              value={editR3}
                              onChange={(e) => setEditR3(e.target.value)}
                              style={inputStyle}
                            />

                            <label>Round 4 Lock</label>
                            <input
                              type="datetime-local"
                              value={editR4}
                              onChange={(e) => setEditR4(e.target.value)}
                              style={inputStyle}
                            />

                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => saveTournamentEdits(t.id)}
                                style={{ ...secondaryBtn, flex: 1 }}
                                disabled={busy}
                              >
                                {busy ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={cancelEditTournament}
                                style={{ ...secondaryBtn, flex: 1 }}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <h3 style={{ marginTop: 18, marginBottom: 8 }}>Golfers</h3>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  value={golferQuery}
                  onChange={(e) => setGolferQuery(e.target.value)}
                  placeholder="Search golfers..."
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => setGolferQuery("")}
                  style={secondaryBtn}
                  disabled={!golferQuery}
                >
                  Clear
                </button>
              </div>

              <div style={{ marginBottom: 10, fontSize: 13, opacity: 0.75 }}>
                Showing {filteredGolfers.length} of {golfers.length}
              </div>

              {filteredGolfers.length === 0 ? (
                <p style={{ opacity: 0.8 }}>No golfers match your search.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredGolfers.map((g) => {
                    const editing = editingGolferId === g.id;
                    const busy = busyGolferId === g.id;

                    return (
                      <div
                        key={g.id}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: 12,
                          padding: 10,
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {!editing ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>{g.name}</span>

                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => startEditGolfer(g)}
                                style={secondaryBtn}
                                disabled={busy}
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => deleteGolfer(g.id, g.name)}
                                disabled={busy}
                                style={{
                                  ...dangerBtn,
                                  cursor: busy ? "not-allowed" : "pointer",
                                }}
                              >
                                {busy ? "Working…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 700 }}>Edit Golfer</div>
                            <input
                              value={editGolferName}
                              onChange={(e) => setEditGolferName(e.target.value)}
                              style={inputStyle}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => saveGolferEdit(g.id)}
                                style={{ ...secondaryBtn, flex: 1 }}
                                disabled={busy}
                              >
                                {busy ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={cancelEditGolfer}
                                style={{ ...secondaryBtn, flex: 1 }}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}