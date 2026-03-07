import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRole);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

    // verify user
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const tournamentId: string | undefined = body.tournamentId;
    if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

    // load tournament (to get pool_id)
    const { data: t, error: tErr } = await admin
      .from("tournaments")
      .select("id,pool_id")
      .eq("id", tournamentId)
      .single();

    if (tErr || !t) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    // must be admin of this pool
    const { data: pm, error: pmErr } = await admin
      .from("pool_members")
      .select("is_admin")
      .eq("pool_id", t.pool_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (pmErr) return NextResponse.json({ error: pmErr.message }, { status: 400 });
    if (!pm?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    // delete children first to avoid FK constraint issues
    const { error: sErr } = await admin.from("scores").delete().eq("tournament_id", tournamentId);
    if (sErr) return NextResponse.json({ error: `Delete scores failed: ${sErr.message}` }, { status: 400 });

    const { error: pErr } = await admin.from("picks").delete().eq("tournament_id", tournamentId);
    if (pErr) return NextResponse.json({ error: `Delete picks failed: ${pErr.message}` }, { status: 400 });

    const { error: tDelErr } = await admin.from("tournaments").delete().eq("id", tournamentId);
    if (tDelErr) return NextResponse.json({ error: `Delete tournament failed: ${tDelErr.message}` }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete error" }, { status: 500 });
  }
}