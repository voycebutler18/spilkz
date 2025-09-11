// src/lib/prayers.ts
import { supabase } from "@/integrations/supabase/client";

/* ---------- Types ---------- */
export type PrayerType = "request" | "testimony" | "quote";

export type Prayer = {
  id: string;
  author: string;           // required for ownership checks
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
  prayer_id?: string;
  author?: string;
  body: string;
  created_at: string;
};

/* ---------- Column list used in selects ---------- */
const PRAYER_COLUMNS =
  "id, author, type, body, tags, amen_count, reply_count, answered, created_at";

/* ---------- Create ---------- */
export async function createPrayer(type: PrayerType, body: string): Promise<Prayer> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");

  const { data, error } = await supabase
    .from("prayers")
    .insert({ author: user.id, type, body: body.trim() })
    .select(PRAYER_COLUMNS)
    .single();

  if (error) throw error;
  return data as Prayer;
}

/* ---------- List (paged, newest first) ---------- */
export async function fetchPrayers({
  cursor,
  limit = 20,
}: { cursor?: string; limit?: number }): Promise<Prayer[]> {
  let q = supabase
    .from("prayers")
    .select(PRAYER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Prayer[];
}

/* ---------- Single by id (for detail page) ---------- */
export async function fetchPrayer(id: string): Promise<Prayer | null> {
  const { data, error } = await supabase
    .from("prayers")
    .select(PRAYER_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as Prayer) ?? null;
}

/* ---------- Amen (duplicate-safe) ---------- */
export async function amenPrayer(
  prayerId: string
): Promise<{ inserted: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authed");

  // First check if user already amened this prayer
  const { data: existing } = await supabase
    .from("prayer_amens")
    .select("id")
    .eq("prayer_id", prayerId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    // Already amened
    return { inserted: false };
  }

  // Insert new amen
  const { data, error } = await supabase
    .from("prayer_amens")
    .insert({ prayer_id: prayerId, user_id: user.id })
    .select("id");

  if (error) throw error;
  return { inserted: true };
}

/* ---------- Check if user has amened a prayer ---------- */
export async function hasUserAmened(prayerId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("prayer_amens")
    .select("id")
    .eq("prayer_id", prayerId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error checking amen status:", error);
    return false;
  }

  return !!data;
}

/* ---------- Replies ---------- */
export async function fetchReplies(prayerId: string): Promise<PrayerReply[]> {
  const { data, error } = await supabase
    .from("prayer_replies")
    .select("id, prayer_id, author, body, created_at")
    .eq("prayer_id", prayerId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as PrayerReply[];
}

export async function createReply(prayerId: string, body: string): Promise<PrayerReply> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");

  const { data, error } = await supabase
    .from("prayer_replies")
    .insert({ prayer_id: prayerId, author: user.id, body: body.trim() })
    .select("id, prayer_id, author, body, created_at")
    .single();

  if (error) throw error;
  return data as PrayerReply;
}

/* ---------- Delete (owner only; enforced by RLS) ---------- */
export async function deletePrayer(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");

  const { error } = await supabase.from("prayers").delete().eq("id", id);
  if (error) throw error;
}
