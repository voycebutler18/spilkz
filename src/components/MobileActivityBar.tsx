// src/components/MobileActivityBar.tsx
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

// --- helpers ---------------------------------------------------------------
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

// --- component -------------------------------------------------------------
export default function MobileActivityBar({ limit = 60 }: { limit?: number }) {
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

      const rows: Activity[] = (data || []).map((r: any) => ({
        id: String(r.id),
        user_id: r.user_id ?? null,
        kind: (r.type as ActivityKind) || "photo",
        created_at: r.created_at as string,
        media_url: r.media_url ?? null,
      }));

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

    // realtime, same as desktop rail
    const ch = supabase
      .channel("mobile-activity-bar")
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
  }, [limit]);

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

  // show the most recent creator (1 row), like your screenshot
  const top = groups[0];
  const prof = top?.user_id ? profiles[top.user_id] : undefined;
  const name = prof ? bestName(prof) : "Someone";

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">Activity</h3>
        <button
          className="text-xs text-indigo-300 hover:underline"
          onClick={() => {
            if (top?.user_id) {
              const p = profiles[top.user_id];
              const slug = profileSlug(p) || top.user_id;
              navigate(`/creator/${slug}`);
            }
          }}
        >
          See all
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">
          Nothing new in the last 24h
        </p>
      ) : (
        <button
          className="mt-3 w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5 transition text-left"
          onClick={() => {
            if (top?.user_id) {
              const p = profiles[top.user_id];
              const slug = profileSlug(p) || top.user_id;
              navigate(`/creator/${slug}`);
            }
          }}
        >
          <span className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-fuchsia-500 to-indigo-500 ring-2 ring-neutral-800 shrink-0">
            {prof?.avatar_url ? (
              <img src={prof.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-white font-semibold">
                {name[0]?.toUpperCase() || "U"}
              </span>
            )}
          </span>

          <div className="min-w-0">
            <div className="text-sm text-neutral-100 truncate">
              <span className="font-semibold">{name}</span>{" "}
              <span className="text-neutral-300">had {summaryText(top)}</span>
            </div>
            <div className="text-[12px] text-neutral-500">
              {timeAgo(new Date(top.latest_at).getTime())}
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
