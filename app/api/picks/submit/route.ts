import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  tournamentId: string;
  round: number; // 1-4
  golferIds: string[]; // length 4
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return jsonError("Unauthorized", 401);
    const token = authHeader.slice("Bearer ".length);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const poolName = process.env.NEXT_PUBLIC_POOL_NAME || "LynxDemo";

    // Verify user using anon + token
    const supaAuth = createClient(url, anon, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await supaAuth.auth.getUser(token);
    if (userErr || !userData.user) return jsonError("Unauthorized", 401);
    const userId = userData.user.id;

    const body = (await req.json()) as Body;
    if (!body?.tournamentId) return jsonError("Missing tournamentId");
    if (![1, 2, 3, 4].includes(body.round)) return jsonError("Invalid round");
    if (!Array.isArray(body.golferIds) || body.golferIds.length !== 4) {
      return jsonError("Must submit exactly 4 golferIds");
    }
    // ensure unique golferIds within the 4
    if (new Set(body.golferIds).size !== 4) return jsonError("Duplicate golfers in selection");

    // Admin client for DB reads/writes with full access
    const admin = createClient(url, service, { auth: { persistSession: false } });

    // Load pool
    const { data: pool, error: pErr } = await admin
      .from("pools")
      .select("id,name")
      .eq("name", poolName)
      .maybeSingle();
    if (pErr) return jsonError(pErr.message, 500);
    if (!pool) return jsonError("Pool not found. Run bootstrap first.", 404);

    // Ensure tournament belongs to pool
    const { data: tourn, error: tErr } = await admin
      .from("tournaments")
      .select("id,pool_id,round1_lock,round2_lock,round3_lock,round4_lock")
      .eq("id", body.tournamentId)
      .eq("pool_id", pool.id)
      .maybeSingle();
    if (tErr) return jsonError(tErr.message, 500);
    if (!tourn) return jsonError("Tournament not found in this pool", 404);

    // Round lock enforcement
    const lockField = `round${body.round}_lock` as const;
    const lockVal = tourn[lockField] as string | null;
    if (lockVal) {
      const lockTime = new Date(lockVal).getTime();
      const now = Date.now();
      if (now >= lockTime) return jsonError(`Round ${body.round} is locked`, 409);
    }

    // Validate golferIds belong to this pool
    const { data: golferRows, error: gErr } = await admin
      .from("golfers")
      .select("id")
      .eq("pool_id", pool.id)
      .in("id", body.golferIds);
    if (gErr) return jsonError(gErr.message, 500);
    if ((golferRows?.length ?? 0) !== 4) return jsonError("One or more golferIds invalid for this pool", 400);

    // Burn rule: golfer cannot have been used by this user earlier in tournament (other rounds)
    const { data: existing, error: eErr } = await admin
      .from("picks")
      .select("round,golfer_id")
      .eq("pool_id", pool.id)
      .eq("user_id", userId)
      .eq("tournament_id", body.tournamentId);
    if (eErr) return jsonError(eErr.message, 500);

    const usedElsewhere = new Set(
      (existing ?? [])
        .filter((p: any) => p.round !== body.round) // allow editing same round
        .map((p: any) => p.golfer_id)
    );

    const reused = body.golferIds.find((id) => usedElsewhere.has(id));
    if (reused) return jsonError("Burn rule: golfer already used in another round", 409);

    // Editable-until-lock behavior:
    // Replace picks for that user/tournament/round in one go
    const { error: delErr } = await admin
      .from("picks")
      .delete()
      .eq("pool_id", pool.id)
      .eq("user_id", userId)
      .eq("tournament_id", body.tournamentId)
      .eq("round", body.round);
    if (delErr) return jsonError(delErr.message, 500);

    const inserts = body.golferIds.map((golferId) => ({
      pool_id: pool.id,
      user_id: userId,
      tournament_id: body.tournamentId,
      round: body.round,
      golfer_id: golferId,
    }));

    const { error: insErr } = await admin.from("picks").insert(inserts);
    if (insErr) return jsonError(insErr.message, 500);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}