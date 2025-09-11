// src/lib/prayers.ts
import { supabase } from "@/integrations/supabase/client";

export type PrayerType = "request" | "testimony" | "quote";

export type Prayer = {
  id: string;
  author: string;                 // <— REQUIRED for ownership checks
  type: PrayerType;
  body: string;
  tags: string[] | null;
  amen_count: number;
  reply_count: number;
  answered: boolean;
  created_at: string;
};

// Create
export async function createPrayer(type: PrayerType, body: string): Promise<Prayer> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");

  const { data, error } = await supabase
    .from("prayers")
    .insert({
      author: user.id,            // <— make sure author is set
      type,
      body: body.trim(),
    })
    .select("id, author, type, body, tags, amen_count, reply_count, answered, created_at")
    .single();

  if (error) throw error;
  return data as Prayer;
}

// List (paged by created_at desc)
export async function fetchPrayers({ cursor }: { cursor?: string }): Promise<Prayer[]> {
  let q = supabase
    .from("prayers")
    .select("id, author, type, body, tags, amen_count, reply_count, answered, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Prayer[];
}

// Amen (optional, you already have this)
export async function amenPrayer(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");
  const { error } = await supabase.from("prayer_amens").insert({ prayer_id: id, user_id: user.id });
  if (error) throw error;
}

// Replies (optional, you already have these)
export async function fetchReplies(prayerId: string) {
  const { data, error } = await supabase
    .from("prayer_replies")
    .select("id, body, created_at")
    .eq("prayer_id", prayerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createReply(prayerId: string, body: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");
  const { data, error } = await supabase
    .from("prayer_replies")
    .insert({ prayer_id: prayerId, author: user.id, body: body.trim() })
    .select("id, body, created_at")
    .single();
  if (error) throw error;
  return data;
}

// DELETE (owner only – enforced by RLS)
export async function deletePrayer(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");
  const { error } = await supabase.from("prayers").delete().eq("id", id);
  if (error) throw error;
}
