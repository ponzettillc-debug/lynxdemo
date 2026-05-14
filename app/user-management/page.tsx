"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import AppLogo from "../components/AppLogo";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FOUR_PLAY_ME_IMAGES: Record<string, string> = {
  "327aa886-564c-4ca8-8ef4-d5a338b06dec":
    "/4play-me/327aa886-564c-4ca8-8ef4-d5a338b06dec.png",
  "4446f6bc-7869-45e9-82a2-8e4b03a1fede":
    "/4play-me/4446f6bc-7869-45e9-82a2-8e4b03a1fede.png",
  "43004b27-4d15-434c-89c0-788550a0db66":
    "/4play-me/43004b27-4d15-434c-89c0-788550a0db66.png",
  "4b9cb0a3-0591-47d3-a87d-5624dacec3f5":
    "/4play-me/4b9cb0a3-0591-47d3-a87d-5624dacec3f5.png",
  "a2fc9c61-c935-4351-97ed-75397f0b7c5b":
    "/4play-me/a2fc9c61-c935-4351-97ed-75397f0b7c5b.png",
  "9b76de88-272c-444c-9a03-b82de61afa72":
    "/4play-me/9b76de88-272c-444c-9a03-b82de61afa72.png",
};

type PastResult = {
  tournament_id: string;
  tournament_name: string;
  completed_at: string | null;
  total_strokes: number;
  score_label: string;
  rank: number;
  rank_label: string;
  field_size: number;
};

export default function UserManagementPage() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [resultsStatus, setResultsStatus] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [results, setResults] = useState<PastResult[]>([]);
  const [showFourPlayMe, setShowFourPlayMe] = useState(false);
  const fourPlayMeImage =
    FOUR_PLAY_ME_IMAGES[session?.user?.id ?? ""] || "/4play-me.png";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session);
      setDisplayName(String(data.session.user?.user_metadata?.display_name || ""));
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
      setDisplayName(String(nextSession.user?.user_metadata?.display_name || ""));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    loadResults();
  }, [session?.access_token]);

  async function loadResults() {
    try {
      setResultsStatus("Loading past results...");
      const token = session?.access_token;
      if (!token) return;

      const r = await fetch("/api/account/results", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setResultsStatus(j?.error || "Unable to load past results.");
        setResults([]);
        return;
      }

      setResults((j?.results ?? []) as PastResult[]);
      setResultsStatus("");
    } catch (err: any) {
      setResultsStatus(err?.message || "Unable to load past results.");
      setResults([]);
    }
  }

  async function saveDisplayName() {
    try {
      setSavingName(true);
      setStatus("Saving display name...");

      const { data, error } = await supabase.auth.updateUser({
        data: { display_name: displayName.trim() },
      });

      if (error) {
        setStatus(error.message || "Display name update failed.");
        return;
      }

      setSession((current: any) =>
        current ? { ...current, user: data.user || current.user } : current
      );
      setStatus("Display name saved.");
    } catch (err: any) {
      setStatus(err?.message || "Display name update failed.");
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      setPasswordStatus("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus("Passwords do not match.");
      return;
    }

    try {
      setSavingPassword(true);
      setPasswordStatus("Updating password...");

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setPasswordStatus(error.message || "Password update failed.");
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("Password updated.");
    } catch (err: any) {
      setPasswordStatus(err?.message || "Password update failed.");
    } finally {
      setSavingPassword(false);
    }
  }

  const shell: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(34,197,94,0.08) 0%, rgba(15,23,42,1) 22%, rgba(2,6,23,1) 100%)",
    padding: 20,
    fontFamily: "Inter, system-ui, sans-serif",
    color: "#f8fafc",
  };

  const card: React.CSSProperties = {
    background: "rgba(15,23,42,0.86)",
    border: "1px solid rgba(148,163,184,0.14)",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
    backdropFilter: "blur(10px)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.16)",
    background: "rgba(2,6,23,0.82)",
    color: "#f8fafc",
    fontSize: 15,
    outline: "none",
  };

  const button: React.CSSProperties = {
    minHeight: 42,
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.16)",
    background: "rgba(15,23,42,0.92)",
    color: "#e2e8f0",
    fontWeight: 900,
    cursor: "pointer",
  };

  if (loading) {
    return (
      <main style={shell}>
        <div style={{ ...card, maxWidth: 760, margin: "40px auto" }}>Loading...</div>
      </main>
    );
  }

  return (
    <main style={shell}>
      <div style={{ maxWidth: 760, margin: "34px auto", display: "grid", gap: 16 }}>
        <section style={card}>
          <div className="soft-logo-mark" style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <AppLogo priority width={240} height={100} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 28 }}>User Management</h1>
              <p style={{ margin: "6px 0 0", color: "#94a3b8" }}>
                Signed in as <strong style={{ color: "#f8fafc" }}>{session?.user?.email}</strong>
              </p>
            </div>
            <Link href="/" style={{ ...button, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Home
            </Link>
          </div>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Profile</h2>
          <label style={{ display: "block", color: "#94a3b8", fontWeight: 800, marginBottom: 8 }}>
            Display Name
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              style={input}
            />
            <button onClick={saveDisplayName} disabled={savingName} style={{ ...button, opacity: savingName ? 0.7 : 1 }}>
              {savingName ? "Saving..." : "Save"}
            </button>
          </div>
          {status ? <p style={{ marginBottom: 0, color: "#cbd5e1" }}>{status}</p> : null}
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Password</h2>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              style={input}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              style={input}
            />
            <button onClick={savePassword} disabled={savingPassword} style={{ ...button, opacity: savingPassword ? 0.7 : 1 }}>
              {savingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
          {passwordStatus ? <p style={{ marginBottom: 0, color: "#cbd5e1" }}>{passwordStatus}</p> : null}
        </section>

        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Past Tournaments</h2>
            <button onClick={loadResults} style={button}>Refresh</button>
          </div>
          {resultsStatus ? <p style={{ color: "#cbd5e1" }}>{resultsStatus}</p> : null}
          {!resultsStatus && results.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No finalized tournament results yet.</p>
          ) : null}
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {results.map((result) => (
              <div
                key={result.tournament_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  padding: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(148,163,184,0.14)",
                  background: "rgba(2,6,23,0.42)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 900 }}>{result.tournament_name}</div>
                  <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 13 }}>
                    {result.rank_label} Place of {result.field_size}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontWeight: 900, color: result.total_strokes < 0 ? "#22c55e" : result.total_strokes > 0 ? "#f87171" : "#e2e8f0" }}>
                  {result.score_label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={card}>
          <button
            onClick={() => setShowFourPlayMe((current) => !current)}
            style={{
              ...button,
              width: "100%",
              minHeight: 54,
              fontSize: 18,
              background:
                "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.92))",
              border: "1px solid rgba(226,232,240,0.22)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            4Play Me!
          </button>
          {showFourPlayMe ? (
            <div
              style={{
                marginTop: 14,
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid rgba(148,163,184,0.18)",
                background: "rgba(2,6,23,0.55)",
                boxShadow: "0 18px 36px rgba(0,0,0,0.32)",
              }}
            >
              <img
                src={fourPlayMeImage}
                alt="Cartoon golfer photo-op"
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                }}
              />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
