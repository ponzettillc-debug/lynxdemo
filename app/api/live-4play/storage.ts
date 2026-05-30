import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "live-4play";
const STORE_PATH = "tournaments.json";

export type SharedLive4PlayRow = {
  id: string;
  owner_user_id?: string | null;
  created_by?: string | null;
  name: string;
  format: string;
  holes_count: number;
  team_names: string[] | null;
  scores?: unknown;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function isAlreadyExists(message?: string | null) {
  return /already exists|duplicate/i.test(message || "");
}

function isMissingObject(error: unknown) {
  const info = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = String(info.message || info.error || "");
  const statusCode = String(info.statusCode || info.status || "");
  const original = info.originalError && typeof info.originalError === "object"
    ? info.originalError as Record<string, unknown>
    : {};
  const originalStatus = String(original.status || "");
  return (
    statusCode === "404" ||
    originalStatus === "404" ||
    originalStatus === "400" && message === "{}" ||
    /not found|does not exist/i.test(message)
  );
}

function cleanRows(value: unknown): SharedLive4PlayRow[] {
  const rawRows = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).tournaments
    : value;
  if (!Array.isArray(rawRows)) return [];

  return rawRows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      id: String(row.id || ""),
      owner_user_id: row.owner_user_id ? String(row.owner_user_id) : null,
      created_by: row.created_by ? String(row.created_by) : null,
      name: String(row.name || "Live 4Play Match"),
      format: String(row.format || "Points"),
      holes_count: Number(row.holes_count) === 18 ? 18 : 9,
      team_names: Array.isArray(row.team_names) ? row.team_names.map((name) => String(name || "")) : null,
      scores: row.scores,
      status: String(row.status || "live") === "complete" ? "complete" : "live",
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
    }))
    .filter((row) => row.id);
}

function sortRows(rows: SharedLive4PlayRow[]) {
  return [...rows].sort(
    (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
  );
}

async function ensureBucket(supabaseAdmin: SupabaseClient) {
  const { error } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!error) return;

  const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 1024 * 1024,
  });

  if (createError && !isAlreadyExists(createError.message)) {
    throw new Error(`Live 4Play shared storage bucket failed: ${createError.message}`);
  }
}

export async function loadLive4PlayStorage(supabaseAdmin: SupabaseClient) {
  await ensureBucket(supabaseAdmin);

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(STORE_PATH);
  if (error) {
    if (isMissingObject(error)) return [];
    throw new Error(`Live 4Play shared storage load failed: ${error.message}`);
  }

  const text = await data.text();
  if (!text.trim()) return [];
  return sortRows(cleanRows(JSON.parse(text)));
}

export async function saveLive4PlayStorage(supabaseAdmin: SupabaseClient, rows: SharedLive4PlayRow[]) {
  await ensureBucket(supabaseAdmin);

  const body = JSON.stringify({ tournaments: sortRows(rows) }, null, 2);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(STORE_PATH, body, {
    contentType: "application/json",
    upsert: true,
  });

  if (error) throw new Error(`Live 4Play shared storage save failed: ${error.message}`);
  return sortRows(rows);
}
