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

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;

    const { supabaseAdmin } = adminCheck;
    const { userId } = await context.params;

    if (!userId) {
      return jsonError("User id is required.", 400);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const display_name = String(body?.display_name || "").trim();
    const password = String(body?.password || "").trim();

    if (!email) {
      return jsonError("Email is required.", 400);
    }

    const updateData: {
      email: string;
      user_metadata: { display_name: string };
      password?: string;
    } = {
      email,
      user_metadata: { display_name },
    };

    if (password) {
      if (password.length < 8) {
        return jsonError("Password must be at least 8 characters.", 400);
      }
      updateData.password = password;
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      updateData
    );

    if (error) {
      return jsonError(error.message || "Failed to update user.", 400);
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: data.user?.id || "",
        email: data.user?.email || "",
        display_name: String(data.user?.user_metadata?.display_name || ""),
      },
    });
  } catch (err: any) {
    console.error("user PATCH route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;

    const { supabaseAdmin } = adminCheck;
    const { userId } = await context.params;

    if (!userId) {
      return jsonError("User id is required.", 400);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      return jsonError(error.message || "Failed to delete user.", 400);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("user DELETE route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}