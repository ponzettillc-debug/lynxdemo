import Link from "next/link";
import AppLogo from "../components/AppLogo";

export default function RulesPage() {
  const shell: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(34,197,94,0.08) 0%, rgba(15,23,42,1) 22%, rgba(2,6,23,1) 100%)",
    padding: "20px 14px 60px",
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

  const navLink: React.CSSProperties = {
    textDecoration: "none",
    color: "#e2e8f0",
    fontWeight: 800,
    fontSize: 14,
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.88)",
    border: "1px solid rgba(148,163,184,0.14)",
  };

  const ruleItem: React.CSSProperties = {
    padding: 16,
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.14)",
    background: "rgba(2,6,23,0.48)",
    color: "#e2e8f0",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: 700,
  };

  return (
    <main style={shell}>
      <div style={{ maxWidth: 760, margin: "34px auto", display: "grid", gap: 16 }}>
        <section style={card}>
          <div className="soft-logo-mark" style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <AppLogo priority width={240} height={100} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>Rules</h1>
              <p style={{ margin: "6px 0 0", color: "#94a3b8", fontWeight: 700 }}>
                4Play Golf tournament scoring
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/picks" style={navLink}>
                Picks
              </Link>
              <Link href="/" style={navLink}>
                Home
              </Link>
            </div>
          </div>
        </section>

        <section style={card}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={ruleItem}>Pick four players each day of the tournament.</div>
            <div style={ruleItem}>You cannot use the same player more than once.</div>
            <div style={ruleItem}>
              You accumulate each selected player's score for the specific round you chose them.
            </div>
            <div style={ruleItem}>
              Total scores are accumulated until tournament completion.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
