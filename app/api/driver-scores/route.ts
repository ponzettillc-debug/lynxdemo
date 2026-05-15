import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

async function requireUser(req: NextRequest) {
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

  if (error || !user) return { error: jsonError("Unauthorized.", 401) };
  return { supabaseAdmin, user };
}

function isMissingScoresTable(message: string) {
  return /driver_scores|schema cache|does not exist|relation/i.test(message);
}

function emailPrefix(email?: string | null) {
  const clean = String(email || "").trim();
  if (!clean) return "";
  return clean.includes("@") ? clean.split("@")[0] : clean;
}

function authUserLabel(user: any) {
  return (
    String(user?.user_metadata?.display_name || "").trim() ||
    emailPrefix(user?.email) ||
    `${String(user?.id || "").slice(0, 8)}...`
  );
}

function isPlaceholderName(value?: string | null) {
  const clean = String(value || "").trim();
  return !clean || /^player$/i.test(clean);
}

async function getAuthUserLabels(supabaseAdmin: any, userIds: string[]) {
  const neededIds = new Set(userIds.filter(Boolean));
  const labels = new Map<string, string>();
  if (neededIds.size === 0) return labels;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw new Error(error.message || "Failed to load auth users.");

    const users = data?.users || [];
    users.forEach((authUser: any) => {
      if (neededIds.has(authUser.id)) {
        labels.set(authUser.id, authUserLabel(authUser));
      }
    });

    if (labels.size >= neededIds.size || users.length < 1000) break;
  }

  return labels;
}

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireUser(req);
    if ("error" in authCheck) return authCheck.error;

    const { supabaseAdmin } = authCheck;
    const { data, error } = await supabaseAdmin
      .from("driver_scores")
      .select("id,user_id,display_name,distance_yards,wind_mph,power,accuracy,created_at")
      .order("distance_yards", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      const message = error.message || "Failed to load driver scores.";
      if (isMissingScoresTable(message)) {
        return NextResponse.json({ ok: true, storage: "local", scores: [] });
      }
      return jsonError(message, 400);
    }

    const rows = data ?? [];
    const authLabels = await getAuthUserLabels(
      supabaseAdmin,
      rows.filter((row: any) => isPlaceholderName(row.display_name)).map((row: any) => row.user_id)
    );

    return NextResponse.json({
      ok: true,
      storage: "supabase",
      scores: rows.map((row: any) => ({
        ...row,
        display_name: isPlaceholderName(row.display_name)
          ? authLabels.get(row.user_id) || row.display_name || "Player"
          : row.display_name,
      })),
    });
  } catch (err: any) {
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireUser(req);
    if ("error" in authCheck) return authCheck.error;

    const { supabaseAdmin, user } = authCheck;
    const body = await req.json().catch(() => ({}));
    const distance = Number(body?.distance_yards);
    const wind = Number(body?.wind_mph);
    const power = Number(body?.power);
    const accuracy = Number(body?.accuracy);

    if (!Number.isFinite(distance) || distance <= 0) {
      return jsonError("distance_yards is required.", 400);
    }

    const displayName = authUserLabel(user);

    const insertRow = {
      user_id: user.id,
      display_name: displayName,
      distance_yards: Math.round(distance),
      wind_mph: Number.isFinite(wind) ? Math.round(wind) : 0,
      power: Number.isFinite(power) ? Math.round(power) : 0,
      accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : 0,
    };

    const { error } = await supabaseAdmin.from("driver_scores").insert(insertRow);

    if (error) {
      const message = error.message || "Failed to save driver score.";
      if (isMissingScoresTable(message)) {
        return NextResponse.json({ ok: true, storage: "local", score: insertRow });
      }
      return jsonError(message, 400);
    }

    return NextResponse.json({ ok: true, storage: "supabase", score: insertRow });
  } catch (err: any) {
    return jsonError(err?.message || "Unexpected error.", 500);
  }
}
