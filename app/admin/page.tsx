"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

function isMissingFinalLockColumn(message?: string | null) {
  return /final_lock|schema cache|column/i.test(message || "");
}

type Pool = { id: string; name: string };

type Tournament = {
  id: string;
  name: string;
  round1_lock?: string | null;
  round2_lock?: string | null;
  round3_lock?: string | null;
  round4_lock?: string | null;
  final_lock?: string | null;
};

type Golfer = { id: string; name: string };

type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  pool_member?: boolean;
  pool_role?: string | null;
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

type RoundNumber = 1 | 2 | 3 | 4;

type PickUsageMap = Record<
  string,
  {
    1: number;
    2: number;
    3: number;
    4: number;
  }
>;

function getLastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1].toLowerCase() : name.toLowerCase();
}

function emptyScoreRow() {
  return { 1: "", 2: "", 3: "", 4: "" };
}

function emptyPickUsageRow() {
  return { 1: 0, 2: 0, 3: 0, 4: 0 };
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

function getSetupStatus(user: AdminUser) {
  if (!user.email_confirmed_at) return "Pending Auth";
  if (!user.pool_member) return "No Pool Access";
  return "Ready";
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

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userBusyId, setUserBusyId] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserStatus, setNewUserStatus] = useState("");
  const [editingUserId, setEditingUserId] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserDisplayName, setEditUserDisplayName] = useState("");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [userQuery, setUserQuery] = useState("");

  const [tName, setTName] = useState("Demo Tournament");
  const [r1, setR1] = useState(false);
  const [r2, setR2] = useState(false);
  const [r3, setR3] = useState(false);
  const [r4, setR4] = useState(false);
  const [finalLock, setFinalLock] = useState(false);

  const [gName, setGName] = useState("");

  const [editingTournamentId, setEditingTournamentId] = useState<string>("");
  const [editTName, setEditTName] = useState("");
  const [editR1, setEditR1] = useState(false);
  const [editR2, setEditR2] = useState(false);
  const [editR3, setEditR3] = useState(false);
  const [editR4, setEditR4] = useState(false);
  const [editFinalLock, setEditFinalLock] = useState(false);

  const [editingGolferId, setEditingGolferId] = useState<string>("");
  const [editGolferName, setEditGolferName] = useState("");

  const [busyTournamentId, setBusyTournamentId] = useState<string>("");
  const [busyGolferId, setBusyGolferId] = useState<string>("");
  const [scoresBusy, setScoresBusy] = useState(false);
  const [scoreSyncBusy, setScoreSyncBusy] = useState(false);
  const [scoreSyncStatus, setScoreSyncStatus] = useState("");

  const [golferQuery, setGolferQuery] = useState("");

  const [scoreTournamentId, setScoreTournamentId] = useState<string>("");
  const [scoreEdits, setScoreEdits] = useState<ScoreMap>({});
  const [pickUsage, setPickUsage] = useState<PickUsageMap>({});
  const [pickUsageLoading, setPickUsageLoading] = useState(false);
  const [finalLockSchemaMissing, setFinalLockSchemaMissing] = useState(false);
  const [rosterTournamentId, setRosterTournamentId] = useState<string>("");
  const [rosterGolfers, setRosterGolfers] = useState<Golfer[]>([]);
  const [rosterUrl, setRosterUrl] = useState("https://www.pgachampionship.com/players");
  const [rosterNames, setRosterNames] = useState("");
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterStatus, setRosterStatus] = useState("");

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

  const scoreTournament = useMemo(() => {
    return tournaments.find((t) => t.id === scoreTournamentId) || null;
  }, [tournaments, scoreTournamentId]);

  const lockedRounds = useMemo<RoundNumber[]>(() => {
    if (!scoreTournament) return [];
    const rounds: RoundNumber[] = [];
    if (scoreTournament.round1_lock) rounds.push(1);
    if (scoreTournament.round2_lock) rounds.push(2);
    if (scoreTournament.round3_lock) rounds.push(3);
    if (scoreTournament.round4_lock) rounds.push(4);
    return rounds;
  }, [scoreTournament]);

  const scoringGolfers = useMemo(() => {
    if (lockedRounds.length === 0) return [];

    return golfersByLastName.filter((g) => {
      const usage = pickUsage[g.id];
      if (!usage) return false;
      return lockedRounds.some((round) => usage[round] > 0);
    });
  }, [golfersByLastName, lockedRounds, pickUsage]);

  const scoringPickCount = useMemo(() => {
    return scoringGolfers.reduce((total, g) => {
      const usage = pickUsage[g.id];
      if (!usage) return total;
      return total + lockedRounds.reduce((roundTotal, round) => roundTotal + usage[round], 0);
    }, 0);
  }, [scoringGolfers, lockedRounds, pickUsage]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.display_name || "").toLowerCase().includes(q)
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
      setPickUsage({});
      return;
    }

    loadScoresForTournament(scoreTournamentId);
    loadPickUsageForTournament(scoreTournamentId);
  }, [scoreTournamentId, golfers, tournaments, pool]);

  useEffect(() => {
    if (!pool || !rosterTournamentId) {
      setRosterGolfers([]);
      setRosterStatus("");
      return;
    }

    loadTournamentRoster(rosterTournamentId);
  }, [pool, rosterTournamentId]);

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

    if (editUserPassword.trim() && editUserPassword.trim().length < 8) {
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
        body.password = editUserPassword.trim();
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

    let finalLockColumnMissing = false;
    let tData: any[] | null = null;
    let tErr: any = null;
    const tournamentResult = await supabase
      .from("tournaments")
      .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock,final_lock")
      .eq("pool_id", activePoolId)
      .order("created_at", { ascending: false });
    tData = tournamentResult.data;
    tErr = tournamentResult.error;

    if (tErr && isMissingFinalLockColumn(tErr.message)) {
      const fallback = await supabase
        .from("tournaments")
        .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock")
        .eq("pool_id", activePoolId)
        .order("created_at", { ascending: false });
      tData = fallback.data;
      tErr = fallback.error;
      finalLockColumnMissing = !tErr;
    }
    setFinalLockSchemaMissing(finalLockColumnMissing);

    const { data: gData, error: gErr } = await supabase
      .from("golfers")
      .select("id,name")
      .eq("pool_id", activePoolId)
      .order("name", { ascending: true });

    if (tErr) {
      setStatus(`Error loading tournaments: ${tErr.message}`);
    } else if (gErr) {
      setStatus(`Error loading golfers: ${gErr.message}`);
    } else if (finalLockColumnMissing) {
      setStatus("Run supabase/final_lock.sql in Supabase SQL Editor to enable Final/Lock tournaments.");
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

    if (!rosterTournamentId && nextTournaments.length > 0) {
      setRosterTournamentId(nextTournaments[0].id);
    } else if (
      rosterTournamentId &&
      !nextTournaments.some((t) => t.id === rosterTournamentId)
    ) {
      setRosterTournamentId(nextTournaments[0]?.id ?? "");
    }
  }

  async function loadTournamentRoster(tournamentId: string) {
    if (!pool || !tournamentId) {
      setRosterGolfers([]);
      return;
    }

    try {
      setRosterBusy(true);
      const token = await getAccessToken();
      const r = await fetch(
        `/api/admin/tournament-golfers?pool_id=${encodeURIComponent(pool.id)}&tournament_id=${encodeURIComponent(tournamentId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setRosterStatus(j?.error || "Failed to load tournament field.");
        setRosterGolfers([]);
        return;
      }

      setRosterGolfers((j?.roster_golfers ?? []) as Golfer[]);
      setRosterStatus(
        (j?.roster_golfers?.length ?? 0) > 0
          ? `Tournament field loaded (${j.roster_golfers.length} golfers).`
          : "No specific field set. Picks will currently use the full golfer pool."
      );
    } catch (err: any) {
      setRosterStatus(err?.message || "Failed to load tournament field.");
      setRosterGolfers([]);
    } finally {
      setRosterBusy(false);
    }
  }

  async function updateTournamentRoster(action: "seed_all" | "import_url" | "replace_names") {
    if (!pool || !rosterTournamentId) {
      setRosterStatus("Select a tournament field first.");
      return;
    }

    try {
      setRosterBusy(true);
      setRosterStatus("Updating tournament field...");
      const token = await getAccessToken();
      const r = await fetch("/api/admin/tournament-golfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pool_id: pool.id,
          tournament_id: rosterTournamentId,
          action,
          url: rosterUrl,
          names: rosterNames,
        }),
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setRosterStatus(j?.error || "Tournament field update failed.");
        return;
      }

      setRosterGolfers((j?.roster_golfers ?? []) as Golfer[]);
      const created = Array.isArray(j?.created) ? j.created.length : 0;
      setRosterStatus(
        `Tournament field updated: ${j?.roster_golfers?.length ?? j?.imported_count ?? 0} golfers${created ? `, ${created} added to master list` : ""}.`
      );
      if (action === "replace_names") setRosterNames("");
      await refresh(pool.id);
    } catch (err: any) {
      setRosterStatus(err?.message || "Tournament field update failed.");
    } finally {
      setRosterBusy(false);
    }
  }

  async function loadPickUsageForTournament(tournamentId: string) {
    if (!pool || !tournamentId) {
      setPickUsage({});
      return;
    }

    const base: PickUsageMap = {};
    for (const g of golfers) {
      base[g.id] = emptyPickUsageRow();
    }

    try {
      setPickUsageLoading(true);

      const { data, error } = await supabase
        .from("picks")
        .select("golfer_id,round")
        .eq("pool_id", pool.id)
        .eq("tournament_id", tournamentId);

      if (error) {
        setStatus(`Error loading locked pick usage: ${error.message}`);
        setPickUsage(base);
        return;
      }

      for (const row of data ?? []) {
        const gid = row.golfer_id as string;
        const round = row.round as RoundNumber;

        if (![1, 2, 3, 4].includes(round)) continue;
        if (!base[gid]) base[gid] = emptyPickUsageRow();
        base[gid][round] += 1;
      }

      setPickUsage(base);
    } catch (err: any) {
      setStatus(err?.message || "Error loading locked pick usage.");
      setPickUsage(base);
    } finally {
      setPickUsageLoading(false);
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

    try {
      const token = await getAccessToken();

      const r = await fetch(
        `/api/admin/scores?pool_id=${encodeURIComponent(pool.id)}&tournament_id=${encodeURIComponent(tournamentId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setStatus(j?.error || "Error loading scores.");
        setScoreEdits(base);
        return;
      }

      for (const row of j?.scores ?? []) {
        const gid = row.golfer_id as string;
        const round = row.round as 1 | 2 | 3 | 4;
        const strokes = row.strokes as number;

        if (!base[gid]) base[gid] = emptyScoreRow();
        if ([1, 2, 3, 4].includes(round)) {
          base[gid][round] = String(strokes);
        }
      }

      setScoreEdits(base);
    } catch (err: any) {
      setStatus(err?.message || "Error loading scores.");
      setScoreEdits(base);
    }
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
      setNewUserStatus("Admin access required.");
      return;
    }

    if (!finalEmail || !newUserPassword.trim()) {
      setStatus("Enter a user email and password.");
      setNewUserStatus("Enter a user email and password.");
      return;
    }

    if (newUserPassword.trim().length < 8) {
      setStatus("Password must be at least 8 characters.");
      setNewUserStatus("Password must be at least 8 characters.");
      return;
    }

    try {
      setCreatingUser(true);
      setStatus("Creating user...");
      setNewUserStatus("Creating user...");

      const token = await getAccessToken();

      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: finalEmail,
          password: newUserPassword.trim(),
          display_name: newUserDisplayName.trim(),
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setStatus(j?.error || "User creation failed.");
        setNewUserStatus(j?.error || "User creation failed.");
        return;
      }

      const nextStatus = j?.created ? `User created: ${finalEmail}` : `Pool access repaired for: ${finalEmail}`;
      setStatus(nextStatus);
      setNewUserStatus(nextStatus);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserDisplayName("");
      await loadUsers();
    } catch (err: any) {
      setStatus(err?.message || "User creation failed.");
      setNewUserStatus(err?.message || "User creation failed.");
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

    const token = await getAccessToken();
    const r = await fetch("/api/admin/tournaments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        pool_id: pool.id,
        name: tName.trim(),
        locks: {
          round1: r1,
          round2: r2,
          round3: r3,
          round4: r4,
          final: finalLock,
        },
      }),
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      setStatus(j?.error || "Create tournament failed.");
      return;
    }

    setStatus("Tournament created ✅");
    setTName("Demo Tournament");
    setR1(false);
    setR2(false);
    setR3(false);
    setR4(false);
    setFinalLock(false);
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
    setEditR1(!!t.round1_lock);
    setEditR2(!!t.round2_lock);
    setEditR3(!!t.round3_lock);
    setEditR4(!!t.round4_lock);
    setEditFinalLock(!!t.final_lock);
  }

  function cancelEditTournament() {
    setEditingTournamentId("");
    setEditTName("");
    setEditR1(false);
    setEditR2(false);
    setEditR3(false);
    setEditR4(false);
    setEditFinalLock(false);
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
      const token = await getAccessToken();
      const r = await fetch("/api/admin/tournaments", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pool_id: pool.id,
          tournament_id: tournamentId,
          name: editTName.trim(),
          locks: {
            round1: editR1,
            round2: editR2,
            round3: editR3,
            round4: editR4,
            final: editFinalLock,
          },
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setStatus(j?.error || "Save tournament failed.");
        return;
      }

      setStatus("Tournament updated ✅");
      cancelEditTournament();
      await refresh(pool.id);
    } finally {
      setBusyTournamentId("");
    }
  }

  async function setScoreRoundLock(round: RoundNumber, locked: boolean) {
    if (!pool || !scoreTournamentId) return;

    const tournament = tournaments.find((t) => t.id === scoreTournamentId);
    if (!tournament) {
      setStatus("Select a tournament before changing locks.");
      return;
    }
    if (tournament.final_lock) {
      setStatus("Tournament is Final/Locked. Uncheck Final/Lock in Create/Edit Tournament before changing round locks.");
      return;
    }

    const field = `round${round}_lock` as keyof Tournament;
    setBusyTournamentId(scoreTournamentId);
    setStatus(`${locked ? "Locking" : "Unlocking"} Round ${round}...`);

    try {
      const { error } = await supabase
        .from("tournaments")
        .update({
          [field]: locked ? tLockValue(tournament[field] as string | null) : null,
        })
        .eq("id", scoreTournamentId);

      if (error) {
        setStatus(`Round lock update failed: ${error.message}`);
        return;
      }

      await refresh(pool.id);
      await loadScoresForTournament(scoreTournamentId);
      await loadPickUsageForTournament(scoreTournamentId);
      setStatus(`Round ${round} ${locked ? "locked" : "unlocked"}.`);
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
    if (!/^-?\d*$/.test(value)) return;

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
    if (scoreTournament?.final_lock) {
      setStatus("Tournament is Final/Locked. Uncheck Final/Lock before editing scores.");
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

      if (lockedRounds.length === 0) {
        setStatus("Lock at least one round before entering or saving scores.");
        return;
      }

      for (const g of scoringGolfers) {
        const row = scoreEdits[g.id] || emptyScoreRow();

        lockedRounds.forEach((round) => {
          const raw = row[round].trim();
          if (raw === "") return;

          const n = Number(raw);
          if (!Number.isNaN(n)) {
            if (n < -20 || n > 30) {
              setStatus(`Invalid score for ${g.name} (R${round}): ${n}. Must be between -20 and +30.`);
              throw new Error("Invalid score range");
            }

            rows.push({
              pool_id: pool.id,
              tournament_id: scoreTournamentId,
              round,
              golfer_id: g.id,
              strokes: n,
            });
          }
        });
      }

      const token = await getAccessToken();

      const r = await fetch("/api/admin/scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pool_id: pool.id,
          tournament_id: scoreTournamentId,
          rows,
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setStatus(j?.error || "Save scores failed.");
        return;
      }

      await refresh(pool.id);
      await loadScoresForTournament(scoreTournamentId);
      setStatus(
        `Scores saved ✅ (${j?.submitted_count ?? rows.length} rows submitted, ${j?.stored_count ?? 0} rows now stored)`
      );
    } catch (err: any) {
      setStatus(err?.message || "Unexpected error saving scores.");
    } finally {
      setScoresBusy(false);
    }
  }

  async function clearScores() {
    if (!pool || !scoreTournamentId) return;
    if (scoreTournament?.final_lock) {
      setStatus("Tournament is Final/Locked. Uncheck Final/Lock before clearing scores.");
      return;
    }

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

  async function syncPgaTourScores() {
    if (!pool || !scoreTournamentId) {
      setStatus("Select a tournament before syncing scores.");
      return;
    }
    if (scoreTournament?.final_lock) {
      setScoreSyncStatus("Tournament is Final/Locked. Uncheck Final/Lock before syncing scores.");
      return;
    }

    setScoreSyncBusy(true);
    setScoreSyncStatus("Syncing public leaderboard scores...");

    try {
      const token = await getAccessToken();

      const r = await fetch("/api/admin/sync-scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pool_id: pool.id,
          tournament_id: scoreTournamentId,
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setScoreSyncStatus(j?.error || "Score sync failed.");
        return;
      }

      await loadScoresForTournament(scoreTournamentId);
      const unavailableCount = Array.isArray(j?.unavailable) ? j.unavailable.length : 0;
      setScoreSyncStatus(
        `Synced ${j?.written_count ?? 0} score${j?.written_count === 1 ? "" : "s"} from ${j?.source ?? "public source"} (${j?.leaderboard_round ?? "leaderboard"}). ${unavailableCount} unavailable.`
      );
    } catch (err: any) {
      setScoreSyncStatus(err?.message || "Unexpected score sync error.");
    } finally {
      setScoreSyncBusy(false);
    }
  }

  function tLockValue(existing?: string | null) {
    return existing || new Date().toISOString();
  }

  function fmtLock(v?: string | null) {
    return v ? "Locked" : "Unlocked";
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
      textAlign: "left" as const,
    } as React.CSSProperties,

    tileSummary: {
      cursor: "pointer",
      listStyle: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      fontSize: 20,
      fontWeight: 900,
      color: "#f8fafc",
    } as React.CSSProperties,

    tileHint: {
      marginTop: 8,
      marginBottom: 18,
      color: "#94a3b8",
      lineHeight: 1.5,
      fontSize: 14,
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
          <a href="/trophy-room" style={styles.linkButton}>Trophy Room</a>
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

          <details style={styles.card}>
            <summary style={styles.tileSummary}>
              <span>User Management</span>
              <span style={{ color: "#94a3b8", fontSize: 14 }}>{users.length} users</span>
            </summary>
            <p style={styles.tileHint}>
              Create users, repair pool access for existing emails, edit email/display name, reset passwords, and delete users.
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
              onChange={(e) => {
                setNewUserEmail(e.target.value);
                setNewUserStatus("");
              }}
              style={{ ...styles.input, marginBottom: 0 }}
            />
            <input
              type="text"
              placeholder="Display name"
              value={newUserDisplayName}
              onChange={(e) => {
                setNewUserDisplayName(e.target.value);
                setNewUserStatus("");
              }}
              style={{ ...styles.input, marginBottom: 0 }}
            />
            <input
              type="password"
              placeholder="Preset password"
              value={newUserPassword}
              onChange={(e) => {
                setNewUserPassword(e.target.value);
                setNewUserStatus("");
              }}
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

          {!!newUserStatus && (
            <div style={{ ...styles.message, marginTop: 12 }}>
              {newUserStatus}
            </div>
          )}

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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Email</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Display Name</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Password</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Setup Status</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Created</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Last Sign In</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Confirmed</th>
                  <th style={{ ...styles.tableCell, textAlign: "left" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr>
                    <td colSpan={8} style={styles.tableCell}>Loading users...</td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={styles.tableCell}>No users found.</td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const editing = editingUserId === u.id;
                    const busy = userBusyId === u.id;
                    const setupStatus = getSetupStatus(u);

                    return (
                      <tr key={u.id}>
                        <td style={styles.tableCell}>
                          {!editing ? (
                            <div>
                              <div style={{ fontWeight: 700 }}>{u.email}</div>
                              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                                Login ID
                              </div>
                            </div>
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
                            <>
                              <input
                                value={editUserDisplayName}
                                onChange={(e) => setEditUserDisplayName(e.target.value)}
                                placeholder="Display name"
                                style={{ ...styles.input, marginBottom: 8 }}
                              />
                              <input
                                type="password"
                                value={editUserPassword}
                                onChange={(e) => setEditUserPassword(e.target.value)}
                                placeholder="New password (optional)"
                                style={{ ...styles.input, marginBottom: 0 }}
                              />
                            </>
                          )}
                        </td>

                        <td style={styles.tableCell}>
                          {editing ? (
                            <span style={{ color: "#94a3b8", fontSize: 13 }}>
                              Existing password hidden
                            </span>
                          ) : (
                            <span style={{ letterSpacing: 2 }}>••••••••</span>
                          )}
                        </td>

                        <td style={styles.tableCell}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 800,
                              background:
                                setupStatus === "Ready"
                                  ? "rgba(34,197,94,0.14)"
                                  : setupStatus === "No Pool Access"
                                  ? "rgba(248,113,113,0.14)"
                                  : "rgba(250,204,21,0.14)",
                              color:
                                setupStatus === "Ready"
                                  ? "#86efac"
                                  : setupStatus === "No Pool Access"
                                  ? "#fecaca"
                                  : "#fde68a",
                              border:
                                setupStatus === "Ready"
                                  ? "1px solid rgba(34,197,94,0.28)"
                                  : setupStatus === "No Pool Access"
                                  ? "1px solid rgba(248,113,113,0.28)"
                                  : "1px solid rgba(250,204,21,0.28)",
                            }}
                          >
                            {setupStatus}
                          </span>
                          {u.pool_role ? (
                            <div style={{ marginTop: 5, color: "#94a3b8", fontSize: 12 }}>
                              Role: {u.pool_role}
                            </div>
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
        </details>

        {loading || !isReady ? (
          <div style={styles.card}>
            <p style={styles.sectionText}>
              {status || "Loading pool data..."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <details style={styles.card}>
              <summary style={styles.tileSummary}>
                <span>Create Tournament</span>
                <span style={{ color: "#94a3b8", fontSize: 14 }}>{tournaments.length} tournaments</span>
              </summary>
              <p style={styles.tileHint}>
                Create tournaments here. Edit existing tournament names and lock rounds in the Current Data tile.
              </p>
              {finalLockSchemaMissing ? (
                <p style={{ ...styles.tileHint, color: "#fde68a" }}>
                  Final/Lock is not active yet. Run supabase/final_lock.sql in Supabase SQL Editor, then reload this page.
                </p>
              ) : null}

              <label>Name</label>
              <input
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                style={styles.input}
              />

              <p style={{ margin: "0 0 10px", color: "#94a3b8", fontSize: 14 }}>
                Manual round locking. Check a round to lock it now; leave unchecked to keep it unlocked.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={r1} onChange={(e) => setR1(e.target.checked)} />
                  Lock Round 1
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={r2} onChange={(e) => setR2(e.target.checked)} />
                  Lock Round 2
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={r3} onChange={(e) => setR3(e.target.checked)} />
                  Lock Round 3
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={r4} onChange={(e) => setR4(e.target.checked)} />
                  Lock Round 4
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={finalLock} disabled={finalLockSchemaMissing} onChange={(e) => setFinalLock(e.target.checked)} />
                  Final/Lock
                </label>
              </div>

              <button onClick={createTournament} style={styles.primaryButton}>
                Create Tournament
              </button>
            </details>

            <details style={styles.card}>
              <summary style={styles.tileSummary}>
                <span>Add Golfer</span>
                <span style={{ color: "#94a3b8", fontSize: 14 }}>{golfers.length} golfers</span>
              </summary>
              <p style={styles.tileHint}>
                Add golfers to the master list. Edit/remove existing golfers in the Current Data tile.
              </p>

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

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  value={golferQuery}
                  onChange={(e) => setGolferQuery(e.target.value)}
                  placeholder="Search golfers..."
                  style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                />
                <button
                  onClick={() => setGolferQuery("")}
                  style={styles.secondaryButton}
                  disabled={!golferQuery}
                >
                  Clear
                </button>
              </div>

              <p style={{ marginTop: 12, color: "#94a3b8", fontSize: 14 }}>
                Total golfers: <strong style={{ color: "#f8fafc" }}>{golfers.length}</strong>
              </p>
            </details>

            <details style={styles.card}>
              <summary style={styles.tileSummary}>
                <span>Tournament Field</span>
                <span style={{ color: "#94a3b8", fontSize: 14 }}>{rosterGolfers.length} rostered</span>
              </summary>
              <p style={styles.sectionText}>
                Set which golfers are available for a specific tournament. If a tournament has no field set, picks fall back to the full golfer pool.
              </p>

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <select
                  value={rosterTournamentId}
                  onChange={(e) => setRosterTournamentId(e.target.value)}
                  style={{ ...styles.input, flex: 1, marginBottom: 0, minWidth: 240 }}
                >
                  <option value="">Select tournament</option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => loadTournamentRoster(rosterTournamentId)}
                  style={styles.secondaryButton}
                  disabled={!rosterTournamentId || rosterBusy}
                >
                  Refresh Field
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
                <button
                  onClick={() => updateTournamentRoster("seed_all")}
                  style={styles.secondaryButton}
                  disabled={!rosterTournamentId || rosterBusy}
                >
                  Use Full Current Golfer Pool
                </button>
                <button
                  onClick={() => updateTournamentRoster("import_url")}
                  style={styles.secondaryButton}
                  disabled={!rosterTournamentId || rosterBusy || !rosterUrl.trim()}
                >
                  Import From URL
                </button>
                <button
                  onClick={() => updateTournamentRoster("replace_names")}
                  style={styles.secondaryButton}
                  disabled={!rosterTournamentId || rosterBusy || !rosterNames.trim()}
                >
                  Replace With Pasted List
                </button>
              </div>

              <input
                value={rosterUrl}
                onChange={(e) => setRosterUrl(e.target.value)}
                placeholder="Roster page URL"
                style={styles.input}
              />

              <textarea
                value={rosterNames}
                onChange={(e) => setRosterNames(e.target.value)}
                placeholder="Paste one golfer name per line when a tournament field is available..."
                rows={7}
                style={{ ...styles.input, minHeight: 150, resize: "vertical" }}
              />

              {rosterStatus ? (
                <p style={{ ...styles.message, marginBottom: 12 }}>{rosterStatus}</p>
              ) : null}

              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10 }}>
                Field golfers: <strong style={{ color: "#f8fafc" }}>{rosterGolfers.length}</strong>
              </div>

              {rosterGolfers.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                  {rosterGolfers.slice(0, 80).map((g) => (
                    <div
                      key={g.id}
                      style={{
                        border: "1px solid rgba(148,163,184,0.14)",
                        borderRadius: 12,
                        padding: "8px 10px",
                        background: "rgba(2,6,23,0.35)",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {g.name}
                    </div>
                  ))}
                  {rosterGolfers.length > 80 ? (
                    <div style={{ color: "#94a3b8", padding: "8px 10px" }}>
                      +{rosterGolfers.length - 80} more
                    </div>
                  ) : null}
                </div>
              ) : null}
            </details>

            <details style={styles.card}>
              <summary style={styles.tileSummary}>
                <span>Scoring Table</span>
                <span style={{ color: "#94a3b8", fontSize: 14 }}>{scoreTournament?.name || "Select tournament"}</span>
              </summary>
              <p style={styles.sectionText}>
                This table now only shows golfers who are actively selected by at least one user in a locked round.
                Lock R1 first and only R1-selected golfers appear. As R2, R3, and R4 are locked, those selected golfers are added automatically.
              </p>
              {scoreTournament?.final_lock ? (
                <p style={{ ...styles.sectionText, color: "#fde68a" }}>
                  Tournament is Final/Locked. Uncheck Final/Lock in Create/Edit Tournament before changing locks, syncing, clearing, or saving scores.
                </p>
              ) : null}

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <select
                  value={scoreTournamentId}
                  onChange={(e) => setScoreTournamentId(e.target.value)}
                  style={{ ...styles.input, flex: 1, marginBottom: 0, minWidth: 240 }}
                >
                  <option value="">Select tournament</option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <button onClick={saveScores} style={styles.secondaryButton} disabled={!scoreTournamentId || scoresBusy || lockedRounds.length === 0 || !!scoreTournament?.final_lock}>
                  {scoresBusy ? "Saving…" : "Save Scores"}
                </button>

                <button onClick={syncPgaTourScores} style={styles.secondaryButton} disabled={!scoreTournamentId || scoreSyncBusy || !!scoreTournament?.final_lock}>
                  {scoreSyncBusy ? "Syncing..." : "Sync PGA TOUR"}
                </button>

                <button onClick={clearScores} style={styles.dangerButton} disabled={!scoreTournamentId || scoresBusy || !!scoreTournament?.final_lock}>
                  Clear Scores
                </button>
              </div>

              {scoreSyncStatus ? (
                <div style={{ fontSize: 13, color: "#bae6fd", marginBottom: 12, lineHeight: 1.5 }}>
                  {scoreSyncStatus}
                </div>
              ) : null}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                {[1, 2, 3, 4].map((round) => {
                  const isLocked = lockedRounds.includes(round as RoundNumber);
                  return (
                    <div
                      key={round}
                      style={{
                        borderRadius: 14,
                        padding: 12,
                        background: isLocked ? "rgba(34,197,94,0.12)" : "rgba(2,6,23,0.45)",
                        border: isLocked ? "1px solid rgba(34,197,94,0.28)" : "1px solid rgba(148,163,184,0.14)",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Round {round}
                      </div>
                      <div style={{ marginTop: 5, fontWeight: 900, color: isLocked ? "#86efac" : "#cbd5e1" }}>
                        {isLocked ? "Locked" : "Unlocked"}
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "#cbd5e1" }}>
                        <input
                          type="checkbox"
                          checked={isLocked}
                          disabled={!scoreTournamentId || busyTournamentId === scoreTournamentId || !!scoreTournament?.final_lock}
                          onChange={(e) => setScoreRoundLock(round as RoundNumber, e.target.checked)}
                        />
                        {isLocked ? "Unlock here" : "Lock here"}
                      </label>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10, lineHeight: 1.5 }}>
                {pickUsageLoading ? (
                  "Loading locked pick usage..."
                ) : scoreTournamentId && lockedRounds.length > 0 ? (
                  <>
                    Showing <strong style={{ color: "#f8fafc" }}>{scoringGolfers.length}</strong> golfers selected across locked rounds,
                    covering <strong style={{ color: "#f8fafc" }}>{scoringPickCount}</strong> total locked-round picks.
                    Enter scores relative to par. Only locked-round score boxes are editable.
                  </>
                ) : scoreTournamentId ? (
                  "No rounds are locked yet. Lock R1, R2, R3, or R4 in Current Data → Tournaments to generate the scoring table."
                ) : (
                  "Select a tournament to score."
                )}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)" }}>Golfer</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)", minWidth: 160 }}>Selected In Locked Rounds</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)", width: 90 }}>R1</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)", width: 90 }}>R2</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)", width: 90 }}>R3</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(148,163,184,0.2)", width: 90 }}>R4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!scoreTournamentId ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 12, color: "#94a3b8" }}>
                          Select a tournament to build the scoring table.
                        </td>
                      </tr>
                    ) : lockedRounds.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 12, color: "#94a3b8" }}>
                          No locked rounds yet. Edit the tournament below, check the round you want to lock, and save.
                        </td>
                      </tr>
                    ) : scoringGolfers.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 12, color: "#94a3b8" }}>
                          No user picks found for the currently locked rounds.
                        </td>
                      </tr>
                    ) : (
                      scoringGolfers.map((g) => {
                        const row = scoreEdits[g.id] || emptyScoreRow();
                        const usage = pickUsage[g.id] || emptyPickUsageRow();

                        return (
                          <tr key={g.id}>
                            <td style={{ padding: 10, borderBottom: "1px solid rgba(148,163,184,0.12)", fontWeight: 700 }}>
                              {g.name}
                            </td>
                            <td style={{ padding: 10, borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {([1, 2, 3, 4] as const).map((round) => {
                                  const isLocked = lockedRounds.includes(round);
                                  const count = usage[round];
                                  const active = isLocked && count > 0;

                                  return (
                                    <span
                                      key={round}
                                      title={active ? `${count} user pick${count === 1 ? "" : "s"} in Round ${round}` : `Not selected in locked Round ${round}`}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        minWidth: 48,
                                        padding: "5px 8px",
                                        borderRadius: 999,
                                        fontSize: 12,
                                        fontWeight: 900,
                                        background: active ? "rgba(34,197,94,0.16)" : "rgba(15,23,42,0.75)",
                                        color: active ? "#86efac" : "#64748b",
                                        border: active ? "1px solid rgba(34,197,94,0.32)" : "1px solid rgba(148,163,184,0.12)",
                                      }}
                                    >
                                      R{round}{active ? ` ×${count}` : ""}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            {([1, 2, 3, 4] as const).map((round) => {
                              const isLocked = lockedRounds.includes(round);
                              const wasPickedThisRound = usage[round] > 0;
                              const editable = isLocked && wasPickedThisRound;

                              return (
                                <td key={round} style={{ padding: 10, borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                                  <input
                                    value={row[round]}
                                    onChange={(e) =>
                                      updateScoreCell(g.id, round, e.target.value)
                                    }
                                    disabled={!editable}
                                    inputMode="numeric"
                                    placeholder={editable ? "—" : ""}
                                    style={{
                                      width: "100%",
                                      padding: 8,
                                      borderRadius: 8,
                                      border: editable ? "1px solid rgba(148,163,184,0.22)" : "1px solid rgba(148,163,184,0.08)",
                                      background: editable ? "rgba(2,6,23,0.78)" : "rgba(15,23,42,0.35)",
                                      color: editable ? "#f8fafc" : "#64748b",
                                      fontSize: 14,
                                      opacity: editable ? 1 : 0.65,
                                    }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </details>

            <details style={styles.card}>
              <summary style={styles.tileSummary}>
                <span>Current Data / Edit Existing</span>
                <span style={{ color: "#94a3b8", fontSize: 14 }}>Edit / cleanup</span>
              </summary>
              <p style={styles.tileHint}>
                Edit existing tournaments and golfers, delete records, and review pool totals.
              </p>

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
                                R4: {fmtLock(t.round4_lock)}<br />
                                Final: {fmtLock(t.final_lock)}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                              <button onClick={() => startEditTournament(t)} style={styles.secondaryButton} disabled={busy}>
                                Edit
                              </button>
                              <button onClick={() => deleteTournament(t.id, t.name)} style={styles.dangerButton} disabled={busy}>
                                {busy ? "Working..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <input
                              value={editTName}
                              onChange={(e) => setEditTName(e.target.value)}
                              placeholder="Tournament name"
                              style={styles.input}
                            />
                            <p style={{ margin: "0 0 10px", color: "#94a3b8", fontSize: 14 }}>
                              Check a round to lock it. Uncheck to unlock it. Click Save to apply changes.
                            </p>
                            {finalLockSchemaMissing ? (
                              <p style={{ margin: "0 0 10px", color: "#fde68a", fontSize: 14 }}>
                                Final/Lock needs supabase/final_lock.sql before it can be saved.
                              </p>
                            ) : null}

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input type="checkbox" checked={editR1} onChange={(e) => setEditR1(e.target.checked)} disabled={editFinalLock} />
                                Lock Round 1
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input type="checkbox" checked={editR2} onChange={(e) => setEditR2(e.target.checked)} disabled={editFinalLock} />
                                Lock Round 2
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input type="checkbox" checked={editR3} onChange={(e) => setEditR3(e.target.checked)} disabled={editFinalLock} />
                                Lock Round 3
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input type="checkbox" checked={editR4} onChange={(e) => setEditR4(e.target.checked)} disabled={editFinalLock} />
                                Lock Round 4
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input type="checkbox" checked={editFinalLock} disabled={finalLockSchemaMissing} onChange={(e) => setEditFinalLock(e.target.checked)} />
                                Final/Lock
                              </label>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button onClick={() => saveTournamentEdits(t.id)} style={styles.secondaryButton} disabled={busy}>
                                {busy ? "Saving..." : "Save"}
                              </button>
                              <button onClick={cancelEditTournament} style={styles.secondaryButton} disabled={busy}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <h3 style={{ marginTop: 22, marginBottom: 8 }}>Golfers</h3>

              {filteredGolfers.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>No golfers found.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filteredGolfers.map((g) => {
                    const editing = editingGolferId === g.id;
                    const busy = busyGolferId === g.id;

                    return (
                      <div
                        key={g.id}
                        style={{
                          border: "1px solid rgba(148,163,184,0.14)",
                          borderRadius: 14,
                          padding: 12,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          background: "rgba(2,6,23,0.35)",
                        }}
                      >
                        {!editing ? (
                          <>
                            <div style={{ fontWeight: 700 }}>{g.name}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button onClick={() => startEditGolfer(g)} style={styles.secondaryButton} disabled={busy}>
                                Edit
                              </button>
                              <button onClick={() => deleteGolfer(g.id, g.name)} style={styles.dangerButton} disabled={busy}>
                                {busy ? "Working..." : "Delete"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div style={{ width: "100%" }}>
                            <input
                              value={editGolferName}
                              onChange={(e) => setEditGolferName(e.target.value)}
                              placeholder="Golfer name"
                              style={styles.input}
                            />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button onClick={() => saveGolferEdit(g.id)} style={styles.secondaryButton} disabled={busy}>
                                {busy ? "Saving..." : "Save"}
                              </button>
                              <button onClick={cancelEditGolfer} style={styles.secondaryButton} disabled={busy}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </details>
          </div>
        )}
      </div>
    </main>
  );
}
