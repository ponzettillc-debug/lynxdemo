"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];
const LAST_EMAIL_KEY = "lynxdemo_last_email";

export default function HomePage() {
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    const rememberedEmail =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LAST_EMAIL_KEY) || ""
        : "";

    if (rememberedEmail) {
      setSavedEmail(rememberedEmail);
      setEmail(rememberedEmail);
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userEmail = session?.user?.email?.toLowerCase() ?? "";
  const isAdmin = useMemo(() => ADMIN_EMAILS.includes(userEmail), [userEmail]);

  async function sendMagicLink(targetEmail?: string) {
    const finalEmail = (targetEmail ?? email).trim().toLowerCase();

    if (!finalEmail) {
      setMessage("Enter your email to receive a sign-in link.");
      return;
    }

    try {
      setSendingLink(true);
      setMessage("Sending magic link...");

      const { error } = await supabase.auth.signInWithOtp({
        email: finalEmail,
        options: {
          emailRedirectTo: "https://lynxdemo10.vercel.app",
        },
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_EMAIL_KEY, finalEmail);
      }

      setSavedEmail(finalEmail);
      setEmail(finalEmail);
      setMessage(`Magic link sent to ${finalEmail}. Open the newest email to sign in.`);
    } catch (err: any) {
      setMessage(err?.message || "Unable to send magic link.");
    } finally {
      setSendingLink(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setMessage("Signed out.");
  }

  async function setupPool() {
    try {
      setBootstrapping(true);
      setMessage("Setting up pool...");

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setMessage("You must be signed in.");
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
        setMessage(j?.error || "Setup failed.");
        return;
      }

      setMessage("Pool ready ✅");
    } catch (err: any) {
      setMessage(err?.message || "Setup failed.");
    } finally {
      setBootstrapping(false);
    }
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
      maxWidth: 520,
      margin: "0 auto",
    } as React.CSSProperties,

    brandWrap: {
      marginBottom: 20,
      textAlign: "center" as const,
    },

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
      width: "100%",
      padding: "14px 16px",
      borderRadius: 14,
      border: "1px solid rgba(148,163,184,0.2)",
      background: "rgba(15,23,42,0.92)",
      color: "#e2e8f0",
      fontWeight: 800,
      fontSize: 15,
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
  };

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.brandWrap}>
            <div style={styles.badge}>LynxDemo</div>
            <h1 style={styles.title}>Loading your pool...</h1>
            <p style={styles.subtitle}>Checking for an active session.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.brandWrap}>
          <div style={styles.badge}>LynxDemo</div>
          <h1 style={styles.title}>Golf pool, live and ready.</h1>
          <p style={styles.subtitle}>
            Track picks, follow the board, and keep the pool moving with a cleaner
            game-day experience.
          </p>
        </div>

        {!session ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Sign in</h2>
            <p style={styles.sectionText}>
              Returning users usually stay signed in on the same browser. If not,
              enter your email and we’ll send a fresh magic link.
            </p>

            {savedEmail ? (
              <>
                <div style={styles.statRow}>
                  <div style={styles.statCard}>
                    <p style={styles.statLabel}>Saved sign-in</p>
                    <p style={styles.statValue}>{savedEmail}</p>
                  </div>
                  <div style={styles.statCard}>
                    <p style={styles.statLabel}>Access method</p>
                    <p style={styles.statValue}>Magic Link</p>
                  </div>
                </div>

                <button
                  onClick={() => sendMagicLink(savedEmail)}
                  disabled={sendingLink}
                  style={{
                    ...styles.primaryButton,
                    opacity: sendingLink ? 0.7 : 1,
                    cursor: sendingLink ? "default" : "pointer",
                    marginBottom: 10,
                  }}
                >
                  {sendingLink ? "Sending..." : `Send link to ${savedEmail}`}
                </button>

                <button
                  onClick={() => {
                    setEmail(savedEmail);
                    setMessage("You can use your saved email or enter a different one below.");
                  }}
                  style={{ ...styles.ghostButton, marginBottom: 16 }}
                >
                  Use saved email
                </button>
              </>
            ) : null}

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              style={styles.input}
            />

            <button
              onClick={() => sendMagicLink()}
              disabled={sendingLink}
              style={{
                ...styles.primaryButton,
                opacity: sendingLink ? 0.7 : 1,
                cursor: sendingLink ? "default" : "pointer",
              }}
            >
              {sendingLink ? "Sending..." : "Send Magic Link"}
            </button>

            {savedEmail && email.trim().toLowerCase() !== savedEmail.toLowerCase() ? (
              <button
                onClick={() => sendMagicLink(savedEmail)}
                disabled={sendingLink}
                style={{ ...styles.secondaryButton, marginTop: 10 }}
              >
                Send to saved email instead
              </button>
            ) : null}

            {!!message && <p style={styles.message}>{message}</p>}
          </div>
        ) : (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Welcome back</h2>
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
                <p style={styles.statValue}>{isAdmin ? "Admin" : "Player"}</p>
              </div>
            </div>

            <div style={styles.quickGrid}>
              <button
                onClick={() => router.push("/picks")}
                style={styles.primaryButton}
              >
                Enter Picks
              </button>

              <button
                onClick={() => router.push("/leaderboard")}
                style={styles.secondaryButton}
              >
                View Leaderboard
              </button>

              {isAdmin ? (
                <>
                  <hr style={styles.divider} />

                  <button
                    onClick={setupPool}
                    disabled={bootstrapping}
                    style={{
                      ...styles.secondaryButton,
                      opacity: bootstrapping ? 0.7 : 1,
                      cursor: bootstrapping ? "default" : "pointer",
                    }}
                  >
                    {bootstrapping ? "Setting Up Pool..." : "Setup Pool"}
                  </button>

                  <button
                    onClick={() => router.push("/admin")}
                    style={styles.secondaryButton}
                  >
                    Open Admin Dashboard
                  </button>
                </>
              ) : null}

              <hr style={styles.divider} />

              <button onClick={signOut} style={styles.ghostButton}>
                Sign Out
              </button>
            </div>

            {!!message && <p style={styles.message}>{message}</p>}
          </div>
        )}
      </div>
    </main>
  );
}