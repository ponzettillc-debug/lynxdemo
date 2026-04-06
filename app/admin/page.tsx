"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

function getSetupStatus(user: AdminUser) {
  return user.email_confirmed_at ? "Active" : "Pending";
}

export default function AdminPage() {
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const [bootstrapping, setBootstrapping] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userBusyId, setUserBusyId] = useState("");

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");

  const [editingUserId, setEditingUserId] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserDisplayName, setEditUserDisplayName] = useState("");
  const [editUserPassword, setEditUserPassword] = useState("");

  const [userQuery, setUserQuery] = useState("");

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
    loadUsers();
  }, [session, isAdmin]);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function loadUsers() {
    try {
      setUsersLoading(true);
      setStatus("");

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
    } catch (err: any) {
      setStatus(err?.message || "Setup failed.");
    } finally {
      setBootstrapping(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
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

  async function createPasswordUser() {
    const finalEmail = newUserEmail.trim().toLowerCase();

    if (!isAdmin) {
      setStatus("Admin access required.");
      return;
    }

    if (!finalEmail || !newUserPassword.trim()) {
      setStatus("Enter a user email and password.");
      return;
    }

    if (newUserPassword.trim().length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    try {
      setCreatingUser(true);
      setStatus("Creating user...");

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
        return;
      }

      setStatus(`User created: ${finalEmail}`);
      setNewUserEmail("");
      setNewUserDisplayName("");
      setNewUserPassword("");
      await loadUsers();
    } catch (err: any) {
      setStatus(err?.message || "User creation failed.");
    } finally {
      setCreatingUser(false);
    }
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

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f6f8fa",
      padding: 20,
      fontFamily: "system-ui, sans-serif",
    } as React.CSSProperties,
    shell: {
      maxWidth: 1100,
      margin: "0 auto",
      display: "grid",
      gap: 16,
    } as React.CSSProperties,
    card: {
      background: "#fff",
      border: "1px solid #d0d7de",
      borderRadius: 12,
      padding: 20,
      boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
    } as React.CSSProperties,
    input: {
      width: "100%",
      padding: 12,
      borderRadius: 10,
      border: "1px solid #d0d7de",
      fontSize: 14,
    } as React.CSSProperties,
    primaryButton: {
      padding: "12px 14px",
      borderRadius: 10,
      border: "1px solid #111111",
      background: "#ffffff",
      color: "#111111",
      fontWeight: 700,
      cursor: "pointer",
    } as React.CSSProperties,
    secondaryButton: {
      padding: "12px 14px",
      borderRadius: 10,
      border: "1px solid #d0d7de",
      background: "#ffffff",
      color: "#111111",
      fontWeight: 600,
      cursor: "pointer",
    } as React.CSSProperties,
    dangerButton: {
      padding: "12px 14px",
      borderRadius: 10,
      border: "1px solid #dc2626",
      background: "#ffffff",
      color: "#dc2626",
      fontWeight: 700,
      cursor: "pointer",
    } as React.CSSProperties,
    tableCell: {
      padding: 10,
      borderBottom: "1px solid #e5e7eb",
      verticalAlign: "top" as const,
      textAlign: "left" as const,
    } as React.CSSProperties,
  };

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.card}>Loading admin...</div>
        </div>
      </main>
    );
  }

  if (!session) return null;

  if (!isAdmin) {
    return (
      <main style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.card}>
            <h1 style={{ marginTop: 0 }}>Admin access only</h1>
            <p>Signed in as <strong>{session.user.email}</strong></p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => router.push("/")} style={styles.secondaryButton}>
                Go Home
              </button>
              <button onClick={signOut} style={styles.secondaryButton}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.card}>
          <h1 style={{ marginTop: 0, marginBottom: 8 }}>Admin Dashboard</h1>
          <p style={{ marginTop: 0, color: "#444" }}>
            Signed in as <strong>{session.user.email}</strong>
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={setupPool}
              disabled={bootstrapping}
              style={styles.secondaryButton}
            >
              {bootstrapping ? "Setting Up Pool..." : "Setup Pool"}
            </button>

            <button
              onClick={loadUsers}
              disabled={usersLoading}
              style={styles.secondaryButton}
            >
              {usersLoading ? "Refreshing Users..." : "Refresh User List"}
            </button>

            <button
              onClick={() => router.push("/")}
              style={styles.secondaryButton}
            >
              Home
            </button>

            <button onClick={signOut} style={styles.secondaryButton}>
              Sign Out
            </button>
          </div>

          {!!status && (
            <p style={{ marginTop: 14, marginBottom: 0, color: "#444" }}>
              {status}
            </p>
          )}
        </div>

        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>User Management</h2>
          <p style={{ color: "#444" }}>
            Create users, view who is set up, edit email/display name, reset passwords,
            and delete users. Existing passwords are never shown.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 1fr 1fr",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <input
              type="email"
              placeholder="Player email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              style={styles.input}
            />
            <input
              type="text"
              placeholder="Display name"
              value={newUserDisplayName}
              onChange={(e) => setNewUserDisplayName(e.target.value)}
              style={styles.input}
            />
            <input
              type="password"
              placeholder="Preset password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              style={styles.input}
            />
          </div>

          <button
            onClick={createPasswordUser}
            disabled={creatingUser}
            style={styles.primaryButton}
          >
            {creatingUser ? "Creating User..." : "Create User"}
          </button>

          <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 12 }}>
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search users by email or display name"
              style={{ ...styles.input, marginBottom: 0 }}
            />
            <button
              onClick={() => setUserQuery("")}
              style={styles.secondaryButton}
              disabled={!userQuery}
            >
              Clear
            </button>
          </div>

          <div style={{ marginBottom: 10, fontSize: 13, color: "#666" }}>
            Showing {filteredUsers.length} of {users.length} users
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={styles.tableCell}>Email</th>
                  <th style={styles.tableCell}>Display Name</th>
                  <th style={styles.tableCell}>Password</th>
                  <th style={styles.tableCell}>Status</th>
                  <th style={styles.tableCell}>Created</th>
                  <th style={styles.tableCell}>Last Sign In</th>
                  <th style={styles.tableCell}>Confirmed</th>
                  <th style={styles.tableCell}>Actions</th>
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

                    return (
                      <tr key={u.id}>
                        <td style={styles.tableCell}>
                          {!editing ? (
                            u.email
                          ) : (
                            <input
                              value={editUserEmail}
                              onChange={(e) => setEditUserEmail(e.target.value)}
                              style={styles.input}
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
                                style={styles.input}
                              />
                            </>
                          )}
                        </td>

                        <td style={styles.tableCell}>
                          {editing ? (
                            <span style={{ color: "#666", fontSize: 13 }}>
                              Existing password hidden
                            </span>
                          ) : (
                            <span style={{ letterSpacing: 2 }}>••••••••</span>
                          )}
                        </td>

                        <td style={styles.tableCell}>
                          {getSetupStatus(u)}
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
      </div>
    </main>
  );
}