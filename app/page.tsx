"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import AppLogo from "./components/AppLogo";

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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
        setMessage(error.message || "Unable to sign in.");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_EMAIL_KEY, finalEmail);
      }

      setSavedEmail(finalEmail);
      setPassword("");
      setMessage("Signed in successfully.");
    } catch (err: any) {
      setMessage(err?.message || "Unable to sign in.");
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
        setMessage(error.message || "Unable to send magic link.");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_EMAIL_KEY, finalEmail);
      }

      setSavedEmail(finalEmail);
      setEmail(finalEmail);
      setMessage(`Magic link sent to ${finalEmail}.`);
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
        setMessage(j?.error || "Bootstrap failed.");
        return;
      }

      setMessage("Pool ready ✅");
    } catch (err: any) {
      setMessage(err?.message || "Bootstrap failed.");
    } finally {
      setBootstrapping(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "rgba(15,23,42,0.86)",
    color: "#f8fafc",
    border: "1px solid rgba(148,163,184,0.14)",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
    backdropFilter: "blur(10px)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "13px 14px",
    marginBottom: 12,
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.16)",
    background: "rgba(2,6,23,0.82)",
    color: "#f8fafc",
    fontSize: 15,
    outline: "none",
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 16,
    border: "none",
    background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
    color: "#03120a",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(34,197,94,0.26)",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    border: "1px solid rgba(148,163,184,0.16)",
    background: "rgba(15,23,42,0.92)",
    color: "#e2e8f0",
    boxShadow: "none",
  };

  const logoWrap: React.CSSProperties = {
    marginBottom: 12,
    display: "flex",
    justifyContent: "center",
  };

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(circle at top, rgba(34,197,94,0.08) 0%, rgba(15,23,42,1) 22%, rgba(2,6,23,1) 100%)",
          padding: 20,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
          <div style={{ ...cardStyle, width: "100%", maxWidth: 520 }}>
          <div className="soft-logo-mark" style={logoWrap}>
            <AppLogo priority width={260} height={110} />
          </div>
          <p style={{ margin: 0, textAlign: "center" }}>Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(34,197,94,0.08) 0%, rgba(15,23,42,1) 22%, rgba(2,6,23,1) 100%)",
        padding: 20,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 520, margin: "40px auto" }}>
        {!session ? (
          <div style={cardStyle}>
            <div className="soft-logo-mark" style={logoWrap}>
              <AppLogo priority width={260} height={110} />
            </div>

            <p
              style={{
                marginTop: 0,
                marginBottom: 20,
                color: "#94a3b8",
                textAlign: "center",
              }}
            >
              Sign in with the email and password set up by the admin.
            </p>

            {savedEmail ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(2,6,23,0.62)",
                  border: "1px solid rgba(148,163,184,0.12)",
                  color: "#cbd5e1",
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
              onKeyDown={(e) => {
                if (e.key === "Enter") signInWithPassword();
              }}
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
                {signingInPassword ? "Signing In..." : "Sign In"}
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
                {sendingLink ? "Sending..." : "Send Magic Link Instead"}
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
              <p style={{ marginTop: 14, marginBottom: 0, color: "#cbd5e1" }}>
                {message}
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={cardStyle}>
              <div className="soft-logo-mark" style={logoWrap}>
                <AppLogo priority width={240} height={100} />
              </div>
              <p style={{ marginTop: 0, marginBottom: 8 }}>
                Logged in as <strong>{session.user.email}</strong>
              </p>
            </div>

            <div style={cardStyle}>
              <div style={{ display: "grid", gap: 10 }}>
                <button
                  onClick={() => router.push("/picks")}
                  style={secondaryButtonStyle}
                >
                  Make Picks
                </button>

                <button
                  onClick={() => router.push("/leaderboard")}
                  style={secondaryButtonStyle}
                >
                  View Leaderboard
                </button>

                <button
                  onClick={() => router.push("/trophy-room")}
                  style={secondaryButtonStyle}
                >
                  Trophy Room
                </button>

                {isAdmin && (
                  <>
                    <hr
                      style={{
                        border: "none",
                        borderTop: "1px solid rgba(148,163,184,0.14)",
                        margin: "8px 0",
                      }}
                    />

                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#94a3b8",
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
                    borderTop: "1px solid rgba(148,163,184,0.14)",
                    margin: "8px 0",
                  }}
                />

                <button onClick={signOut} style={secondaryButtonStyle}>
                  Sign Out
                </button>
              </div>

              {!!message && (
                <p style={{ marginTop: 14, marginBottom: 0, color: "#cbd5e1" }}>
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

