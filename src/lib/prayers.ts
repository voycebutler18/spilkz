import { supabase } from "@/integrations/supabase/client";

export type PrayerType = "request" | "testimony" | "quote";

export type Prayer = {
  id: string;
  author: string;
  type: PrayerType;
  body: string;
  tags: string[] | null;
  amen_count: number;
  reply_count: number;
  answered: boolean;
  created_at: string;
};

export async function createPrayer(type: PrayerType, body: string, tags: string[] = []) {
  if (body.length < 1 || body.length > 5000) throw new Error("Body must be 1–5000 chars");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");
  const { data, error } = await supabase.from("prayers")
    .insert({ author: user.id, type, body, tags })
    .select()
    .single();
  if (error) throw error;
  return data as Prayer;
}

export async function fetchPrayers(opts: { cursor?: string; tag?: string; q?: string } = {}) {
  let query = supabase
    .from("prayers")
    .select("id, author, type, body, tags, amen_count, reply_count, answered, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (opts.cursor) query = query.lt("created_at", opts.cursor);
  if (opts.tag) query = query.contains("tags", [opts.tag]);

  if (opts.q && opts.q.trim()) {
    // simple search: prefer full text if you want; fallback to ilike
    query = supabase
      .from("prayers")
      .select("id, author, type, body, tags, amen_count, reply_count, answered, created_at")
      .textSearch("tsv", opts.q, { type: "websearch" })
      .order("created_at", { ascending: false })
      .limit(20);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Prayer[];
}

export async function fetchPrayer(id: string) {
  const { data, error } = await supabase.from("prayers")
    .select("id, author, type, body, tags, amen_count, reply_count, answered, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Prayer | null;
}

export async function amenPrayer(prayerId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");
  const { error } = await supabase.from("prayer_amens").insert({ prayer_id: prayerId, user_id: user.id });
  if (error && !`${error.message}`.toLowerCase().includes("duplicate")) throw error;
}

export async function createReply(prayerId: string, body: string) {
  if (body.length < 1 || body.length > 1000) throw new Error("Reply must be 1–1000 chars");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");
  const { data, error } = await supabase.from("prayer_replies")
    .insert({ prayer_id: prayerId, author: user.id, body })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchReplies(prayerId: string) {
  const { data, error } = await supabase.from("prayer_replies")
    .select("id, body, author, created_at")
    .eq("prayer_id", prayerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function toggleAnswered(prayerId: string, answered: boolean) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");
  const { error } = await supabase.from("prayers")
    .update({ answered })
    .eq("id", prayerId);
  if (error) throw error;
}
