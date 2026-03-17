"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];
const LAST_EMAIL_KEY = "4play_last_email";

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [signingInPassword, setSigningInPassword] = useState(false);

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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const userEmail = session?.user?.email?.toLowerCase() ?? "";
  const isAdmin = useMemo(() => ADMIN_EMAILS.includes(userEmail), [userEmail]);

  async function signInWithPassword() {
    const finalEmail = email.trim().toLowerCase();

    if (!finalEmail || !password) {
      setMessage("Enter your email and password.");
      return;
    }

    try {
      setSigningInPassword(true);
      setMessage("Signing in...");

      const { error } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_EMAIL_KEY, finalEmail);
      }

      setSavedEmail(finalEmail);
      setPassword("");
      setMessage("Signed in successfully.");
    } catch (err: any) {
      setMessage(err?.message || "Unable to sign in with password.");
    } finally {
      setSigningInPassword(false);
    }
  }

  async function signInWithMagicLink(targetEmail?: string) {
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
      setMessage(`Magic link sent to ${finalEmail}. Check your email for the login link.`);
    } catch (err: any) {
      setMessage(err?.message || "Unable to send magic link.");
    } finally {
      setSendingLink(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMessage("");
    router.refresh();
  }

  async function setupPool() {
    try {
      setBootstrapping(true);
      setMessage("Setting up 4Play...");

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const r = await fetch("/api/bootstrap", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const j = await r.json();

      if (!r.ok) {
        setMessage(j.error || "Bootstrap failed");
        return;
      }

      setMessage("Pool ready ✅");
    } catch (err: any) {
      setMessage(err?.message || "Bootstrap failed");
    } finally {
      setBootstrapping(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #d0d7de",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 12,
    marginBottom: 12,
    borderRadius: 10,
    border: "1px solid #d0d7de",
    fontSize: 16,
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #111111",
    background: "#ffffff",
    color: "#111111",
    fontWeight: 600,
    cursor: "pointer",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    border: "1px solid #d0d7de",
  };

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f6f8fa",
          padding: 20,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ ...cardStyle, width: "100%", maxWidth: 460 }}>
          <h1 style={{ marginTop: 0, marginBottom: 8 }}>4Play</h1>
          <p style={{ margin: 0 }}>Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f6f8fa",
        padding: 20,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 520, margin: "40px auto" }}>
        {!session ? (
          <div style={cardStyle}>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>4Play</h1>
            <p style={{ marginTop: 0, marginBottom: 20, color: "#444" }}>
              Sign in to access your pool, picks, and leaderboard.
            </p>

            {savedEmail ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 10,
                  background: "#f6f8fa",
                  border: "1px solid #d0d7de",
                  color: "#444",
                  fontSize: 14,
                }}
              >
                Saved email: <strong>{savedEmail}</strong>
              </div>
            ) : null}

            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              style={inputStyle}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={inputStyle}
            />

            <div style={{ display: "grid", gap: 10 }}>
              <button
                onClick={signInWithPassword}
                disabled={signingInPassword}
                style={{
                  ...buttonStyle,
                  opacity: signingInPassword ? 0.7 : 1,
                  cursor: signingInPassword ? "default" : "pointer",
                }}
              >
                {signingInPassword ? "Signing In..." : "Sign In With Password"}
              </button>

              <button
                onClick={() => signInWithMagicLink()}
                disabled={sendingLink}
                style={{
                  ...secondaryButtonStyle,
                  opacity: sendingLink ? 0.7 : 1,
                  cursor: sendingLink ? "default" : "pointer",
                }}
              >
                {sendingLink ? "Sending..." : "Send Magic Link"}
              </button>

              {savedEmail &&
              email.trim().toLowerCase() !== savedEmail.toLowerCase() ? (
                <button
                  onClick={() => signInWithMagicLink(savedEmail)}
                  disabled={sendingLink}
                  style={{
                    ...secondaryButtonStyle,
                    opacity: sendingLink ? 0.7 : 1,
                    cursor: sendingLink ? "default" : "pointer",
                  }}
                >
                  {sendingLink ? "Sending..." : `Send Link to ${savedEmail}`}
                </button>
              ) : null}
            </div>

            {!!message && (
              <p style={{ marginTop: 14, marginBottom: 0, color: "#444" }}>
                {message}
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={cardStyle}>
              <h1 style={{ marginTop: 0, marginBottom: 8 }}>4Play</h1>
              <p style={{ marginTop: 0, marginBottom: 8 }}>
                Logged in as <strong>{session.user.email}</strong>
              </p>
              <p style={{ margin: 0, color: "#444" }}>
                Welcome to the pool.
              </p>
            </div>

            <div style={cardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 14 }}>Pool Home</h2>

              <div style={{ display: "grid", gap: 10 }}>
                <button
                  onClick={() => router.push("/picks")}
                  style={buttonStyle}
                >
                  Make Picks
                </button>

                <button
                  onClick={() => router.push("/leaderboard")}
                  style={secondaryButtonStyle}
                >
                  View Leaderboard
                </button>

                {isAdmin && (
                  <>
                    <hr
                      style={{
                        border: "none",
                        borderTop: "1px solid #e5e7eb",
                        margin: "8px 0",
                      }}
                    />

                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#444",
                        marginBottom: 4,
                      }}
                    >
                      Admin Tools
                    </div>

                    <button
                      onClick={setupPool}
                      disabled={bootstrapping}
                      style={{
                        ...secondaryButtonStyle,
                        opacity: bootstrapping ? 0.7 : 1,
                        cursor: bootstrapping ? "default" : "pointer",
                      }}
                    >
                      {bootstrapping ? "Setting Up Pool..." : "Setup Pool"}
                    </button>

                    <button
                      onClick={() => router.push("/admin")}
                      style={secondaryButtonStyle}
                    >
                      Admin Dashboard
                    </button>
                  </>
                )}

                <hr
                  style={{
                    border: "none",
                    borderTop: "1px solid #e5e7eb",
                    margin: "8px 0",
                  }}
                />

                <button onClick={signOut} style={secondaryButtonStyle}>
                  Sign Out
                </button>
              </div>

              {!!message && (
                <p style={{ marginTop: 14, marginBottom: 0, color: "#444" }}>
                  {message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}