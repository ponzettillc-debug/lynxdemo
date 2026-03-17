"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import AppLogo from "../components/AppLogo";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

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
  const [session, setSession] = useState<any>(null);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [golfers, setGolfers] = useState<Golfer[]>([]);

  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [round, setRound] = useState<number>(1);

  const [myPicksAllRounds, setMyPicksAllRounds] = useState<PickRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string>("Loading…");
  const [saving, setSaving] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);

  const [query, setQuery] = useState<string>("");
  const [showUsed, setShowUsed] = useState<boolean>(false);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        window.location.href = "/";
        return;
      }
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userEmail = session?.user?.email?.toLowerCase() ?? "";
  const isAdmin = useMemo(() => ADMIN_EMAILS.includes(userEmail), [userEmail]);

  const currentTournament: Tournament | null = useMemo(() => {
    return tournaments.find((t) => t.id === selectedTournament) ?? null;
  }, [tournaments, selectedTournament]);

  const lockIso = useMemo(
    () => getRoundLock(currentTournament, round),
    [currentTournament, round]
  );

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
    async function loadInitial() {
      try {
        setInitialLoading(true);
        setMessage("Loading…");

        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          window.location.href = "/";
          return;
        }

        const userId = sess.session.user.id;

        const { data: membership, error: memberErr } = await supabase
          .from("pool_members")
          .select("pool_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (memberErr) {
          setMessage(`Error loading pool membership: ${memberErr.message}`);
          setInitialLoading(false);
          return;
        }

        const resolvedPoolId = membership?.pool_id;
        if (!resolvedPoolId) {
          setMessage("You are not assigned to a pool yet.");
          setInitialLoading(false);
          return;
        }

        setPoolId(resolvedPoolId);

        const { data: tData, error: tErr } = await supabase
          .from("tournaments")
          .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock")
          .eq("pool_id", resolvedPoolId)
          .order("created_at", { ascending: false });

        if (tErr) {
          setMessage(`Error loading tournaments: ${tErr.message}`);
          setInitialLoading(false);
          return;
        }

        const { data: gData, error: gErr } = await supabase
          .from("golfers")
          .select("id,name")
          .eq("pool_id", resolvedPoolId);

        if (gErr) {
          setMessage(`Error loading golfers: ${gErr.message}`);
          setInitialLoading(false);
          return;
        }

        setTournaments((tData ?? []) as Tournament[]);
        setGolfers((gData ?? []) as Golfer[]);

        if ((tData ?? []).length === 0) {
          setMessage(
            isAdmin
              ? "No tournaments found yet. Use the admin area to create one."
              : "No tournaments are available yet."
          );
        } else {
          setSelectedTournament((tData ?? [])[0]?.id ?? "");
          setMessage("");
        }
      } catch (e: any) {
        setMessage(e?.message || "Load error");
      } finally {
        setInitialLoading(false);
      }
    }

    if (session) {
      loadInitial();
    }
  }, [session, isAdmin]);

  useEffect(() => {
    async function loadPicks() {
      try {
        if (!poolId || !selectedTournament) return;

        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          window.location.href = "/";
          return;
        }

        const userId = sess.session.user.id;

        const { data: pData, error: pErr } = await supabase
          .from("picks")
          .select("golfer_id, round")
          .eq("pool_id", poolId)
          .eq("tournament_id", selectedTournament)
          .eq("user_id", userId);

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
    }

    loadPicks();
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
        setMessage("Select a tournament");
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

      const userId = data.session?.user?.id;

      const { data: pData, error: pErr } = await supabase
        .from("picks")
        .select("golfer_id, round")
        .eq("pool_id", poolId)
        .eq("tournament_id", selectedTournament)
        .eq("user_id", userId);

      if (!pErr) {
        const picks = (pData ?? []) as PickRow[];
        setMyPicksAllRounds(picks);
      }
    } catch (e: any) {
      setMessage(
        e?.name === "AbortError" ? "Save timed out" : e?.message || "Save error"
      );
    } finally {
      setSaving(false);
    }
  }

  const lockLine = useMemo(() => {
    if (!lockMs) return { status: "OPEN", detail: "No lock time set" };
    const dt = new Date(lockMs);
    if (isLocked) {
      return { status: "LOCKED", detail: `Locked since ${dt.toLocaleString()}` };
    }
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
    return selected.map((id) => byId.get(id)).filter(Boolean) as Golfer[];
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
  const availableCount = golfersSorted.filter(
    (g) => !usedBefore.has(g.id) || selectedSet.has(g.id)
  ).length;
  const usedCount = golfersSorted.filter(
    (g) => usedBefore.has(g.id) && !selectedSet.has(g.id)
  ).length;

  const styles = {
    page: {
      minHeight: "100vh",
      background:
        "radial-gradient(circle at top, rgba(34,197,94,0.08) 0%, rgba(15,23,42,1) 22%, rgba(2,6,23,1) 100%)",
      color: "#f8fafc",
      fontFamily: "Inter, system-ui, sans-serif",
      padding: "18px 14px 120px",
    } as React.CSSProperties,

    shell: {
      maxWidth: 900,
      margin: "0 auto",
    } as React.CSSProperties,

    topBar: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      flexWrap: "wrap",
      marginBottom: 14,
    } as React.CSSProperties,

    brand: {
      display: "flex",
      flexDirection: "column" as const,
      gap: 6,
    } as React.CSSProperties,

    title: {
      margin: 0,
      fontSize: 30,
      fontWeight: 900,
      letterSpacing: -0.6,
    } as React.CSSProperties,

    subtitle: {
      margin: 0,
      color: "#94a3b8",
      fontSize: 14,
    } as React.CSSProperties,

    nav: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
    } as React.CSSProperties,

    navLink: {
      textDecoration: "none",
      color: "#e2e8f0",
      fontWeight: 700,
      fontSize: 14,
      padding: "10px 14px",
      borderRadius: 999,
      background: "rgba(15,23,42,0.88)",
      border: "1px solid rgba(148,163,184,0.14)",
    } as React.CSSProperties,

    card: {
      border: "1px solid rgba(148,163,184,0.14)",
      borderRadius: 22,
      padding: 16,
      background: "rgba(15,23,42,0.86)",
      boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
      backdropFilter: "blur(10px)",
    } as React.CSSProperties,

    alertOpen: {
      borderColor: "rgba(96,165,250,0.35)",
      background: "rgba(30,41,59,0.92)",
    } as React.CSSProperties,

    alertLocked: {
      borderColor: "rgba(248,113,113,0.35)",
      background: "rgba(69,10,10,0.35)",
    } as React.CSSProperties,

    input: {
      width: "100%",
      padding: "13px 14px",
      borderRadius: 14,
      border: "1px solid rgba(148,163,184,0.16)",
      fontSize: 15,
      outline: "none",
      background: "rgba(2,6,23,0.82)",
      color: "#f8fafc",
    } as React.CSSProperties,

    select: {
      width: "100%",
      padding: "13px 14px",
      borderRadius: 14,
      border: "1px solid rgba(148,163,184,0.16)",
      fontSize: 15,
      outline: "none",
      background: "rgba(2,6,23,0.82)",
      color: "#f8fafc",
    } as React.CSSProperties,

    roundRow: {
      marginTop: 12,
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 8,
    } as React.CSSProperties,

    roundBtn: (active: boolean): React.CSSProperties => ({
      minWidth: 0,
      padding: "12px 10px",
      borderRadius: 14,
      border: active
        ? "1px solid rgba(34,197,94,0.65)"
        : "1px solid rgba(148,163,184,0.16)",
      background: active
        ? "linear-gradient(135deg, rgba(34,197,94,0.24) 0%, rgba(22,163,74,0.18) 100%)"
        : "rgba(2,6,23,0.76)",
      color: active ? "#dcfce7" : "#e2e8f0",
      fontWeight: 900,
      fontSize: 14,
      cursor: "pointer",
    }),

    sectionHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 10,
      marginBottom: 12,
      flexWrap: "wrap",
    } as React.CSSProperties,

    sectionTitle: {
      margin: 0,
      fontWeight: 900,
      fontSize: 18,
      color: "#f8fafc",
    } as React.CSSProperties,

    sectionMeta: {
      fontSize: 13,
      color: "#94a3b8",
      fontWeight: 700,
    } as React.CSSProperties,

    chipRow: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
    } as React.CSSProperties,

    chip: (locked: boolean): React.CSSProperties => ({
      padding: "10px 12px",
      borderRadius: 999,
      border: "1px solid rgba(148,163,184,0.16)",
      background: locked ? "rgba(51,65,85,0.6)" : "rgba(34,197,94,0.14)",
      color: locked ? "#94a3b8" : "#f8fafc",
      fontWeight: 700,
      fontSize: 13,
      cursor: locked ? "default" : "pointer",
    }),

    message: {
      marginTop: 12,
      padding: 12,
      borderRadius: 14,
      background: "rgba(2,6,23,0.62)",
      border: "1px solid rgba(148,163,184,0.12)",
      fontSize: 14,
      color: "#e2e8f0",
    } as React.CSSProperties,

    toolbar: {
      marginTop: 12,
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 10,
    } as React.CSSProperties,

    smallBtn: {
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid rgba(148,163,184,0.16)",
      background: "rgba(15,23,42,0.92)",
      color: "#e2e8f0",
      fontWeight: 800,
      cursor: "pointer",
    } as React.CSSProperties,

    pill: (active: boolean): React.CSSProperties => ({
      padding: "9px 12px",
      borderRadius: 999,
      border: active
        ? "1px solid rgba(34,197,94,0.55)"
        : "1px solid rgba(148,163,184,0.16)",
      background: active ? "rgba(34,197,94,0.16)" : "rgba(2,6,23,0.72)",
      color: active ? "#dcfce7" : "#e2e8f0",
      fontWeight: 800,
      fontSize: 13,
      cursor: "pointer",
    }),

    groupHeader: {
      position: "sticky" as const,
      top: 0,
      zIndex: 1,
      padding: "7px 12px",
      borderRadius: 12,
      background: "rgba(30,41,59,0.98)",
      border: "1px solid rgba(148,163,184,0.12)",
      color: "#cbd5e1",
      fontWeight: 900,
      marginBottom: 8,
      backdropFilter: "blur(8px)",
    } as React.CSSProperties,

    golferList: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 10,
    } as React.CSSProperties,

    golferBtn: (opts: {
      selected: boolean;
      disabled: boolean;
      used: boolean;
    }): React.CSSProperties => ({
      width: "100%",
      textAlign: "left",
      padding: "15px 15px",
      borderRadius: 18,
      border: opts.selected
        ? "1px solid rgba(34,197,94,0.55)"
        : "1px solid rgba(148,163,184,0.12)",
      background: opts.selected
        ? "linear-gradient(135deg, rgba(34,197,94,0.16) 0%, rgba(15,23,42,0.98) 100%)"
        : "rgba(2,6,23,0.76)",
      color: opts.selected ? "#f8fafc" : opts.used ? "#94a3b8" : "#f8fafc",
      opacity: opts.disabled ? 0.55 : 1,
      cursor: opts.disabled ? "not-allowed" : "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    }),

    stickyBar: {
      position: "fixed" as const,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(2,6,23,0.92)",
      backdropFilter: "blur(14px)",
      borderTop: "1px solid rgba(148,163,184,0.14)",
      padding: "12px 14px",
    } as React.CSSProperties,

    stickyInner: {
      maxWidth: 900,
      margin: "0 auto",
      display: "flex",
      gap: 12,
      alignItems: "center",
    } as React.CSSProperties,

    saveBtn: {
      width: "100%",
      padding: "15px 14px",
      borderRadius: 16,
      border: "none",
      background:
        saving || !selectedTournament || isLocked
          ? "rgba(71,85,105,0.9)"
          : "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
      color: saving || !selectedTournament || isLocked ? "#cbd5e1" : "#03120a",
      fontWeight: 900,
      fontSize: 16,
      cursor: saving || !selectedTournament || isLocked ? "default" : "pointer",
      boxShadow:
        saving || !selectedTournament || isLocked
          ? "none"
          : "0 10px 24px rgba(34,197,94,0.26)",
    } as React.CSSProperties,
  };

  return (
    <>
      <main style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.topBar}>
            <div style={styles.brand}>
              <div style={{ marginBottom: 10 }}>
                <AppLogo width={220} height={90} />
              </div>
              <h1 style={styles.title}>Make your picks</h1>
              <p style={styles.subtitle}>
                Lock in 4 golfers each round. Used golfers from earlier rounds stay off
                the board.
              </p>
            </div>

            <div style={styles.nav}>
              <a href="/leaderboard" style={styles.navLink}>
                Leaderboard
              </a>
              <a href="/" style={styles.navLink}>
                Home
              </a>
              {isAdmin ? (
                <a href="/admin" style={styles.navLink}>
                  Admin
                </a>
              ) : null}
            </div>
          </div>

          <div
            style={{
              ...styles.card,
              ...(isLocked ? styles.alertLocked : styles.alertOpen),
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 15 }}>
              Round {round}: {lockLine.status}
            </div>
            <div
              style={{
                opacity: 0.9,
                marginTop: 4,
                fontSize: 14,
                color: "#cbd5e1",
              }}
            >
              {lockLine.detail}
            </div>
            {isLocked ? (
              <div
                style={{
                  marginTop: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#fecaca",
                }}
              >
                Picks are locked for this round. You can review your saved picks, but
                not change them.
              </div>
            ) : null}
          </div>

          <div style={{ ...styles.card, marginBottom: 14 }}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Tournament & Round</h2>
              <div style={styles.sectionMeta}>
                {selectedTournament ? "Ready to pick" : "Select a tournament"}
              </div>
            </div>

            <select
              value={selectedTournament}
              onChange={(e) => {
                setSelectedTournament(e.target.value);
                setMessage("");
              }}
              style={styles.select}
            >
              <option value="">Select Tournament</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <div style={styles.roundRow}>
              {[1, 2, 3, 4].map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setRound(r);
                    setMessage("");
                  }}
                  style={styles.roundBtn(round === r)}
                >
                  R{r}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 12, fontSize: 14, color: "#94a3b8" }}>
              Pick <b style={{ color: "#f8fafc" }}>exactly 4 golfers</b> each round.
            </div>
          </div>

          <div style={{ ...styles.card, marginBottom: 14 }}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Your card</h2>
              <div style={styles.sectionMeta}>Selected {selected.length}/4</div>
            </div>

            <div style={styles.chipRow}>
              {selectedGolfers.length === 0 ? (
                <div style={{ fontSize: 14, color: "#94a3b8" }}>
                  No golfers selected yet.
                </div>
              ) : (
                selectedGolfers.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => removePick(g.id)}
                    disabled={isLocked}
                    style={styles.chip(isLocked)}
                    title={isLocked ? "Locked" : "Remove pick"}
                  >
                    {g.name} {isLocked ? "" : "×"}
                  </button>
                ))
              )}
            </div>

            {message ? <div style={styles.message}>{message}</div> : null}
          </div>

          <div style={styles.card}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Golfer board</h2>
              <div style={styles.sectionMeta}>{totalVisibleCount} visible</div>
            </div>

            <div style={styles.toolbar}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search golfers…"
                style={styles.input}
                disabled={golfers.length === 0}
              />
              <button
                onClick={() => setQuery("")}
                style={styles.smallBtn}
                disabled={!query}
                title="Clear search"
              >
                Clear
              </button>
            </div>

            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button onClick={() => setShowUsed(false)} style={styles.pill(!showUsed)}>
                Available ({availableCount})
              </button>
              <button onClick={() => setShowUsed(true)} style={styles.pill(showUsed)}>
                Show Used ({usedCount})
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 13, color: "#94a3b8" }}>
              {q
                ? `Search filter: “${query.trim()}”`
                : "Sorted by last name and grouped by initial"}
            </div>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {initialLoading ? (
                <div style={{ fontSize: 14, color: "#94a3b8" }}>Loading golfers…</div>
              ) : groupedGolfers.length === 0 ? (
                <div style={{ fontSize: 14, color: "#94a3b8" }}>
                  No golfers match this filter.
                </div>
              ) : (
                groupedGolfers.map((group) => (
                  <div key={group.letter}>
                    <div style={styles.groupHeader}>{group.letter}</div>

                    <div style={styles.golferList}>
                      {group.golfers.map((g) => {
                        const isUsed = usedBefore.has(g.id);
                        const isSelected = selectedSet.has(g.id);
                        const disabled = isLocked || (isUsed && !isSelected);

                        return (
                          <button
                            key={g.id}
                            onClick={() => togglePick(g.id)}
                            disabled={disabled}
                            style={styles.golferBtn({
                              selected: isSelected,
                              disabled,
                              used: isUsed,
                            })}
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
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#94a3b8",
                                  marginTop: 4,
                                }}
                              >
                                Last name: {getLastName(g.name)}
                              </div>
                            </div>

                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                color: isSelected ? "#86efac" : "#cbd5e1",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isLocked
                                ? "LOCKED"
                                : disabled
                                ? "USED"
                                : isSelected
                                ? "SELECTED"
                                : "TAP"}
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
        </div>
      </main>

      <div style={styles.stickyBar}>
        <div style={styles.stickyInner}>
          <div style={{ minWidth: 160 }}>
            <div style={{ fontWeight: 900, fontSize: 14, color: "#f8fafc" }}>
              {isLocked ? `Round ${round} locked` : `Selected ${selected.length}/4`}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {selectedTournament ? "Save when ready" : "Pick a tournament first"}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <button
              onClick={savePicks}
              disabled={saving || !selectedTournament || isLocked}
              style={styles.saveBtn}
            >
              {saving ? "Saving…" : isLocked ? "Locked" : "Save Picks"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}