// src/components/RightActivityRail.tsx
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type ActivityKind = "photo" | "video" | "quote";

type Activity = {
  id: string;
  user_id: string | null;
  kind: ActivityKind;
  created_at: string;
  media_url?: string | null;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type Group = {
  user_id: string | null;
  latest_at: string;
  counts: Partial<Record<ActivityKind, number>>;
  items: Activity[];
};

const TIME_WINDOW_HOURS = 24;

/** helpers */
function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}

const bestName = (p?: Profile) =>
  (p?.username && p.username.trim()) ||
  (p?.display_name && p.display_name.trim()) ||
  (p?.id ? `user_${p.id.slice(0, 6)}` : "User");

const profileSlug = (p?: Profile) =>
  (p?.username && p.username.trim()) || p?.id || "";

const looksLikeImageUrl = (u?: string | null) =>
  !!u && /\.(jpe?g|png|gif|webp)$/i.test(u);

export default function RightActivityRail({ limit = 60 }: { limit?: number }) {
  const navigate = useNavigate();

  const [groups, setGroups] = React.useState<Group[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, Profile>>({});
  const sigRef = React.useRef("");

  React.useEffect(() => {
    let alive = true;
    const sinceISO = new Date(Date.now() - TIME_WINDOW_HOURS * 3600 * 1000).toISOString();

    const hydrateProfiles = async (userIds: string[]) => {
      const missing = userIds.filter((id) => id && !profiles[id]);
      if (!missing.length) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", missing);
      if (!alive || !data) return;
      const map: Record<string, Profile> = {};
      (data as Profile[]).forEach((p) => (map[p.id] = p));
      setProfiles((prev) => ({ ...prev, ...map }));
    };

    const groupRows = (rows: Activity[]): Group[] => {
      const filtered = rows.filter(
        (r) => new Date(r.created_at).toISOString() >= sinceISO
      );
      const byUser = new Map<string, Group>();
      filtered.forEach((r) => {
        const key = r.user_id ?? "__null";
        const g =
          byUser.get(key) ||
          {
            user_id: r.user_id ?? null,
            latest_at: r.created_at,
            counts: {},
            items: [],
          };
        g.items.push(r);
        g.counts[r.kind] = (g.counts[r.kind] || 0) + 1;
        if (r.created_at > g.latest_at) g.latest_at = r.created_at;
        byUser.set(key, g);
      });
      return Array.from(byUser.values())
        .sort((a, b) => b.latest_at.localeCompare(a.latest_at))
        .slice(0, 60);
    };

    const load = async () => {
      const { data, error } = await supabase
        .from("right_rail_feed")
        .select("id, user_id, created_at, type, media_url")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const rows: Activity[] = (data || []).map((r: any) => {
        const incoming: ActivityKind = (r.type as ActivityKind) || "photo";
        const kind: ActivityKind = looksLikeImageUrl(r.media_url) ? "photo" : incoming;
        return {
          id: String(r.id),
          user_id: r.user_id ?? null,
          kind,
          created_at: r.created_at as string,
          media_url: r.media_url ?? null,
        };
      });

      const sig = JSON.stringify(rows.map((r) => [r.user_id, r.kind, r.id]));
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        const grouped = groupRows(rows);
        setGroups(grouped);
        await hydrateProfiles(
          Array.from(new Set(grouped.map((g) => g.user_id).filter(Boolean) as string[]))
        );
      }
    };

    load().catch(() => {});

    const ch = supabase
      .channel("right-rail-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "right_rail_feed" }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "right_rail_feed" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "right_rail_feed" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vibe_photos" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "vibe_photos" }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "vibe_photos" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "spliks" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quotes" }, load)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [limit, profiles]);

  const summaryText = (g: Group) => {
    const parts: string[] = [];
    const add = (n: number | undefined, word: string) => {
      if (n && n > 0) parts.push(`${n} ${word}${n > 1 ? "s" : ""}`);
    };
    add(g.counts.photo, "photo");
    add(g.counts.video, "video");
    add(g.counts.quote, "prayer");
    return parts.join(" · ") || "activity";
  };

  return (
    <div className="bg-gray-900 text-white p-4 w-80 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Activity</h3>
        <span className="text-sm text-gray-400">{groups.length}</span>
      </div>

      <div className="space-y-4">
        {groups.length === 0 && (
          <p className="text-sm text-gray-400">
            New videos, photos, and Daily Prayers from the last 24h will show up here.
          </p>
        )}

        {groups.map((g) => {
          const prof = g.user_id ? profiles[g.user_id] : undefined;
          const name = bestName(prof);
          const avatar = prof?.avatar_url || null;
          
          // Get the most recent item with media for preview
          const latestItemWithMedia = g.items
            .filter(item => item.media_url)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

          return (
            <button
              key={`${g.user_id ?? "null"}_${g.latest_at}`}
              className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 transition text-left rounded-lg"
              onClick={() => {
                if (g.user_id) {
                  navigate(`/creator/${profileSlug(prof) || g.user_id}`);
                }
              }}
            >
              {/* User Avatar */}
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 shrink-0">
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-white font-semibold text-sm">
                    {name[0]?.toUpperCase() || "U"}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white">
                  <span className="font-semibold">{name}</span>{" "}
                  <span className="text-gray-300">had {summaryText(g)}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {timeAgo(new Date(g.latest_at).getTime())}
                </div>
              </div>

              {/* Media Preview */}
              {latestItemWithMedia && latestItemWithMedia.media_url && (
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-800 shrink-0">
                  {latestItemWithMedia.kind === "video" ? (
                    <video 
                      src={latestItemWithMedia.media_url} 
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    <img 
                      src={latestItemWithMedia.media_url} 
                      alt="" 
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
