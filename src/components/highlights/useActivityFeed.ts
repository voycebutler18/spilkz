// src/components/highlights/useActivityFeed.ts
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

export type ActivityKind = "video_post" | "prayer_post";

export type Activity = {
  id: string;               // stable id (highlight id or fallback-synthesized id)
  user_id: string | null;
  kind: ActivityKind;
  created_at: string;
};

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export function useActivityFeed(opts?: { includeKinds?: ActivityKind[]; limit?: number }) {
  const includeKinds = opts?.includeKinds ?? ["video_post", "prayer_post"];
  const limit = opts?.limit ?? 60;

  const [items, setItems] = React.useState<Activity[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, Profile>>({});
  const prevSig = React.useRef<string>("");

  React.useEffect(() => {
    let alive = true;

    async function hydrateProfiles(userIds: string[]) {
      const unknown = userIds.filter((id) => !!id && !profiles[id]);
      if (unknown.length === 0) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", unknown);
      if (!alive || !data) return;
      const map: Record<string, Profile> = {};
      (data as Profile[]).forEach((p) => (map[p.id] = p));
      setProfiles((prev) => ({ ...prev, ...map }));
    }

    async function loadFromHighlights() {
      const { data, error } = await supabase
        .from("site_highlights_active")
        .select("id, user_id, kind, created_at")
        .in("kind", includeKinds as any)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const rows = ((data ?? []) as any[])
        .map((r) => ({
          id: r.id as string,
          user_id: r.user_id ?? null,
          kind: (r.kind || "") as ActivityKind,
          created_at: r.created_at as string,
        }))
        .filter((r) => includeKinds.includes(r.kind));

      const sig = JSON.stringify(rows.map((r) => [r.kind, r.id, r.created_at]));
      if (sig !== prevSig.current) {
        prevSig.current = sig;
        setItems(rows);
        await hydrateProfiles(Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])));
      }
    }

    async function fallbackQuery() {
      const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let videoRows: Activity[] = [];
      try {
        const { data } = await supabase
          .from("videos") // adjust if your table name differs
          .select("id, user_id, created_at")
          .gt("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(limit);
        videoRows =
          (data ?? []).map((v: any) => ({
            id: `video_${v.id}`,
            user_id: v.user_id ?? null,
            kind: "video_post" as ActivityKind,
            created_at: v.created_at as string,
          })) ?? [];
      } catch {}

      let prayerRows: Activity[] = [];
      try {
        const { data } = await supabase
          .from("prayers") // adjust if your table name differs
          .select("id, user_id, created_at")
          .gt("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(limit);
        prayerRows =
          (data ?? []).map((p: any) => ({
            id: `prayer_${p.id}`,
            user_id: p.user_id ?? null,
            kind: "prayer_post" as ActivityKind,
            created_at: p.created_at as string,
          })) ?? [];
      } catch {}

      const rows = [...videoRows, ...prayerRows]
        .filter((r) => includeKinds.includes(r.kind))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);

      const sig = JSON.stringify(rows.map((r) => [r.kind, r.id, r.created_at]));
      if (sig !== prevSig.current) {
        prevSig.current = sig;
        setItems(rows);
        await hydrateProfiles(Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])));
      }
    }

    (async () => {
      try {
        await loadFromHighlights();
      } catch {
        await fallbackQuery();
      }
    })();

    const channel = supabase
      .channel("mobile_activity_rail")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_highlights" }, () => {
        (async () => {
          try {
            await loadFromHighlights();
          } catch {
            await fallbackQuery();
          }
        })();
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [includeKinds.join(","), limit]);

  return { items, profiles };
}

export function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}
