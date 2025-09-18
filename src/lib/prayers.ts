// src/lib/prayers.ts
import { supabase } from "@/integrations/supabase/client";

/* ---------- Types ---------- */
export type PrayerType = "request" | "testimony" | "quote";

export type Prayer = {
  id: string;
  author: string; // required for ownership checks
  type: PrayerType;
  body: string;
  tags: string[] | null;
  amen_count: number;
  reply_count: number;
  answered: boolean;
  created_at: string;
  // Optional media fields
  video_url?: string | null;
  thumbnail_url?: string | null;
  trim_start?: number | null;
  trim_end?: number | null;
  mime_type?: string | null;
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
  "id, author, type, body, tags, amen_count, reply_count, answered, created_at, video_url, thumbnail_url, trim_start, trim_end, mime_type";

/* ---------- Create ---------- */
export async function createPrayer(
  type: PrayerType,
  body: string,
  media?: {
    video_url?: string;
    thumbnail_url?: string;
    trim_start?: number;
    trim_end?: number;
    mime_type?: string;
  }
): Promise<Prayer> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");

  const insertData = {
    author: user.id,
    type,
    body: body.trim(),
    ...media,
  };

  const { data, error } = await supabase
    .from("prayers")
    .insert(insertData)
    .select(PRAYER_COLUMNS)
    .single();

  if (error) throw error;
  return data as Prayer;
}

/* ---------- List (paged, newest first) ---------- */
/**
 * Returns a mixed feed:
 *  - rows from `prayers`
 *  - rows from `spliks` where `is_prayer = true`
 * Both are mapped to the `Prayer` shape, sorted by created_at desc.
 */
export async function fetchPrayers({
  cursor,
  limit = 20,
}: { cursor?: string; limit?: number }): Promise<Prayer[]> {
  const page = Math.min(Math.max(limit, 1), 50);

  // 1) Prayers authored via PrayerComposer
  let q1 = supabase
    .from("prayers")
    .select(PRAYER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(page);

  if (cursor) q1 = q1.lt("created_at", cursor);

  // 2) Splik uploads marked as Prayer posts
  //    NOTE: requires `is_prayer boolean` column on `spliks`
  let q2 = supabase
    .from("spliks")
    .select(`
      id,
      user_id,
      title,
      description,
      created_at,
      video_url,
      thumbnail_url,
      trim_start,
      trim_end,
      mime_type
    `)
    .eq("is_prayer", true)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(page);

  if (cursor) q2 = q2.lt("created_at", cursor);

  const [{ data: a, error: e1 }, { data: b, error: e2 }] = await Promise.all([q1, q2]);
  if (e1) throw e1;
  if (e2) throw e2;

  const prayersA = (a || []) as Prayer[];

  // Map spliks → Prayer
  const prayersB: Prayer[] = (b || []).map((r: any) => ({
    id: r.id,
    author: r.user_id,
    type: "request",                      // default; adjust if you later store a type on spliks
    body: r.description || r.title || "",
    tags: null,
    amen_count: 0,
    reply_count: 0,
    answered: false,
    created_at: r.created_at,
    video_url: r.video_url ?? null,
    thumbnail_url: r.thumbnail_url ?? null,
    trim_start: r.trim_start ?? null,
    trim_end: r.trim_end ?? null,
    mime_type: r.mime_type ?? null,
  }));

  // Merge, sort, and page
  const merged = [...prayersA, ...prayersB]
    .sort((x, y) => (y.created_at > x.created_at ? 1 : -1))
    .slice(0, page);

  return merged;
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

/* ---------- Media Upload Helper ---------- */
export async function uploadPrayerMedia(file: File): Promise<{ url: string; thumbnailUrl?: string }> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random()}.${fileExt}`;
  const filePath = `prayers/${fileName}`;

  // Upload main file
  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('media')
    .getPublicUrl(filePath);

  let thumbnailUrl = publicUrl;

  // For videos, create thumbnail
  if (file.type.startsWith('video/')) {
    try {
      const video = document.createElement('video');
      video.src = publicUrl;
      video.currentTime = 1; // Capture at 1 second

      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);

      const thumbnailBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
      });

      const thumbFileName = `prayers/thumb_${fileName.replace(/\.[^/.]+$/, '.jpg')}`;
      const { error: thumbError } = await supabase.storage
        .from('media')
        .upload(thumbFileName, thumbnailBlob);

      if (!thumbError) {
        const { data: { publicUrl: thumbUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(thumbFileName);
        thumbnailUrl = thumbUrl;
      }
    } catch (error) {
      console.warn('Thumbnail generation failed:', error);
    }
  }

  return { url: publicUrl, thumbnailUrl };
}

/* ---------- Amen (duplicate-safe; returns server count) ---------- */
/** Returns:
 *  - inserted: was a new amen created for (prayer_id, user_id)?
 *  - count: authoritative amen count from DB after upsert
 */
export async function amenPrayer(
  prayerId: string
): Promise<{ inserted: boolean; count: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authed");

  // Upsert with composite PK (prayer_id, user_id). No "id" column involved.
  const { data: upsertData, error: upsertErr } = await supabase
    .from("prayer_amens")
    .upsert(
      { prayer_id: prayerId, user_id: user.id },
      { onConflict: "prayer_id,user_id", ignoreDuplicates: true }
    )
    .select("prayer_id, user_id");

  if (upsertErr) throw upsertErr;

  // If the row already existed, upsert returns [] (ignored); if new, returns 1 row
  const inserted = Array.isArray(upsertData) && upsertData.length > 0;

  // Read back the server-side count so UI can't drift
  const { count, error: countErr } = await supabase
    .from("prayer_amens")
    .select("prayer_id", { count: "exact", head: true })
    .eq("prayer_id", prayerId);

  if (countErr) throw countErr;

  return { inserted, count: count ?? 0 };
}

/* ---------- Check if user has amened a prayer ---------- */
export async function hasUserAmened(prayerId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("prayer_amens")
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
