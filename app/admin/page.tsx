"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

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

type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

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

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

export default function AdminPage() {
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [pool, setPool] = useState<Pool | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [status, setStatus] = useState("");

  const [bootstrapping, setBootstrapping] = useState(false);

  // user management
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userBusyId, setUserBusyId] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [editingUserId, setEditingUserId] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserDisplayName, setEditUserDisplayName] = useState("");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [userQuery, setUserQuery] = useState("");

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        window.location.href = "/";
        return;
      }
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userEmail = session?.user?.email?.toLowerCase() ?? "";
  const isAdmin = useMemo(() => ADMIN_EMAILS.includes(userEmail), [userEmail]);
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

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q)
    );
  }, [users, userQuery]);

  useEffect(() => {
    if (!session || !isAdmin) return;

    (async () => {
      setStatus("Loading admin data...");

      const poolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";

      const { data: poolRow, error: pErr } = await supabase
        .from("pools")
        .select("id,name")
        .eq("name", poolName)
        .maybeSingle();

      if (pErr || !poolRow) {
        setStatus(`Pool not found. Go back and click Setup Pool. Looking for "${poolName}".`);
      } else {
        setPool(poolRow);
        await refresh(poolRow.id);
      }

      await loadUsers();
      setStatus("");
    })();
  }, [session, isAdmin]);

  useEffect(() => {
    if (!pool || !scoreTournamentId) {
      setScoreEdits({});
      return;
    }
    loadScoresForTournament(scoreTournamentId);
  }, [scoreTournamentId, golfers, pool]);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function loadUsers() {
    try {
      setUsersLoading(true);
      const token = await getAccessToken();

      const r = await fetch("/api/admin/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setStatus(j?.error || "Failed to load users.");
        return;
      }

      setUsers((j?.users ?? []) as AdminUser[]);
    } catch (err: any) {
      setStatus(err?.message || "Failed to load users.");
    } finally {
      setUsersLoading(false);
    }
  }

  function startEditUser(u: AdminUser) {
    setEditingUserId(u.id);
    setEditUserEmail(u.email);
    setEditUserDisplayName(u.display_name || "");
    setEditUserPassword("");
  }

  function cancelEditUser() {
    setEditingUserId("");
    setEditUserEmail("");
    setEditUserDisplayName("");
    setEditUserPassword("");
  }

  async function saveUserEdits(userId: string) {
    if (!editUserEmail.trim()) {
      setStatus("User email is required.");
      return;
    }

    if (editUserPassword && editUserPassword.length < 8) {
      setStatus("New password must be at least 8 characters.");
      return;
    }

    try {
      setUserBusyId(userId);
      setStatus("Saving user...");

      const token = await getAccessToken();

      const body: Record<string, string> = {
        email: editUserEmail.trim().toLowerCase(),
        display_name: editUserDisplayName.trim(),
      };

      if (editUserPassword.trim()) {
        body.password = editUserPassword;
      }

      const r = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setStatus(j?.error || "User update failed.");
        return;
      }

      setStatus("User updated ✅");
      cancelEditUser();
      await loadUsers();
    } catch (err: any) {
      setStatus(err?.message || "User update failed.");
    } finally {
      setUserBusyId("");
    }
  }

  async function deleteUser(userId: string, email: string) {
    const ok = window.confirm(`Delete user "${email}"?`);
    if (!ok) return;

    try {
      setUserBusyId(userId);
      setStatus(`Deleting user "${email}"...`);

      const token = await getAccessToken();

      const r = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setStatus(j?.error || "User deletion failed.");
        return;
      }

      setStatus("User deleted ✅");
      if (editingUserId === userId) cancelEditUser();
      await loadUsers();
    } catch (err: any) {
      setStatus(err?.message || "User deletion failed.");
    } finally {
      setUserBusyId("");
    }
  }

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

  async function signOut() {
    await supabase.auth.signOut();
    setStatus("Signed out.");
    router.push("/");
  }

  async function setupPool() {
    try {
      setBootstrapping(true);
      setStatus("Setting up 4Play...");

      const token = await getAccessToken();

      if (!token) {
        setStatus("You must be signed in.");
        return;
      }

      const r = await fetch("/api/bootstrap", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setStatus(j?.error || "Setup failed.");
        return;
      }

      setStatus("Pool ready ✅");

      const poolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";
      const { data: poolRow } = await supabase
        .from("pools")
        .select("id,name")
        .eq("name", poolName)
        .maybeSingle();

      if (poolRow) {
        setPool(poolRow);
        await refresh(poolRow.id);
      }
    } catch (err: any) {
      setStatus(err?.message || "Setup failed.");
    } finally {
      setBootstrapping(false);
    }
  }

  async function createPasswordUser() {
    const finalEmail = newUserEmail.trim().toLowerCase();

    if (!isAdmin) {
      setStatus("Admin access required.");
      return;
    }

    if (!finalEmail || !newUserPassword) {
      setStatus("Enter a user email and password.");
      return;
    }

    if (newUserPassword.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    try {
      setCreatingUser(true);
      setStatus("Creating user...");

      const token = await getAccessToken();

      const r = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: finalEmail,
          password: newUserPassword,
          display_name: newUserDisplayName.trim(),
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setStatus(j?.error || "User creation failed.");
        return;
      }

      setStatus(`User created: ${finalEmail}`);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserDisplayName("");
      await loadUsers();
    } catch (err: any) {
      setStatus(err?.message || "User creation failed.");
    } finally {
      setCreatingUser(false);
    }
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
        const { error: insertErr } = await supabase.from("scores").insert(rows);

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

  const styles = {
    page: {
      minHeight: "100vh",
      background:
        "radial-gradient(circle at top, rgba(34,197,94,0.12) 0%, rgba(15,23,42,1) 28%, rgba(2,6,23,1) 100%)",
      color: "#f8fafc",
      fontFamily: "Inter, system-ui, sans-serif",
      padding: "24px 16px 40px",
    } as React.CSSProperties,

    shell: {
      maxWidth: 1100,
      margin: "0 auto",
    } as React.CSSProperties,

    brandWrap: {
      marginBottom: 20,
      textAlign: "center" as const,
    } as React.CSSProperties,

    badge: {
      display: "inline-block",
      padding: "6px 12px",
      borderRadius: 999,
      background: "rgba(34,197,94,0.14)",
      color: "#86efac",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: "uppercase" as const,
      border: "1px solid rgba(34,197,94,0.25)",
      marginBottom: 14,
    } as React.CSSProperties,

    title: {
      margin: 0,
      fontSize: 38,
      fontWeight: 900,
      letterSpacing: -1,
    } as React.CSSProperties,

    subtitle: {
      marginTop: 10,
      marginBottom: 0,
      color: "#94a3b8",
      fontSize: 15,
      lineHeight: 1.5,
    } as React.CSSProperties,

    card: {
      background: "rgba(15,23,42,0.84)",
      border: "1px solid rgba(148,163,184,0.16)",
      borderRadius: 22,
      padding: 20,
      boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
      backdropFilter: "blur(10px)",
      marginBottom: 16,
    } as React.CSSProperties,

    sectionTitle: {
      marginTop: 0,
      marginBottom: 8,
      fontSize: 20,
      fontWeight: 800,
      color: "#f8fafc",
    } as React.CSSProperties,

    sectionText: {
      marginTop: 0,
      marginBottom: 18,
      color: "#94a3b8",
      lineHeight: 1.5,
      fontSize: 14,
    } as React.CSSProperties,

    input: {
      width: "100%",
      padding: "14px 16px",
      borderRadius: 14,
      border: "1px solid rgba(148,163,184,0.22)",
      background: "rgba(2,6,23,0.78)",
      color: "#f8fafc",
      fontSize: 16,
      outline: "none",
      marginBottom: 12,
    } as React.CSSProperties,

    primaryButton: {
      width: "100%",
      padding: "14px 16px",
      borderRadius: 14,
      border: "none",
      background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
      color: "#03120a",
      fontWeight: 900,
      fontSize: 15,
      cursor: "pointer",
      boxShadow: "0 10px 24px rgba(34,197,94,0.28)",
    } as React.CSSProperties,

    secondaryButton: {
      padding: "12px 14px",
      borderRadius: 12,
      border: "1px solid rgba(148,163,184,0.2)",
      background: "rgba(15,23,42,0.92)",
      color: "#e2e8f0",
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer",
    } as React.CSSProperties,

    ghostButton: {
      width: "100%",
      padding: "13px 16px",
      borderRadius: 14,
      border: "1px dashed rgba(148,163,184,0.25)",
      background: "transparent",
      color: "#cbd5e1",
      fontWeight: 700,
      fontSize: 14,
      cursor: "pointer",
    } as React.CSSProperties,

    dangerButton: {
      padding: "12px 14px",
      borderRadius: 12,
      border: "1px solid rgba(248,113,113,0.35)",
      background: "rgba(127,29,29,0.18)",
      color: "#fecaca",
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer",
    } as React.CSSProperties,

    message: {
      marginTop: 14,
      marginBottom: 0,
      fontSize: 14,
      color: "#cbd5e1",
      lineHeight: 1.45,
    } as React.CSSProperties,

    statRow: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      marginBottom: 18,
    } as React.CSSProperties,

    statCard: {
      borderRadius: 16,
      padding: 14,
      background: "rgba(2,6,23,0.6)",
      border: "1px solid rgba(148,163,184,0.14)",
    } as React.CSSProperties,

    statLabel: {
      margin: 0,
      color: "#94a3b8",
      fontSize: 12,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
    } as React.CSSProperties,

    statValue: {
      margin: "8px 0 0",
      fontSize: 18,
      fontWeight: 900,
      color: "#f8fafc",
      wordBreak: "break-word" as const,
    } as React.CSSProperties,

    divider: {
      border: "none",
      borderTop: "1px solid rgba(148,163,184,0.14)",
      margin: "18px 0",
    } as React.CSSProperties,

    quickGrid: {
      display: "grid",
      gap: 10,
    } as React.CSSProperties,

    topLinks: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap" as const,
      justifyContent: "center",
      marginBottom: 16,
    } as React.CSSProperties,

    linkButton: {
      textDecoration: "none",
      padding: "10px 14px",
      borderRadius: 999,
      background: "rgba(15,23,42,0.92)",
      border: "1px solid rgba(148,163,184,0.14)",
      color: "#e2e8f0",
      fontWeight: 700,
      fontSize: 14,
    } as React.CSSProperties,

    tableCell: {
      padding: 10,
      borderBottom: "1px solid rgba(148,163,184,0.12)",
      verticalAlign: "top" as const,
    } as React.CSSProperties,
  };

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.brandWrap}>
            <div style={styles.badge}>4Play</div>
            <h1 style={styles.title}>Loading admin...</h1>
            <p style={styles.subtitle}>Checking for an active session.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!session) return null;

  if (!isAdmin) {
    return (
      <main style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.brandWrap}>
            <div style={styles.badge}>4Play</div>
            <h1 style={styles.title}>Admin access only</h1>
            <p style={styles.subtitle}>
              This page is restricted to approved admin users.
            </p>
          </div>

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Access denied</h2>
            <p style={styles.sectionText}>
              Signed in as <strong style={{ color: "#f8fafc" }}>{session.user.email}</strong>
            </p>

            <div style={styles.quickGrid}>
              <button onClick={() => router.push("/")} style={styles.secondaryButton}>
                Go Home
              </button>
              <button onClick={signOut} style={styles.ghostButton}>
                Sign Out
              </button>
            </div>

            {!!status && <p style={styles.message}>{status}</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.brandWrap}>
          <div style={styles.badge}>4Play</div>
          <h1 style={styles.title}>Admin Dashboard</h1>
          <p style={styles.subtitle}>
            Manage tournaments, golfers, locks, scoring, access, and pool setup.
          </p>
        </div>

        <div style={styles.topLinks}>
          <a href="/" style={styles.linkButton}>Home</a>
          <a href="/picks" style={styles.linkButton}>Picks</a>
          <a href="/leaderboard" style={styles.linkButton}>Leaderboard</a>
        </div>

        {!!status && (
          <div style={{ ...styles.card, padding: 14 }}>
            <div style={styles.message}>{status}</div>
          </div>
        )}

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Admin session</h2>
          <p style={styles.sectionText}>
            Signed in as <strong style={{ color: "#f8fafc" }}>{session.user.email}</strong>
          </p>

          <div style={styles.statRow}>
            <div style={styles.statCard}>
              <p style={styles.statLabel}>Status</p>
              <p style={styles.statValue}>Live Session</p>
            </div>
            <div style={styles.statCard}>
              <p style={styles.statLabel}>Role</p>
              <p style={styles.statValue}>Admin</p>
            </div>
          </div>

          <div style={styles.quickGrid}>
            <button onClick={setupPool} disabled={bootstrapping} style={styles.primaryButton}>
              {bootstrapping ? "Setting Up Pool..." : "Setup Pool"}
            </button>
            <button onClick={() => refresh()} disabled={!pool} style={styles.secondaryButton}>
              Refresh Pool Data
            </button>
            <button onClick={loadUsers} disabled={usersLoading} style={styles.secondaryButton}>
              {usersLoading ? "Refreshing Users..." : "Refresh User List"}
            </button>
            <button onClick={signOut} style={styles.ghostButton}>
              Sign Out
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>User Management</h2>
          <p style={styles.sectionText}>
            Create users, view who is set up, edit email/display name, reset passwords, and delete users.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <input
              type="email"
              placeholder="Player email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              style={{ ...styles.input, marginBottom: 0 }}
            />
            <input
              type="text"
              placeholder="Display name"
              value={newUserDisplayName}
              onChange={(e) => setNewUserDisplayName(e.target.value)}
              style={{ ...styles.input, marginBottom: 0 }}
            />
            <input
              type="password"
              placeholder="Temporary or permanent password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              style={{ ...styles.input, marginBottom: 0 }}
            />
          </div>

          <button
            onClick={createPasswordUser}
            disabled={creatingUser}
            style={{
              ...styles.primaryButton,
              opacity: creatingUser ? 0.7 : 1,
              cursor: creatingUser ? "default" : "pointer",
            }}
          >
            {creatingUser ? "Creating User..." : "Create User"}
          </button>

          <p style={{ ...styles.sectionText, marginTop: 12, marginBottom: 12 }}>
  Existing passwords cannot be viewed. You can only set a new password.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search users by email or display name..."
              style={{ ...styles.input, flex: 1, marginBottom: 0 }}
            />
            <button
              onClick={() => setUserQuery("")}
              style={styles.secondaryButton}
              disabled={!userQuery}
            >
              Clear
            </button>
          </div>

          <div style={{ marginBottom: 10, fontSize: 13, color: "#94a3b8" }}>
            Showing {filteredUsers.length} of {users.length} users
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Email</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Display Name</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Created</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Last Sign In</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Confirmed</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr>
                    <td colSpan={6} style={styles.tableCell}>Loading users...</td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={styles.tableCell}>No users found.</td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const editing = editingUserId === u.id;
                    const busy = userBusyId === u.id;

                    return (
                      <tr key={u.id}>
                        <td style={styles.tableCell}>
                          {!editing ? (
                            u.email
                          ) : (
                            <input
                              value={editUserEmail}
                              onChange={(e) => setEditUserEmail(e.target.value)}
                              style={{ ...styles.input, marginBottom: 0 }}
                            />
                          )}
                        </td>

                        <td style={styles.tableCell}>
                          {!editing ? (
                            u.display_name || "—"
                          ) : (
                            <input
                              value={editUserDisplayName}
                              onChange={(e) => setEditUserDisplayName(e.target.value)}
                              placeholder="Display name"
                              style={{ ...styles.input, marginBottom: 8 }}
                            />
                          )}
                          {editing ? (
                            <input
                              type="password"
                              value={editUserPassword}
                              onChange={(e) => setEditUserPassword(e.target.value)}
                              placeholder="New password (optional)"
                              style={{ ...styles.input, marginBottom: 0 }}
                            />
                          ) : null}
                        </td>

                        <td style={styles.tableCell}>{fmtDate(u.created_at)}</td>
                        <td style={styles.tableCell}>{fmtDate(u.last_sign_in_at)}</td>
                        <td style={styles.tableCell}>
                          {u.email_confirmed_at ? "Yes" : "No"}
                        </td>

                        <td style={styles.tableCell}>
                          {!editing ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                onClick={() => startEditUser(u)}
                                style={styles.secondaryButton}
                                disabled={busy}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteUser(u.id, u.email)}
                                style={styles.dangerButton}
                                disabled={busy}
                              >
                                {busy ? "Working..." : "Delete"}
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                onClick={() => saveUserEdits(u.id)}
                                style={styles.secondaryButton}
                                disabled={busy}
                              >
                                {busy ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={cancelEditUser}
                                style={styles.secondaryButton}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {loading || !isReady ? (
          <div style={styles.card}>
            <p style={styles.sectionText}>
              {status || "Loading pool data..."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Create Tournament</h2>

              <label>Name</label>
              <input
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                style={styles.input}
              />

              <p style={{ margin: "0 0 8px", color: "#94a3b8", fontSize: 14 }}>
                Lock times are local. Leave blank for no lock during testing.
              </p>

              <label>Round 1 Lock</label>
              <input type="datetime-local" value={r1} onChange={(e) => setR1(e.target.value)} style={styles.input} />
              <label>Round 2 Lock</label>
              <input type="datetime-local" value={r2} onChange={(e) => setR2(e.target.value)} style={styles.input} />
              <label>Round 3 Lock</label>
              <input type="datetime-local" value={r3} onChange={(e) => setR3(e.target.value)} style={styles.input} />
              <label>Round 4 Lock</label>
              <input type="datetime-local" value={r4} onChange={(e) => setR4(e.target.value)} style={styles.input} />

              <button onClick={createTournament} style={styles.primaryButton}>
                Create Tournament
              </button>
            </section>

            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Add Golfer</h2>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  placeholder="Golfer name"
                  style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                />
                <button onClick={addGolfer} style={{ ...styles.secondaryButton, minWidth: 84 }}>
                  Add
                </button>
              </div>

              <p style={{ marginTop: 12, color: "#94a3b8", fontSize: 14 }}>
                Total golfers: <strong style={{ color: "#f8fafc" }}>{golfers.length}</strong>
              </p>
            </section>

            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Tournament Score Grid</h2>

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <select
                  value={scoreTournamentId}
                  onChange={(e) => setScoreTournamentId(e.target.value)}
                  style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                >
                  <option value="">Select tournament</option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <button onClick={saveScores} style={styles.secondaryButton} disabled={!scoreTournamentId || scoresBusy}>
                  {scoresBusy ? "Saving…" : "Save Scores"}
                </button>

                <button onClick={clearScores} style={styles.dangerButton} disabled={!scoreTournamentId || scoresBusy}>
                  Clear Scores
                </button>
              </div>

              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10 }}>
                Sorted by golfer last name. Leave a cell blank if that round has no score yet.
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)" }}>Golfer</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)", width: 90 }}>R1</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)", width: 90 }}>R2</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)", width: 90 }}>R3</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)", width: 90 }}>R4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {golfersByLastName.map((g) => {
                      const row = scoreEdits[g.id] || emptyScoreRow();

                      return (
                        <tr key={g.id}>
                          <td style={{ padding: 10, borderBottom: "1px solid rgba(148,163,184,0.12)", fontWeight: 700 }}>
                            {g.name}
                          </td>
                          {[1, 2, 3, 4].map((round) => (
                            <td key={round} style={{ padding: 10, borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                              <input
                                value={row[round as 1 | 2 | 3 | 4]}
                                onChange={(e) =>
                                  updateScoreCell(g.id, round as 1 | 2 | 3 | 4, e.target.value)
                                }
                                inputMode="numeric"
                                placeholder="—"
                                style={{
                                  width: "100%",
                                  padding: 8,
                                  borderRadius: 8,
                                  border: "1px solid rgba(148,163,184,0.22)",
                                  background: "rgba(2,6,23,0.78)",
                                  color: "#f8fafc",
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

            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Current Data</h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div style={styles.statCard}>
                  <div style={styles.statLabel}>Pool</div>
                  <div style={styles.statValue}>{pool?.name}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.statLabel}>Tournaments</div>
                  <div style={styles.statValue}>{tournaments.length}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.statLabel}>Golfers</div>
                  <div style={styles.statValue}>{golfers.length}</div>
                </div>
              </div>

              <h3 style={{ marginBottom: 8 }}>Tournaments</h3>

              {tournaments.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>No tournaments yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {tournaments.map((t) => {
                    const editing = editingTournamentId === t.id;
                    const busy = busyTournamentId === t.id;

                    return (
                      <div
                        key={t.id}
                        style={{
                          border: "1px solid rgba(148,163,184,0.14)",
                          borderRadius: 14,
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          background: "rgba(2,6,23,0.35)",
                        }}
                      >
                        {!editing ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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

                              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, lineHeight: 1.5 }}>
                                R1: {fmtLock(t.round1_lock)}<br />
                                R2: {fmtLock(t.round2_lock)}<br />
                                R3: {fmtLock(t.round3_lock)}<br />
                                R4: {fmtLock(t.round4_lock)}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                              <button onClick={() => startEditTournament(t)} style={styles.secondaryButton} disabled={busy}>
                                Edit
                              </button>

                              <button onClick={() => deleteTournament(t.id, t.name)} disabled={busy} style={styles.dangerButton}>
                                {busy ? "Working…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 800 }}>Edit Tournament</div>

                            <label>Name</label>
                            <input value={editTName} onChange={(e) => setEditTName(e.target.value)} style={styles.input} />
                            <label>Round 1 Lock</label>
                            <input type="datetime-local" value={editR1} onChange={(e) => setEditR1(e.target.value)} style={styles.input} />
                            <label>Round 2 Lock</label>
                            <input type="datetime-local" value={editR2} onChange={(e) => setEditR2(e.target.value)} style={styles.input} />
                            <label>Round 3 Lock</label>
                            <input type="datetime-local" value={editR3} onChange={(e) => setEditR3(e.target.value)} style={styles.input} />
                            <label>Round 4 Lock</label>
                            <input type="datetime-local" value={editR4} onChange={(e) => setEditR4(e.target.value)} style={styles.input} />

                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => saveTournamentEdits(t.id)} style={{ ...styles.secondaryButton, flex: 1 }} disabled={busy}>
                                {busy ? "Saving…" : "Save"}
                              </button>
                              <button onClick={cancelEditTournament} style={{ ...styles.secondaryButton, flex: 1 }} disabled={busy}>
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
                  style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                />
                <button onClick={() => setGolferQuery("")} style={styles.secondaryButton} disabled={!golferQuery}>
                  Clear
                </button>
              </div>

              <div style={{ marginBottom: 10, fontSize: 13, color: "#94a3b8" }}>
                Showing {filteredGolfers.length} of {golfers.length}
              </div>

              {filteredGolfers.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>No golfers match your search.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredGolfers.map((g) => {
                    const editing = editingGolferId === g.id;
                    const busy = busyGolferId === g.id;

                    return (
                      <div
                        key={g.id}
                        style={{
                          border: "1px solid rgba(148,163,184,0.14)",
                          borderRadius: 12,
                          padding: 10,
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          background: "rgba(2,6,23,0.35)",
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
                              <button onClick={() => startEditGolfer(g)} style={styles.secondaryButton} disabled={busy}>
                                Edit
                              </button>

                              <button onClick={() => deleteGolfer(g.id, g.name)} disabled={busy} style={styles.dangerButton}>
                                {busy ? "Working…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 700 }}>Edit Golfer</div>
                            <input value={editGolferName} onChange={(e) => setEditGolferName(e.target.value)} style={styles.input} />
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => saveGolferEdit(g.id)} style={{ ...styles.secondaryButton, flex: 1 }} disabled={busy}>
                                {busy ? "Saving…" : "Save"}
                              </button>
                              <button onClick={cancelEditGolfer} style={{ ...styles.secondaryButton, flex: 1 }} disabled={busy}>
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
        )}
      </div>
    </main>
  );
}