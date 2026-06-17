import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type MembershipRow = {
  pool_id: string;
  pools?:
    | {
    id: string;
    name: string;
      }
    | Array<{
        id: string;
        name: string;
      }>
    | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getPoolName(row: MembershipRow) {
  const pool = Array.isArray(row.pools) ? row.pools[0] : row.pools;
  return pool?.name ?? null;
}

async function requireUser(req: NextRequest) {
  if (!supabaseUrl) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_URL.", 500) };
  if (!supabaseAnonKey) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.", 500) };
  if (!supabaseServiceRoleKey) return { error: jsonError("Missing SUPABASE_SERVICE_ROLE_KEY.", 500) };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: jsonError("Missing auth token.", 401) };

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user) return { error: jsonError("Unauthorized.", 401) };
  return { user, supabaseAdmin };
}

export async function GET(req: NextRequest) {
  try {
    const check = await requireUser(req);
    if ("error" in check) return check.error;

    const defaultPoolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";
    const { data: memberships, error: membershipError } = await check.supabaseAdmin
      .from("pool_members")
      .select("pool_id,pools(id,name)")
      .eq("user_id", check.user.id);

    if (membershipError) {
      return jsonError(`Failed to verify pool membership: ${membershipError.message}`, 400);
    }

    const rows = (memberships ?? []) as unknown as MembershipRow[];
    const membership =
      rows.find((row) => getPoolName(row) === defaultPoolName) ??
      rows[0] ??
      null;

    if (!membership?.pool_id) {
      return jsonError("You are not assigned to a pool yet.", 403);
    }

    const { data: tournaments, error: tournamentError } = await check.supabaseAdmin
      .from("tournaments")
      .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock")
      .eq("pool_id", membership.pool_id)
      .order("created_at", { ascending: false });

    if (tournamentError) {
      return jsonError(`Error loading tournaments: ${tournamentError.message}`, 400);
    }

    return NextResponse.json({
      ok: true,
      pool_id: membership.pool_id,
      pool_name: getPoolName(membership),
      tournaments: tournaments ?? [],
    });
  } catch (err: unknown) {
    console.error("picks bootstrap GET route error:", err);
    return jsonError(err instanceof Error ? err.message : "Unexpected picks bootstrap error.", 500);
  }
}
