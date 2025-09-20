// src/lib/prayers.ts
import { supabase } from "@/integrations/supabase/client";

/* ----------------------------- Types ----------------------------- */

export type PrayerType = "request" | "testimony" | "quote";

export type Prayer = {
  id: string;
  author: string; // user id (auth.users.id)
  type: PrayerType;
  body: string;
  tags: string[] | null;
  amen_count: number;
  reply_count: number;
  answered: boolean;
  created_at: string;
};

export type PrayerReply = {
  id: string;
  prayer_id: string;
  author: string;
  body: string;
  created_at: string;
};

/* ----------------------------- Config ---------------------------- */

const TABLE_PRAYERS = "prayers";
const TABLE_AMENS = "prayer_amens";
const TABLE_REPLIES = "prayer_replies";

const PRAYER_COLUMNS =
  "id, author, type, body, tags, amen_count, reply_count, answered, created_at";

/* ---------------------------- Utilities -------------------------- */

function assertType(t: string): PrayerType {
  const v = t.trim().toLowerCase();
  if (v === "request" || v === "testimony" || v === "quote") return v;
  return "request"; // safe default
}

function normTags(tags?: string[] | null): string[] | null {
  if (!tags || !Array.isArray(tags)) return null;
  const cleaned = tags
    .map((s) => (s ?? "").toString().trim())
    .filter(Boolean)
    .slice(0, 20);
  return cleaned.length ? cleaned : null;
}

/* ----------------------------- Create ---------------------------- */

export async function createPrayer(
  type: PrayerType | string,
  body: string,
  opts?: { tags?: string[]; answered?: boolean }
): Promise<Prayer> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");

  const payload = {
    author: user.id,
    type: assertType(type),
    body: (body ?? "").trim(),
    tags: normTags(opts?.tags),
    answered: !!opts?.answered,
  };

  const { data, error } = await supabase
    .from(TABLE_PRAYERS)
    .insert(payload)
    .select(PRAYER_COLUMNS)
    .single();

  if (error) throw error;
  return data as Prayer;
}

/* ----------------------------- List ------------------------------ */

export async function fetchPrayers(params: {
  cursor?: string;
  limit?: number;
}): Promise<Prayer[]> {
  const { cursor, limit = 20 } = params ?? {};

  let q = supabase
    .from(TABLE_PRAYERS)
    .select(PRAYER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) throw error;

  // Normalize shape (avoid undefined anywhere)
  return (data || []).map((p: any) => ({
    id: String(p.id),
    author: String(p.author),
    type: assertType(p.type || "request"),
    body: p.body ?? "",
    tags: Array.isArray(p.tags) ? p.tags : null,
    amen_count: Number.isFinite(p.amen_count) ? p.amen_count : 0,
    reply_count: Number.isFinite(p.reply_count) ? p.reply_count : 0,
    answered: !!p.answered,
    created_at: p.created_at,
  })) as Prayer[];
}

/* --------------------------- Single By ID ------------------------ */

export async function fetchPrayer(id: string): Promise<Prayer | null> {
  const { data, error } = await supabase
    .from(TABLE_PRAYERS)
    .select(PRAYER_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String(data.id),
    author: String(data.author),
    type: assertType(data.type || "request"),
    body: data.body ?? "",
    tags: Array.isArray(data.tags) ? data.tags : null,
    amen_count: Number.isFinite(data.amen_count) ? data.amen_count : 0,
    reply_count: Number.isFinite(data.reply_count) ? data.reply_count : 0,
    answered: !!data.answered,
    created_at: data.created_at,
  } as Prayer;
}

/* ------------------------------ Amen ----------------------------- */
/**
 * Upserts (prayer_id, user_id) in prayer_amens.
 * Returns whether a new row was inserted and the authoritative count.
 */
export async function amenPrayer(
  prayerId: string
): Promise<{ inserted: boolean; count: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authed");

  const { data: upsertData, error: upsertErr } = await supabase
    .from(TABLE_AMENS)
    .upsert(
      { prayer_id: prayerId, user_id: user.id },
      { onConflict: "prayer_id,user_id", ignoreDuplicates: true }
    )
    .select("prayer_id, user_id"); // only fields that exist

  if (upsertErr) throw upsertErr;

  const inserted = Array.isArray(upsertData) && upsertData.length > 0;

  const { count, error: countErr } = await supabase
    .from(TABLE_AMENS)
    .select("prayer_id", { head: true, count: "exact" })
    .eq("prayer_id", prayerId);

  if (countErr) throw countErr;

  return { inserted, count: count ?? 0 };
}

export async function hasUserAmened(prayerId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from(TABLE_AMENS)
    .select("prayer_id")
    .eq("prayer_id", prayerId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error checking amen status:", error);
    return false;
  }
  return !!data;
}

/* ------------------------------ Replies -------------------------- */

export async function fetchReplies(prayerId: string): Promise<PrayerReply[]> {
  const { data, error } = await supabase
    .from(TABLE_REPLIES)
    .select("id, prayer_id, author, body, created_at")
    .eq("prayer_id", prayerId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((r: any) => ({
    id: String(r.id),
    prayer_id: String(r.prayer_id),
    author: String(r.author),
    body: r.body ?? "",
    created_at: r.created_at,
  })) as PrayerReply[];
}

export async function createReply(
  prayerId: string,
  body: string
): Promise<PrayerReply> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");

  const { data, error } = await supabase
    .from(TABLE_REPLIES)
    .insert({
      prayer_id: prayerId,
      author: user.id,
      body: (body ?? "").trim(),
    })
    .select("id, prayer_id, author, body, created_at")
    .single();

  if (error) throw error;

  return {
    id: String(data.id),
    prayer_id: String(data.prayer_id),
    author: String(data.author),
    body: data.body ?? "",
    created_at: data.created_at,
  } as PrayerReply;
}

/* ------------------------------ Delete --------------------------- */

export async function deletePrayer(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");

  const { error } = await supabase.from(TABLE_PRAYERS).delete().eq("id", id);
  if (error) throw error;
}
