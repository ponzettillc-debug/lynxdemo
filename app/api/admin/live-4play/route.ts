import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Live4PlayRow = {
  id: string;
  name: string;
  format: string;
  holes_count: number;
  team_names: string[] | null;
  status: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isMissingLiveTable(message?: string | null) {
  return /live_4play_tournaments|schema cache|does not exist|relation/i.test(message || "");
}

async function requireAdmin(req: NextRequest) {
  if (!supabaseUrl) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_URL.", 500) };
  if (!supabaseAnonKey) return { error: jsonError("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.", 500) };
  if (!supabaseServiceRoleKey) return { error: jsonError("Missing SUPABASE_SERVICE_ROLE_KEY.", 500) };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) return { error: jsonError("Missing auth token.", 401) };

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user?.email) return { error: jsonError("Unauthorized.", 401) };

  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return { error: jsonError("Admin access required.", 403) };
  }

  return { supabaseAdmin };
}

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;
    const { supabaseAdmin } = adminCheck;

    const { data, error } = await supabaseAdmin
      .from("live_4play_tournaments")
      .select("id,name,format,holes_count,team_names,status,created_by,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      if (isMissingLiveTable(error.message)) {
        return NextResponse.json({ ok: true, storage: "local", tournaments: [] });
      }
      return jsonError(`Load Live 4Play tournaments failed: ${error.message}`, 400);
    }

    return NextResponse.json({
      ok: true,
      storage: "supabase",
      tournaments: (data ?? []) as Live4PlayRow[],
    });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Unexpected Live 4Play admin error.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;
    const { supabaseAdmin } = adminCheck;

    const id = req.nextUrl.searchParams.get("id") || "";
    if (!id) return jsonError("Live 4Play tournament id is required.", 400);

    const { error } = await supabaseAdmin
      .from("live_4play_tournaments")
      .delete()
      .eq("id", id);

    if (error) {
      if (isMissingLiveTable(error.message)) {
        return jsonError("Live 4Play table is not installed yet.", 400);
      }
      return jsonError(`Delete Live 4Play tournament failed: ${error.message}`, 400);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : "Unexpected Live 4Play delete error.", 500);
  }
}
