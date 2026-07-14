import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isUsOpen2026TournamentName } from "../../lib/usOpen2026";
import { getUsOpen2026Cut, normalizeCutPlayerName } from "../../lib/usOpen2026Cut.server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isMissingRosterTable(error: any) {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("tournament_golfers");
}

function fmtRelativeScore(score: number) {
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : String(score);
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
  return { user, supabaseAdmin };
}

export async function GET(req: NextRequest) {
  try {
    const check = await requireUser(req);
    if ("error" in check) return check.error;

    const { searchParams } = new URL(req.url);
    const poolId = searchParams.get("pool_id") || "";
    const tournamentId = searchParams.get("tournament_id") || "";

    if (!poolId || !tournamentId) {
      return jsonError("pool_id and tournament_id are required.", 400);
    }

    const { data: membership, error: membershipError } = await check.supabaseAdmin
      .from("pool_members")
      .select("pool_id")
      .eq("pool_id", poolId)
      .eq("user_id", check.user.id)
      .maybeSingle();

    if (membershipError) return jsonError(`Failed to verify pool membership: ${membershipError.message}`, 400);
    if (!membership) return jsonError("You are not a member of this pool.", 403);

    const { data: tournament, error: tournamentError } = await check.supabaseAdmin
      .from("tournaments")
      .select("id,name")
      .eq("pool_id", poolId)
      .eq("id", tournamentId)
      .maybeSingle();
    if (tournamentError) return jsonError(`Failed to load tournament: ${tournamentError.message}`, 400);
    if (!tournament) return jsonError("Tournament was not found.", 404);

    const { data: rosterRows, error: rosterError } = await check.supabaseAdmin
      .from("tournament_golfers")
      .select("golfer_id")
      .eq("pool_id", poolId)
      .eq("tournament_id", tournamentId)
      .eq("active", true);

    if (rosterError && !isMissingRosterTable(rosterError)) {
      return jsonError(`Failed to load tournament roster: ${rosterError.message}`, 400);
    }

    const rosterIds = new Set((rosterRows ?? []).map((row: any) => String(row.golfer_id)));
    let query = check.supabaseAdmin
      .from("golfers")
      .select("id,name")
      .eq("pool_id", poolId)
      .order("name", { ascending: true });

    if (rosterIds.size > 0) {
      query = query.in("id", Array.from(rosterIds));
    }

    const { data: golfers, error: golfersError } = await query;
    if (golfersError) return jsonError(`Failed to load golfers: ${golfersError.message}`, 400);

    let cutLine: number | null = null;
    let cutEstablished = false;
    let cutNames = new Set<string>();
    let scoreByName = new Map<string, string>();
    if (isUsOpen2026TournamentName(tournament.name)) {
      const cut = await getUsOpen2026Cut();
      cutLine = cut.cutLine;
      cutEstablished = cut.established;
      cutNames = cut.cutNames;
      scoreByName = cut.scoreByName;
    }

    const scoreByGolferId = new Map<string, number>();
    if (rosterIds.size > 0) {
      const { data: scores, error: scoresError } = await check.supabaseAdmin
        .from("scores")
        .select("golfer_id,strokes")
        .eq("pool_id", poolId)
        .eq("tournament_id", tournamentId)
        .in("golfer_id", Array.from(rosterIds));

      if (scoresError) return jsonError(`Failed to load tournament scores: ${scoresError.message}`, 400);

      (scores ?? []).forEach((score: any) => {
        const golferId = String(score.golfer_id || "");
        const strokes = Number(score.strokes);
        if (!golferId || !Number.isFinite(strokes)) return;
        scoreByGolferId.set(golferId, (scoreByGolferId.get(golferId) ?? 0) + strokes);
      });
    }

    const golfersWithCutStatus = (golfers ?? []).map((golfer: any) => ({
      ...golfer,
      missed_cut: cutNames.has(normalizeCutPlayerName(golfer.name)),
      tournament_score:
        scoreByGolferId.has(String(golfer.id))
          ? fmtRelativeScore(scoreByGolferId.get(String(golfer.id)) ?? 0)
          : scoreByName.get(normalizeCutPlayerName(golfer.name)) ?? null,
    }));

    return NextResponse.json({
      ok: true,
      golfers: golfersWithCutStatus,
      cutLine,
      cutEstablished,
      rostered: rosterIds.size > 0,
      fallback: rosterIds.size === 0,
    });
  } catch (err: any) {
    return jsonError(err?.message || "Server error.", 500);
  }
}
