"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Put your admin email(s) here
const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
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
  const isAdmin = useMemo(() => {
    return ADMIN_EMAILS.includes(userEmail);
  }, [userEmail]);

  async function signIn() {
    setMessage("Sending magic link...");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "https://lynxdemo10.vercel.app",
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your email for the login link.");
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
      setMessage("Setting up LynxDemo...");

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
          <h1 style={{ marginTop: 0, marginBottom: 8 }}>LynxDemo</h1>
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
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>LynxDemo</h1>
            <p style={{ marginTop: 0, marginBottom: 20, color: "#444" }}>
              Sign in to access your pool, picks, and leaderboard.
            </p>

            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                marginBottom: 12,
                borderRadius: 10,
                border: "1px solid #d0d7de",
                fontSize: 16,
              }}
            />

            <button onClick={signIn} style={buttonStyle}>
              Send Magic Link
            </button>

            {!!message && (
              <p style={{ marginTop: 14, marginBottom: 0, color: "#444" }}>
                {message}
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={cardStyle}>
              <h1 style={{ marginTop: 0, marginBottom: 8 }}>LynxDemo</h1>
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