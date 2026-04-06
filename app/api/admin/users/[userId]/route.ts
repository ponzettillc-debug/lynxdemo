import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!supabaseAnonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

async function requireAdmin(req: NextRequest) {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } = getEnv();

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw Object.assign(new Error("Missing auth token."), { status: 401 });
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user: requester },
    error: requesterError,
  } = await supabaseAuth.auth.getUser(token);

  if (requesterError || !requester?.email) {
    throw Object.assign(new Error("Unauthorized."), { status: 401 });
  }

  const requesterEmail = requester.email.toLowerCase();

  if (!ADMIN_EMAILS.includes(requesterEmail)) {
    throw Object.assign(new Error("Admin access required."), { status: 403 });
  }

  return { requester, supabaseAdmin };
}

export async function PATCH(
  req: NextRequest,
  context: { params: { userId: string } }
) {
  try {
    const { requester, supabaseAdmin } = await requireAdmin(req);
    const userId = context.params.userId;

    if (!userId) {
      return jsonError("Missing user id.");
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const displayName = String(body?.display_name || "").trim();
    const password = String(body?.password || "").trim();

    if (!email) {
      return jsonError("Email is required.");
    }

    if (password && password.length < 8) {
      return jsonError("Password must be at least 8 characters.");
    }

    const updatePayload: Record<string, any> = {
      email,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
      },
    };

    if (password) {
      updatePayload.password = password;
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      updatePayload
    );

    if (error || !data.user) {
      return jsonError(error?.message || "User update failed.", 400);
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email || "",
        display_name: String(data.user.user_metadata?.display_name || ""),
      },
    });
  } catch (err: any) {
    return jsonError(err?.message || "Unexpected error.", err?.status || 500);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: { userId: string } }
) {
  try {
    const { requester, supabaseAdmin } = await requireAdmin(req);
    const userId = context.params.userId;

    if (!userId) {
      return jsonError("Missing user id.");
    }

    if (requester.id === userId) {
      return jsonError("You cannot delete your own admin account from here.", 400);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      return jsonError(error.message || "User deletion failed.", 400);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(err?.message || "Unexpected error.", err?.status || 500);
  }
}