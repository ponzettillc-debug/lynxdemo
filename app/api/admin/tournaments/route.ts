import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["ponzettillc@gmail.com"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type LockFields = {
  round1_lock?: string | null;
  round2_lock?: string | null;
  round3_lock?: string | null;
  round4_lock?: string | null;
  final_lock?: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isMissingFinalLockColumn(message?: string | null) {
  return /final_lock|schema cache|column/i.test(message || "");
}

function lockValue(locked: boolean, existing?: string | null) {
  return locked ? existing || new Date().toISOString() : null;
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

function lockPayload(body: any, existing: LockFields = {}) {
  const locks = body?.locks || {};
  return {
    round1_lock: lockValue(!!locks.round1, existing.round1_lock),
    round2_lock: lockValue(!!locks.round2, existing.round2_lock),
    round3_lock: lockValue(!!locks.round3, existing.round3_lock),
    round4_lock: lockValue(!!locks.round4, existing.round4_lock),
    final_lock: lockValue(!!locks.final, existing.final_lock),
  };
}

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;
    const { supabaseAdmin } = adminCheck;

    const body = await req.json().catch(() => ({}));
    const poolId = String(body?.pool_id || "");
    const name = String(body?.name || "").trim();

    if (!poolId || !name) return jsonError("pool_id and tournament name are required.", 400);

    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .insert({
        pool_id: poolId,
        name,
        ...lockPayload(body),
      })
      .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock,final_lock")
      .single();

    if (error) {
      if (isMissingFinalLockColumn(error.message)) {
        return jsonError("Final/Lock column is missing. Run supabase/final_lock.sql in Supabase SQL Editor, then try again.", 400);
      }
      return jsonError(`Create tournament failed: ${error.message}`, 400);
    }

    return NextResponse.json({ ok: true, tournament: data });
  } catch (err: any) {
    console.error("admin tournaments POST route error:", err);
    return jsonError(err?.message || "Unexpected tournament create error.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if ("error" in adminCheck) return adminCheck.error;
    const { supabaseAdmin } = adminCheck;

    const body = await req.json().catch(() => ({}));
    const poolId = String(body?.pool_id || "");
    const tournamentId = String(body?.tournament_id || "");
    const name = String(body?.name || "").trim();

    if (!poolId || !tournamentId || !name) {
      return jsonError("pool_id, tournament_id, and tournament name are required.", 400);
    }

    const { data: existing, error: loadError } = await supabaseAdmin
      .from("tournaments")
      .select("id,round1_lock,round2_lock,round3_lock,round4_lock,final_lock")
      .eq("pool_id", poolId)
      .eq("id", tournamentId)
      .maybeSingle();

    if (loadError) {
      if (isMissingFinalLockColumn(loadError.message)) {
        return jsonError("Final/Lock column is missing. Run supabase/final_lock.sql in Supabase SQL Editor, then try again.", 400);
      }
      return jsonError(`Load tournament failed: ${loadError.message}`, 400);
    }
    if (!existing) return jsonError("Tournament was not found.", 404);

    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .update({
        name,
        ...lockPayload(body, existing),
      })
      .eq("pool_id", poolId)
      .eq("id", tournamentId)
      .select("id,name,round1_lock,round2_lock,round3_lock,round4_lock,final_lock")
      .single();

    if (error) {
      if (isMissingFinalLockColumn(error.message)) {
        return jsonError("Final/Lock column is missing. Run supabase/final_lock.sql in Supabase SQL Editor, then try again.", 400);
      }
      return jsonError(`Save tournament failed: ${error.message}`, 400);
    }

    return NextResponse.json({ ok: true, tournament: data });
  } catch (err: any) {
    console.error("admin tournaments PATCH route error:", err);
    return jsonError(err?.message || "Unexpected tournament save error.", 500);
  }
}
