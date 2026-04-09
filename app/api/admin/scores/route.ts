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

  if (!token) return { error: jsonError("Missing auth token.", 401) };

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user?.email) {
    return { error: jsonError("Unauthorized.", 401) };
  }

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

    const { searchParams } = new URL(req.url);
    const poolId = searchParams.get("pool_id") || "";
    const tournamentId = searchParams.get("tournament_id") || "";

    if (!poolId || !tournamentId) {
      return jsonError("pool_id and tournament_id are required.", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("scores")
      .select("golfer_id,round,strokes")
      .eq("pool_id", poolId)
      .eq("tournament_id", tournamentId);

    if (error) {
      return jsonError(`Failed to load scores: ${error.message}`, 400);
    }

    return NextResponse.json({
      ok: true,
      scores: data ?? [],
    });
  } catch (err: any) {
    console.error("scores GET route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;
    const { supabaseAdmin } = adminCheck;

    const body = await req.json().catch(() => ({}));
    const poolId = String(body?.pool_id || "");
    const tournamentId = String(body?.tournament_id || "");
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (!poolId || !tournamentId) {
      return jsonError("pool_id and tournament_id are required.", 400);
    }

    const normalizedRows = rows
      .map((r: any) => ({
        pool_id: String(r.pool_id || poolId),
        tournament_id: String(r.tournament_id || tournamentId),
        golfer_id: String(r.golfer_id || ""),
        round: Number(r.round),
        strokes: Number(r.strokes),
      }))
      .filter(
        (r: any) =>
          r.pool_id &&
          r.tournament_id &&
          r.golfer_id &&
          [1, 2, 3, 4].includes(r.round) &&
          Number.isFinite(r.strokes)
      );

    const { error: deleteErr } = await supabaseAdmin
      .from("scores")
      .delete()
      .eq("pool_id", poolId)
      .eq("tournament_id", tournamentId);

    if (deleteErr) {
      return jsonError(`Clear existing scores failed: ${deleteErr.message}`, 400);
    }

    if (normalizedRows.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from("scores")
        .insert(normalizedRows);

      if (insertErr) {
        return jsonError(`Save scores failed: ${insertErr.message}`, 400);
      }
    }

    const { count, error: verifyErr } = await supabaseAdmin
      .from("scores")
      .select("*", { count: "exact", head: true })
      .eq("pool_id", poolId)
      .eq("tournament_id", tournamentId);

    if (verifyErr) {
      return jsonError(`Scores saved, but verification failed: ${verifyErr.message}`, 400);
    }

    return NextResponse.json({
      ok: true,
      stored_count: count ?? 0,
      submitted_count: normalizedRows.length,
    });
  } catch (err: any) {
    console.error("scores POST route error:", err);
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}