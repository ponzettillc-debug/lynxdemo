"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Tournament = {
  id: string;
  name: string;
  round1_lock: string | null;
  round2_lock: string | null;
  round3_lock: string | null;
  round4_lock: string | null;
};

type Golfer = { id: string; name: string };
type PickRow = { golfer_id: string; round: number };

function getRoundLock(t: Tournament | null, round: number): string | null {
  if (!t) return null;
  if (round === 1) return t.round1_lock;
  if (round === 2) return t.round2_lock;
  if (round === 3) return t.round3_lock;
  return t.round4_lock;
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function getLastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1].toLowerCase() : name.toLowerCase();
}

function getLastInitial(name: string) {
  const last = getLastName(name);
  const firstChar = last.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(firstChar) ? firstChar : "#";
}

export default function PicksPage() {
  const [poolId, setPoolId] = useState<string>("");

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [golfers, setGolfers] = useState<Golfer[]>([]);

  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [round, setRound] = useState<number>(1);

  const [myPicksAllRounds, setMyPicksAllRounds] = useState<PickRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string>("Loading…");
  const [saving, setSaving] = useState<boolean>(false);

  const [query, setQuery] = useState<string>("");
  const [showUsed, setShowUsed] = useState<boolean>(false);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const currentTournament: Tournament | null = useMemo(() => {
    return tournaments.find((t) => t.id === selectedTournament) ?? null;
  }, [tournaments, selectedTournament]);

  const lockIso = useMemo(() => getRoundLock(currentTournament, round), [currentTournament, round]);

  const lockMs = useMemo(() => {
    if (!lockIso) return null;
    const ms = new Date(lockIso).getTime();
    return Number.isFinite(ms) ? ms : null;
  }, [lockIso]);

  const isLocked = useMemo(() => {
    if (!lockMs) return false;
    return nowMs >= lockMs;
  }, [nowMs, lockMs]);

  const timeToLock = useMemo(() => {
    if (!lockMs) return null;
    return lockMs - nowMs;
  }, [lockMs, nowMs]);

  const usedBefore = useMemo(() => {
    const used = new Set<string>();
    for (const p of myPicksAllRounds) {
      if (p.round < round) used.add(p.golfer_id);
    }
    return used;
  }, [myPicksAllRounds, round]);

  useEffect(() => {
    (async () => {
      try {
        setMessage("Loading…");

        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          window.location.href = "/";
          return;
        }

        const token = sess.session.access_token;
        const boot = await fetch("/api/bootstrap", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });

        const bootJson = await boot.json().catch(() => ({} as any));
        if (!boot.ok) {
          setMessage(bootJson?.error || `Bootstrap failed (${boot.status})`);
          return;
        }

        const pool = bootJson.pool;
        if (!pool?.id) {
          setMessage("Pool not returned from bootstrap.");
          return;
        }

        setPoolId(pool.id);

        const { data: tData, error: tErr } = await supabase
          .from("tournaments")
          .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock")
          .eq("pool_id", pool.id)
          .order("created_at", { ascending: false });

        if (tErr) {
          setMessage(`Error loading tournaments: ${tErr.message}`);
          return;
        }

        const { data: gData, error: gErr } = await supabase
          .from("golfers")
          .select("id,name")
          .eq("pool_id", pool.id);

        if (gErr) {
          setMessage(`Error loading golfers: ${gErr.message}`);
          return;
        }

        setTournaments((tData ?? []) as Tournament[]);
        setGolfers((gData ?? []) as Golfer[]);

        if ((tData ?? []).length === 0) {
          setMessage("No tournaments found. Go to /admin and create one.");
        } else {
          setSelectedTournament((tData ?? [])[0]?.id ?? "");
          setMessage("");
        }
      } catch (e: any) {
        setMessage(e?.message || "Load error");
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!poolId || !selectedTournament) return;

        const { data: pData, error: pErr } = await supabase
          .from("picks")
          .select("golfer_id, round")
          .eq("pool_id", poolId)
          .eq("tournament_id", selectedTournament);

        if (pErr) {
          setMessage(`Error loading picks: ${pErr.message}`);
          return;
        }

        const picks = (pData ?? []) as PickRow[];
        setMyPicksAllRounds(picks);

        const current = picks.filter((p) => p.round === round).map((p) => p.golfer_id);
        setSelected(current);

        setMessage((m) => (m === "Loading…" ? "" : m));
      } catch (e: any) {
        setMessage(e?.message || "Pick load error");
      }
    })();
  }, [poolId, selectedTournament, round]);

  function togglePick(id: string) {
    if (isLocked) return;
    if (usedBefore.has(id) && !selected.includes(id)) return;

    if (selected.includes(id)) {
      setSelected((prev) => prev.filter((x) => x !== id));
    } else {
      if (selected.length >= 4) return;
      setSelected((prev) => [...prev, id]);
    }
  }

  function removePick(id: string) {
    if (isLocked) return;
    setSelected((prev) => prev.filter((x) => x !== id));
  }

  async function savePicks() {
    setSaving(true);
    setMessage("");

    try {
      if (isLocked) {
        setMessage(`Round ${round} is locked`);
        return;
      }

      if (!selectedTournament) {
        setMessage("Select tournament");
        return;
      }

      if (selected.length !== 4) {
        setMessage("Pick exactly 4 golfers");
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setMessage("Not logged in");
        return;
      }

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);

      let r: Response;
      try {
        r = await fetch("/api/picks/submit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tournamentId: selectedTournament,
            round,
            golferIds: selected,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(t);
      }

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok) {
        setMessage(j?.error || `Save failed (${r.status})`);
        return;
      }

      setMessage("Picks saved ✅");

      const { data: pData, error: pErr } = await supabase
        .from("picks")
        .select("golfer_id, round")
        .eq("pool_id", poolId)
        .eq("tournament_id", selectedTournament);

      if (!pErr) {
        const picks = (pData ?? []) as PickRow[];
        setMyPicksAllRounds(picks);
      }
    } catch (e: any) {
      setMessage(e?.name === "AbortError" ? "Save timed out" : e?.message || "Save error");
    } finally {
      setSaving(false);
    }
  }

  const lockLine = useMemo(() => {
    if (!lockMs) return { status: "OPEN", detail: "No lock time set" };
    const dt = new Date(lockMs);
    if (isLocked) return { status: "LOCKED", detail: `Locked since ${dt.toLocaleString()}` };
    return {
      status: "OPEN",
      detail: `Locks at ${dt.toLocaleString()} (in ${formatMs(timeToLock ?? 0)})`,
    };
  }, [lockMs, isLocked, timeToLock]);

  const q = query.trim().toLowerCase();
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const golfersSorted = useMemo(() => {
    return [...golfers].sort((a, b) => {
      const lastA = getLastName(a.name);
      const lastB = getLastName(b.name);
      if (lastA !== lastB) return lastA.localeCompare(lastB);
      return a.name.localeCompare(b.name);
    });
  }, [golfers]);

  const selectedGolfers = useMemo(() => {
    const byId = new Map(golfers.map((g) => [g.id, g] as const));
    return selected
      .map((id) => byId.get(id))
      .filter(Boolean) as Golfer[];
  }, [selected, golfers]);

  const availableFilteredGolfers = useMemo(() => {
    return golfersSorted.filter((g) => {
      const matchesSearch = !q || g.name.toLowerCase().includes(q);
      const isUsed = usedBefore.has(g.id);
      const isSelected = selectedSet.has(g.id);

      if (!matchesSearch) return false;
      if (showUsed) return true;
      return !isUsed || isSelected;
    });
  }, [golfersSorted, q, usedBefore, selectedSet, showUsed]);

  const golfersToShow = useMemo(() => {
    const byId = new Map<string, Golfer>();

    for (const g of availableFilteredGolfers) {
      byId.set(g.id, g);
    }

    // Always keep selected golfers visible
    for (const gid of selected) {
      const g = golfers.find((x) => x.id === gid);
      if (g) byId.set(g.id, g);
    }

    return Array.from(byId.values()).sort((a, b) => {
      const lastA = getLastName(a.name);
      const lastB = getLastName(b.name);
      if (lastA !== lastB) return lastA.localeCompare(lastB);
      return a.name.localeCompare(b.name);
    });
  }, [availableFilteredGolfers, selected, golfers]);

  const groupedGolfers = useMemo(() => {
    const groups: Record<string, Golfer[]> = {};

    for (const g of golfersToShow) {
      const key = getLastInitial(g.name);
      if (!groups[key]) groups[key] = [];
      groups[key].push(g);
    }

    const orderedKeys = Object.keys(groups).sort();

    return orderedKeys.map((key) => ({
      letter: key,
      golfers: groups[key],
    }));
  }, [golfersToShow]);

  const totalVisibleCount = golfersToShow.length;
  const availableCount = golfersSorted.filter((g) => !usedBefore.has(g.id) || selectedSet.has(g.id)).length;
  const usedCount = golfersSorted.filter((g) => usedBefore.has(g.id) && !selectedSet.has(g.id)).length;

  const shell: React.CSSProperties = {
    maxWidth: 760,
    margin: "0 auto",
    padding: "14px 12px 108px",
    fontFamily: "system-ui",
    color: "#111",
  };

  const card: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    borderRadius: 18,
    padding: 14,
    background: "#fff",
    boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
  };

  const topLink: React.CSSProperties = {
    textDecoration: "none",
    fontSize: 14,
  };

  const roundBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minWidth: 0,
    padding: "11px 10px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: active ? "#111" : "#f5f5f5",
    color: active ? "#fff" : "#111",
    fontWeight: 800,
    fontSize: 14,
  });

  const golferBtn = (opts: { selected: boolean; disabled: boolean; used: boolean }): React.CSSProperties => ({
    width: "100%",
    textAlign: "left",
    padding: "14px 14px",
    borderRadius: 16,
    border: "1px solid #e3e3e3",
    background: opts.selected ? "#111" : "#fff",
    color: opts.selected ? "#fff" : opts.used ? "#8a8a8a" : "#111",
    opacity: opts.disabled ? 0.55 : 1,
    cursor: opts.disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 16,
    outline: "none",
    background: "#fff",
  };

  const smallBtn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#f5f5f5",
    fontWeight: 800,
  };

  const stickyBar: React.CSSProperties = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(255,255,255,0.94)",
    backdropFilter: "blur(10px)",
    borderTop: "1px solid #e9e9e9",
    padding: "10px 12px",
  };

  const stickyInner: React.CSSProperties = {
    maxWidth: 760,
    margin: "0 auto",
    display: "flex",
    gap: 10,
    alignItems: "center",
  };

  const saveBtn: React.CSSProperties = {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 14,
    border: "1px solid #111",
    background: isLocked || !selectedTournament ? "#ddd" : "#111",
    color: isLocked || !selectedTournament ? "#666" : "#fff",
    fontWeight: 900,
    fontSize: 16,
  };

  const togglePill = (active: boolean): React.CSSProperties => ({
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: active ? "#111" : "#f5f5f5",
    color: active ? "#fff" : "#111",
    fontWeight: 800,
    fontSize: 13,
  });

  return (
    <>
      <main style={shell}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>LynxDemo Picks</h1>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>Grouped by last-name initial</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <a href="/leaderboard" style={topLink}>Leaderboard</a>
            <a href="/admin" style={topLink}>Admin</a>
            <a href="/" style={topLink}>Home</a>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            ...card,
            borderColor: isLocked ? "#ffb3b3" : "#cfe6ff",
            background: isLocked ? "#fff2f2" : "#f2f8ff",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 15 }}>
            Round {round}: {lockLine.status}
          </div>
          <div style={{ opacity: 0.85, marginTop: 4, fontSize: 14 }}>{lockLine.detail}</div>
          {isLocked ? (
            <div style={{ marginTop: 8, fontWeight: 600, fontSize: 14 }}>
              Picks are locked for this round. You can view your saved picks, but not change them.
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Tournament</div>

          <select
            value={selectedTournament}
            onChange={(e) => {
              setSelectedTournament(e.target.value);
              setMessage("");
            }}
            style={inputStyle}
          >
            <option value="">Select Tournament</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            {[1, 2, 3, 4].map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRound(r);
                  setMessage("");
                }}
                style={roundBtn(round === r)}
              >
                R{r}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 14, opacity: 0.78 }}>
            Pick <b>4 golfers</b> each round. Golfers used in earlier rounds stay locked.
          </div>
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 800 }}>Your Picks</div>
            <div style={{ fontWeight: 900, fontSize: 14 }}>Selected {selected.length}/4</div>
          </div>

          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {selectedGolfers.length === 0 ? (
              <div style={{ fontSize: 14, opacity: 0.65 }}>No golfers selected yet.</div>
            ) : (
              selectedGolfers.map((g) => (
                <button
                  key={g.id}
                  onClick={() => removePick(g.id)}
                  disabled={isLocked}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 999,
                    border: "1px solid #d7d7d7",
                    background: isLocked ? "#f3f3f3" : "#111",
                    color: isLocked ? "#777" : "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: isLocked ? "not-allowed" : "pointer",
                  }}
                  title={isLocked ? "Locked" : "Remove pick"}
                >
                  {g.name} {isLocked ? "" : "×"}
                </button>
              ))
            )}
          </div>

          {message ? (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 12,
                background: "#f6f6f6",
                fontSize: 14,
              }}
            >
              {message}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 800 }}>Golfers</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              {totalVisibleCount} visible
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search golfers…"
              style={inputStyle}
              disabled={golfers.length === 0}
            />
            <button
              onClick={() => setQuery("")}
              style={smallBtn}
              disabled={!query}
              title="Clear search"
            >
              Clear
            </button>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowUsed(false)}
              style={togglePill(!showUsed)}
            >
              Available ({availableCount})
            </button>
            <button
              onClick={() => setShowUsed(true)}
              style={togglePill(showUsed)}
            >
              Show Used ({usedCount})
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
            {q
              ? `Search filter: “${query.trim()}”`
              : "Sorted by last name and grouped by initial"}
          </div>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            {groupedGolfers.length === 0 ? (
              <div style={{ fontSize: 14, opacity: 0.7 }}>No golfers match this filter.</div>
            ) : (
              groupedGolfers.map((group) => (
                <div key={group.letter}>
                  <div
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                      padding: "6px 10px",
                      borderRadius: 10,
                      background: "#f5f5f5",
                      fontWeight: 900,
                      marginBottom: 8,
                    }}
                  >
                    {group.letter}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                    {group.golfers.map((g) => {
                      const isUsed = usedBefore.has(g.id);
                      const isSelected = selectedSet.has(g.id);
                      const disabled = isLocked || (isUsed && !isSelected);

                      return (
                        <button
                          key={g.id}
                          onClick={() => togglePick(g.id)}
                          disabled={disabled}
                          style={golferBtn({ selected: isSelected, disabled, used: isUsed })}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 800,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {g.name}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 3 }}>
                              Last name: {getLastName(g.name)}
                            </div>
                          </div>

                          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, whiteSpace: "nowrap" }}>
                            {isLocked ? "LOCKED" : disabled ? "USED" : isSelected ? "SELECTED" : "TAP"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <div style={stickyBar}>
        <div style={stickyInner}>
          <div style={{ minWidth: 145 }}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>
              {isLocked ? `Round ${round} locked` : `Selected ${selected.length}/4`}
            </div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>
              {selectedTournament ? "Save when ready" : "Pick a tournament first"}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <button
              onClick={savePicks}
              disabled={saving || !selectedTournament || isLocked}
              style={saveBtn}
            >
              {saving ? "Saving…" : isLocked ? "Locked" : "Save Picks"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}