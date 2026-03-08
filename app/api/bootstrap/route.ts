import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";

    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const poolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";

    if (!url || !anon || !service) {
      return NextResponse.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    // Verify user using anon client + bearer token
    const supaAuth = createClient(url, anon, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supaAuth.auth.getUser(token);

    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = userData.user;
    const userId = user.id;
    const userEmail = user.email?.toLowerCase() ?? "";
    const isAdmin = ADMIN_EMAILS.includes(userEmail);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Admin client for DB writes
    const admin = createClient(url, service, {
      auth: { persistSession: false },
    });

    // Find or create pool
    const { data: existingPool, error: existingPoolErr } = await admin
      .from("pools")
      .select("*")
      .eq("name", poolName)
      .maybeSingle();

    if (existingPoolErr) {
      throw existingPoolErr;
    }

    let pool = existingPool;

    if (!pool) {
      const { data: created, error: createErr } = await admin
        .from("pools")
        .insert({
          name: poolName,
          owner_id: userId,
        })
        .select("*")
        .single();

      if (createErr) {
        throw createErr;
      }

      pool = created;

      const { error: memberInsertErr } = await admin.from("pool_members").insert({
        pool_id: pool.id,
        user_id: userId,
        role: "owner",
      });

      if (memberInsertErr) {
        throw memberInsertErr;
      }
    } else {
      // Ensure membership exists for admin user
      const { data: member, error: memberErr } = await admin
        .from("pool_members")
        .select("*")
        .eq("pool_id", pool.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (memberErr) {
        throw memberErr;
      }

      if (!member) {
        const { error: insertMemberErr } = await admin
          .from("pool_members")
          .insert({
            pool_id: pool.id,
            user_id: userId,
            role: "owner",
          });

        if (insertMemberErr) {
          throw insertMemberErr;
        }
      }
    }

    return NextResponse.json({ pool }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}