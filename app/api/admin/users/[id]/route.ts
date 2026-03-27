import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    if (!supabaseUrl) return jsonError("Missing NEXT_PUBLIC_SUPABASE_URL.", 500);
    if (!supabaseAnonKey) return jsonError("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.", 500);
    if (!supabaseServiceRoleKey) return jsonError("Missing SUPABASE_SERVICE_ROLE_KEY.", 500);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return jsonError("Missing auth token.", 401);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user: requester },
      error: requesterError,
    } = await supabaseAuth.auth.getUser(token);

    if (requesterError || !requester?.email) {
      return jsonError("Unauthorized.", 401);
    }

    const requesterEmail = requester.email.toLowerCase();

    if (!ADMIN_EMAILS.includes(requesterEmail)) {
      return jsonError("Admin access required.", 403);
    }

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
    console.error("users route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}