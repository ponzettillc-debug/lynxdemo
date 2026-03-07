import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice("Bearer ".length);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const poolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";

    // Verify user using anon + token
    const supaAuth = createClient(url, anon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supaAuth.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = userData.user.id;

    // Admin client for DB writes
    const admin = createClient(url, service, { auth: { persistSession: false } });

    // Find or create pool
    const { data: existingPool } = await admin
      .from("pools")
      .select("*")
      .eq("name", poolName)
      .maybeSingle();

    let pool = existingPool;
    if (!pool) {
      const { data: created, error: cErr } = await admin
        .from("pools")
        .insert({ name: poolName, owner_id: userId })
        .select("*")
        .single();
      if (cErr) throw cErr;
      pool = created;

      await admin.from("pool_members").insert({ pool_id: pool.id, user_id: userId, role: "owner" });
    } else {
      // Ensure membership exists
      const { data: member } = await admin
        .from("pool_members")
        .select("*")
        .eq("pool_id", pool.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!member) {
        await admin.from("pool_members").insert({ pool_id: pool.id, user_id: userId, role: "member" });
      }
    }

    return NextResponse.json({ pool }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}