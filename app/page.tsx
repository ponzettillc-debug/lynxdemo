"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    setMessage("Sending magic link...");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) setMessage(error.message);
    else setMessage("Check your email for the login link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <main style={{ maxWidth: 400, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>LynxDemo</h1>

      {!session ? (
        <>
          <input
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 10 }}
          />
          <button onClick={signIn} style={{ width: "100%", padding: 10 }}>
            Send Magic Link
          </button>
          <p>{message}</p>
        </>
      ) : (
        <>
          <>
  <p>Logged in as {session.user.email}</p>

  <button
    onClick={async () => {
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
      if (!r.ok) setMessage(j.error || "Bootstrap failed");
      else setMessage("Pool ready ✅");
    }}
    style={{ width: "100%", padding: 10, marginBottom: 10 }}
  >
    Setup LynxDemo Pool
  </button>

  <button onClick={signOut} style={{ width: "100%", padding: 10 }}>
    Sign Out
  </button>

  <p>{message}</p>
</>
        </>
      )}
    </main>
  );
}