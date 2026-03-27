import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseUrl) {
      return jsonError("Missing NEXT_PUBLIC_SUPABASE_URL.", 500);
    }

    if (!supabaseAnonKey) {
      return jsonError("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.", 500);
    }

    if (!supabaseServiceRoleKey) {
      return jsonError("Missing SUPABASE_SERVICE_ROLE_KEY.", 500);
    }

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

    const body = await req.json().catch(() => null);

    if (!body) {
      return jsonError("Invalid JSON body.", 400);
    }

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const displayName = String(body?.display_name || "").trim();

    if (!email || !password) {
      return jsonError("Email and password are required.", 400);
    }

    if (!isValidEmail(email)) {
      return jsonError("Please enter a valid email address.", 400);
    }

    if (password.length < 8) {
      return jsonError("Password must be at least 8 characters.", 400);
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
      },
    });

    if (error) {
      const msg = error.message || "User creation failed.";

      if (
        msg.toLowerCase().includes("already") ||
        msg.toLowerCase().includes("exists") ||
        msg.toLowerCase().includes("registered")
      ) {
        return jsonError("A user with that email already exists.", 409);
      }

      return jsonError(msg, 400);
    }

    return NextResponse.json({
      ok: true,
      email,
      userId: data.user?.id ?? null,
      display_name: data.user?.user_metadata?.display_name ?? "",
    });
  } catch (err: any) {
    console.error("create-user route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}