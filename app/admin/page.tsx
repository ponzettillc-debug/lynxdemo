"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

export default function AdminPage() {
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  useEffect(() => {
    if (!loading && session && !isAdmin) {
      router.replace("/");
    }
  }, [loading, session, isAdmin, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f6f8fa",
    padding: 20,
    fontFamily: "system-ui, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    maxWidth: 720,
    margin: "40px auto",
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #d0d7de",
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #111111",
    background: "#ffffff",
    color: "#111111",
    fontWeight: 600,
    cursor: "pointer",
  };

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0 }}>Admin</h1>
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  if (!session || !isAdmin) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0 }}>Access denied</h1>
          <p>You do not have permission to view this page.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Admin Dashboard</h1>
        <p style={{ marginTop: 0, color: "#444" }}>
          Signed in as <strong>{session.user.email}</strong>
        </p>

        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <button onClick={() => router.push("/")} style={buttonStyle}>
            Back to Home
          </button>

          <button onClick={() => router.push("/picks")} style={buttonStyle}>
            Go to Picks
          </button>

          <button
            onClick={() => router.push("/leaderboard")}
            style={buttonStyle}
          >
            Go to Leaderboard
          </button>

          <button onClick={signOut} style={buttonStyle}>
            Sign Out
          </button>
        </div>
      </div>
    </main>
  );
}