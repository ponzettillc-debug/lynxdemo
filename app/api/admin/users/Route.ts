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

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;

    const { supabaseAdmin } = adminCheck;

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

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name,
      },
    });

    if (error) {
      return jsonError(error.message || "Failed to create user.", 400);
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: data.user?.id || "",
        email: data.user?.email || "",
        display_name: String(data.user?.user_metadata?.display_name || ""),
        created_at: data.user?.created_at || null,
        last_sign_in_at: data.user?.last_sign_in_at || null,
        email_confirmed_at: data.user?.email_confirmed_at || null,
      },
    });
  } catch (err: any) {
    console.error("users POST route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}