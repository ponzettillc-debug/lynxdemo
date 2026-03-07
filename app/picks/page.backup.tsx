"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Tournament = { id: string; name: string };
type Golfer = { id: string; name: string };

export default function PicksPage() {
  const [poolId, setPoolId] = useState<string>("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [round, setRound] = useState<number>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string>("Loading…");

  useEffect(() => {
    (async () => {
      // 1) Require login
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        window.location.href = "/";
        return;
      }

      // 2) Ensure LynxDemo pool exists + membership
      const token = sess.session.access_token;
      const boot = await fetch("/api/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const bootJson = await boot.json().catch(() => ({}));
      if (!boot.ok) {
        setMessage(bootJson.error || `Bootstrap failed (${boot.status})`);
        return;
      }

      const pool = bootJson.pool;
      if (!pool?.id) {
        setMessage("Pool not returned from bootstrap.");
        return;
      }
      setPoolId(pool.id);

      // 3) Load tournaments + golfers
      const { data: tData, error: tErr } = await supabase
        .from("tournaments")
        .select("id,name")
        .eq("pool_id", pool.id)
        .order("created_at", { ascending: false });

      if (tErr) {
        setMessage(`Error loading tournaments: ${tErr.message}`);
        return;
      }

      const { data: gData, error: gErr } = await supabase
        .from("golfers")
        .select("id,name")
        .eq("pool_id", pool.id)
        .order("name", { ascending: true });

      if (gErr) {
        setMessage(`Error loading golfers: ${gErr.message}`);
        return;
      }

      setTournaments((tData ?? []) as any);
      setGolfers((gData ?? []) as any);

      if ((tData ?? []).length === 0) {
        setMessage("No tournaments found. Go to /admin and create one.");
      } else {
        setMessage("");
      }
    })();
  }, []);

  function togglePick(id: string) {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id));
    else {
      if (selected.length >= 4) return;
      setSelected([...selected, id]);
    }
  }

  async function savePicks() {
    setMessage("");

    if (!selectedTournament) {
      setMessage("Select tournament");
      return;
    }
    if (selected.length !== 4) {
      setMessage("Pick exactly 4 golfers");
      return;
    }
    if (!poolId) {
      setMessage("Pool not loaded yet. Try refresh.");
      return;
    }

    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) {
      setMessage("Not logged in. Refresh and log in again.");
      return;
    }

    // Optional: clear existing picks for that round (editable until lock)
    await supabase
      .from("picks")
      .delete()
      .eq("pool_id", poolId)
      .eq("user_id", userId)
      .eq("tournament_id", selectedTournament)
      .eq("round", round);

    const inserts = selected.map((golferId) => ({
      pool_id: poolId,
      user_id: userId,
      tournament_id: selectedTournament,
      round,
      golfer_id: golferId,
    }));

    const { error } = await supabase.from("picks").insert(inserts);
    if (error) setMessage(`Save failed: ${error.message}`);
    else setMessage("Picks saved ✅");
  }

  return (
    <main style={{ maxWidth: 600, margin: "20px auto", padding: 20, fontFamily: "system-ui" }}>
      <h1 style={{ marginTop: 0 }}>LynxDemo Picks</h1>
      <div style={{ marginBottom: 10 }}>
        <a href="/admin" style={{ textDecoration: "none" }}>Admin</a> {" | "}
        <a href="/" style={{ textDecoration: "none" }}>Home</a>
      </div>

      <label>Tournament</label>
      <select
        value={selectedTournament}
        onChange={(e) => setSelectedTournament(e.target.value)}
        style={{ width: "100%", padding: 10, margin: "6px 0 14px" }}
      >
        <option value="">Select Tournament</option>
        {tournaments.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <div style={{ marginBottom: 12 }}>
        <span>Round:</span>
        {[1, 2, 3, 4].map((r) => (
          <button
            key={r}
            onClick={() => {
              setRound(r);
              setSelected([]);
              setMessage("");
            }}
            style={{
              marginLeft: 8,
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: round === r ? "#222" : "#eee",
              color: round === r ? "#fff" : "#000",
            }}
          >
            {r}
          </button>
        ))}
      </div>

      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Pick 4 golfers (selected: {selected.length}/4)
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {golfers.map((g) => (
          <button
            key={g.id}
            onClick={() => togglePick(g.id)}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #ccc",
              background: selected.includes(g.id) ? "#222" : "#fff",
              color: selected.includes(g.id) ? "#fff" : "#000",
            }}
          >
            {g.name}
          </button>
        ))}
      </div>

      <button onClick={savePicks} style={{ marginTop: 16, width: "100%", padding: 12, fontSize: 16 }}>
        Save Picks
      </button>

      {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}
    </main>
  );
}