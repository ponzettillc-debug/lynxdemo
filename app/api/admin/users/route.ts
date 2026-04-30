import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function requireAdmin(req: NextRequest) {
  if (!supabaseUrl) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_URL.", 500) };
  if (!supabaseAnonKey) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.", 500) };
  if (!supabaseServiceRoleKey) return { error: jsonError("Missing SUPABASE_SERVICE_ROLE_KEY.", 500) };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { error: jsonError("Missing auth token.", 401) };
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  const {
    data: { user: requester },
    error: requesterError,
  } = await supabaseAuth.auth.getUser(token);

  if (requesterError || !requester?.email) {
    return { error: jsonError("Unauthorized.", 401) };
  }

  const requesterEmail = requester.email.toLowerCase();

  if (!ADMIN_EMAILS.includes(requesterEmail)) {
    return { error: jsonError("Admin access required.", 403) };
  }

  return { supabaseAdmin };
}

async function getDefaultPoolId(supabaseAdmin: any) {
  const defaultPoolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";

  const { data, error } = await supabaseAdmin
    .from("pools")
    .select("id")
    .eq("name", defaultPoolName)
    .limit(1);

  if (error) {
    throw new Error(`Failed to load default pool: ${error.message}`);
  }

  const poolRows = (data ?? []) as Array<{ id: string }>;
  const poolId = poolRows[0]?.id;

  if (!poolId) {
    throw new Error(
      `Default pool "${defaultPoolName}" was not found. Run Setup Pool first from the admin page.`
    );
  }

  return poolId;
}

async function findUserByEmail(supabaseAdmin: any, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message || "Failed to search users.");
    }

    const users = data?.users || [];
    const match = users.find(
      (u: any) => (u.email || "").toLowerCase() === normalizedEmail
    );

    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }

  throw new Error("Unable to search all users. Too many users were returned.");
}

async function getMembershipByUserId(supabaseAdmin: any, poolId: string) {
  const { data, error } = await supabaseAdmin
    .from("pool_members")
    .select("user_id,role")
    .eq("pool_id", poolId);

  if (error) {
    throw new Error(`Failed to load pool memberships: ${error.message}`);
  }

  const map = new Map<string, string | null>();
  (data ?? []).forEach((row: any) => {
    map.set(row.user_id, row.role ?? null);
  });

  return map;
}

async function ensurePoolMembership(
  supabaseAdmin: any,
  poolId: string,
  userId: string
) {
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("pool_members")
    .select("role")
    .eq("pool_id", poolId)
    .eq("user_id", userId)
    .limit(1);

  if (existingError) {
    throw new Error(`Failed to check pool membership: ${existingError.message}`);
  }

  const existing = (existingRows ?? [])[0];
  if (existing) {
    return existing.role ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from("pool_members")
    .insert({
      pool_id: poolId,
      user_id: userId,
      role: "member",
    })
    .select("role")
    .single();

  if (error) {
    throw new Error(`Failed to assign user to pool: ${error.message}`);
  }

  return data?.role ?? "member";
}

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;

    const { supabaseAdmin } = adminCheck;
    const poolId = await getDefaultPoolId(supabaseAdmin);
    const membershipByUserId = await getMembershipByUserId(supabaseAdmin, poolId);

    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      return jsonError(error.message || "Failed to list users.", 400);
    }

    const users = (data?.users || []).map((u) => ({
      id: u.id,
      email: u.email || "",
      display_name: String(u.user_metadata?.display_name || ""),
      created_at: u.created_at || null,
      last_sign_in_at: u.last_sign_in_at || null,
      email_confirmed_at: u.email_confirmed_at || null,
      pool_member: membershipByUserId.has(u.id),
      pool_role: membershipByUserId.get(u.id) ?? null,
    }));

    users.sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({
      ok: true,
      users,
    });
  } catch (err: any) {
    console.error("users GET route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;

    const { supabaseAdmin } = adminCheck;

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();
    const display_name = String(body?.display_name || "").trim();

    if (!email) {
      return jsonError("Email is required.", 400);
    }

    if (!password) {
      return jsonError("Password is required.", 400);
    }

    if (password.length < 8) {
      return jsonError("Password must be at least 8 characters.", 400);
    }

    const poolId = await getDefaultPoolId(supabaseAdmin);

    let authUser = await findUserByEmail(supabaseAdmin, email);
    let createdNewUser = false;

    if (!authUser) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name,
        },
      });

      if (error) {
        const existingUser = await findUserByEmail(supabaseAdmin, email);
        if (!existingUser) {
          return jsonError(error.message || "Failed to create user.", 400);
        }
        authUser = existingUser;
      } else {
        authUser = data.user;
        createdNewUser = true;
      }
    }

    const userId = authUser?.id;
    if (!userId) {
      return jsonError("User was created but no user id was returned.", 500);
    }

    let poolRole: string | null = null;

    try {
      poolRole = await ensurePoolMembership(supabaseAdmin, poolId, userId);
    } catch (memberError: any) {
      if (createdNewUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null);
      }

      return jsonError(memberError?.message || "Failed to assign user to pool.", 400);
    }

    return NextResponse.json({
      ok: true,
      created: createdNewUser,
      pool_member: true,
      pool_role: poolRole,
      user: {
        id: authUser.id,
        email: authUser.email || "",
        display_name: String(authUser.user_metadata?.display_name || ""),
        created_at: authUser.created_at || null,
        last_sign_in_at: authUser.last_sign_in_at || null,
        email_confirmed_at: authUser.email_confirmed_at || null,
        pool_member: true,
        pool_role: poolRole,
      },
    });
  } catch (err: any) {
    console.error("users POST route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}
