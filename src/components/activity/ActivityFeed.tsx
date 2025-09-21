// src/components/activity/ActivityFeed.tsx
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Image as ImageIcon, Video, FileText, ChevronDown, ChevronUp } from "lucide-react";

/* ---------- Types ---------- */
type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  video_url: string | null;
  thumbnail_url?: string | null;
  mime_type?: string | null;
  created_at: string;
};

type Group = {
  user: Profile;
  items: Splik[];
  mostRecent: string; // ISO
};

/* ---------- Helpers ---------- */
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const minutes = Math.round(diff / (60 * 1000));
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(-days, "day");
}

function isVideo(mime?: string | null) {
  return !!mime && mime.startsWith("video/");
}

/* ---------- UI bits (small) ---------- */
const Avatar: React.FC<{ src?: string | null; name?: string | null; size?: number }> = ({
  src,
  name,
  size = 28,
}) => {
  const w = `${size}px`;
  if (src) {
    return (
      <img
        src={src}
        alt={name || "avatar"}
        className="rounded-full object-cover"
        style={{ width: w, height: w }}
      />
    );
  }
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="rounded-full bg-muted flex items-center justify-center text-xs font-medium"
      style={{ width: w, height: w }}
      aria-label="avatar"
    >
      {letter}
    </div>
  );
};

const Thumb: React.FC<{ item: Splik }> = ({ item }) => {
  const icon =
    item.video_url || isVideo(item.mime_type) ? (
      <Video className="h-4 w-4 shrink-0" />
    ) : item.thumbnail_url ? (
      <ImageIcon className="h-4 w-4 shrink-0" />
    ) : (
      <FileText className="h-4 w-4 shrink-0" />
    );

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
      <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex items-center justify-center">
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt={item.title || "upload"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-muted-foreground">{icon}</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {item.title || (item.video_url ? "Video" : "Upload")}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span className="truncate">{timeAgo(item.created_at)}</span>
        </div>
      </div>
    </div>
  );
};

/* ---------- Main rail ---------- */
export const ActivityFeed: React.FC<{ limit?: number }> = ({ limit = 60 }) => {
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);

        // Pull uploads from last 24h
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await supabase
          .from("spliks")
          .select(
            "id,user_id,title,description,video_url,thumbnail_url,mime_type,created_at"
          )
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) throw error;

        const items = (rows || []) as Splik[];
        const userIds = Array.from(new Set(items.map((r) => r.user_id)));
        let profilesById: Record<string, Profile> = {};

        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,username,display_name,avatar_url")
            .in("id", userIds);

          (profs || []).forEach((p) => {
            profilesById[p.id] = p as Profile;
          });
        }

        // Group by user
        const map = new Map<string, Group>();
        for (const it of items) {
          if (!map.has(it.user_id)) {
            map.set(it.user_id, {
              user: profilesById[it.user_id] || { id: it.user_id, display_name: "User" },
              items: [it],
              mostRecent: it.created_at,
            });
          } else {
            const g = map.get(it.user_id)!;
            g.items.push(it);
            if (new Date(it.created_at) > new Date(g.mostRecent)) g.mostRecent = it.created_at;
          }
        }

        const out = Array.from(map.values()).sort(
          (a, b) => new Date(b.mostRecent).getTime() - new Date(a.mostRecent).getTime()
        );

        setGroups(out);
      } catch (e) {
        console.error("ActivityFeed load error:", e);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [limit]);

  const toggle = (userId: string) => {
    setExpanded((s) => ({ ...s, [userId]: !s[userId] }));
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold">Activities</span>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-2">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">No activity in the last 24 hours</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const name =
              g.user.display_name ||
              g.user.username ||
              (g.user.id ? `User ${g.user.id.slice(0, 6)}` : "User");
            const isOpen = !!expanded[g.user.id];

            return (
              <div
                key={g.user.id}
                className="rounded-xl border border-border bg-card/50 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar src={g.user.avatar_url} name={name} />
                    <div>
                      <div className="text-sm font-medium leading-tight">{name}</div>
                      <div className="text-xs text-muted-foreground">
                        {timeAgo(g.mostRecent)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs rounded-full bg-muted px-2 py-1">
                      {g.items.length} {g.items.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                </div>

                {/* View all uploads toggle */}
                <button
                  onClick={() => toggle(g.user.id)}
                  className={cn(
                    "mt-3 w-full text-left text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                  )}
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <>
                      Hide uploads <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      View all uploads <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>

                {/* Expanded list with real previews */}
                {isOpen && (
                  <div className="mt-3 space-y-2">
                    {g.items.map((it) => (
                      <Thumb key={it.id} item={it} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="text-[11px] text-muted-foreground px-1">
            Activities disappear after 24 hours
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;
