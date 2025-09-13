// src/components/RightActivityRail.tsx
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/* ───────────────────────────────────────────────
   Types
─────────────────────────────────────────────── */
type ActivityKind = "video_post" | "prayer_post" | "photo_post";

type Activity = {
  id: string;               // highlight id or row id
  user_id: string | null;
  kind: ActivityKind;
  created_at: string;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url: string | null;
};

type Grouped = {
  user_id: string | null;
  latest_at: string;               // newest activity time
  counts: Partial<Record<ActivityKind, number>>;
  items: Activity[];               // last 24h items for modal
};

/* ───────────────────────────────────────────────
   Helpers
─────────────────────────────────────────────── */
const TIME_WINDOW_HOURS = 24;

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}

const bestName = (p?: Profile) => {
  const u = p?.username?.trim();
  const d = p?.display_name?.trim();
  const f = p?.first_name?.trim();
  const l = p?.last_name?.trim();
  if (u) return u;
  if (d) return d;
  const full = [f, l].filter(Boolean).join(" ").trim();
  if (full) return full;
  return p?.id ? `user_${p.id.slice(0, 6)}` : "User";
};

const profileSlug = (p?: Profile) =>
  (p?.username && p.username.trim()) || p?.id || "";

/* ───────────────────────────────────────────────
   Component
─────────────────────────────────────────────── */
export default function RightActivityRail({
  includeKinds = ["video_post", "prayer_post", "photo_post"],
  limit = 200, // fetch enough to group well
}: {
  includeKinds?: ActivityKind[];
  limit?: number;
}) {
  const navigate = useNavigate();

  const [groups, setGroups] = React.useState<Grouped[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, Profile>>({});
  const [userId, setUserId] = React.useState<string | null>(null);

  // Modal state
  const [open, setOpen] = React.useState(false);
  const [activeGroup, setActiveGroup] = React.useState<Grouped | null>(null);

  // track previous payload to avoid flicker
  const prevSig = React.useRef<string>("");

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUserId(session?.user?.id ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  React.useEffect(() => {
    let alive = true;

    const sinceISO = new Date(
      Date.now() - TIME_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString();

    async function hydrateProfiles(userIds: string[]) {
      const unknown = userIds.filter((id) => !!id && !profiles[id]);
      if (unknown.length === 0) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, first_name, last_name, avatar_url")
        .in("id", unknown);
      if (!alive || !data) return;
      const map: Record<string, Profile> = {};
      (data as Profile[]).forEach((p) => (map[p.id] = p));
      setProfiles((prev) => ({ ...prev, ...map }));
    }

    function groupByUser(rows: Activity[]): Grouped[] {
      // keep only last 24h
      const filtered = rows.filter(
        (r) => new Date(r.created_at).toISOString() >= sinceISO
      );

      const byUser = new Map<string | null, Grouped>();
      filtered.forEach((r) => {
        const key = r.user_id ?? "__null";
        const g = byUser.get(key) ?? {
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

      const arr = Array.from(byUser.values())
        .sort((a, b) => b.latest_at.localeCompare(a.latest_at))
        .slice(0, 60); // show up to 60 creators

      return arr;
    }

    async function loadFromHighlights(): Promise<Activity[]> {
      const { data, error } = await supabase
        .from("site_highlights_active")
        .select("id, user_id, kind, created_at")
        .gt("created_at", sinceISO) // keep window small server-side
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

      return rows;
    }

    // Fallback if highlights or kinds not available
    async function fallbackQuery(): Promise<Activity[]> {
      let rows: Activity[] = [];

      // photos
      try {
        const { data } = await supabase
          .from("vibe_photos")
          .select("id, user_id, created_at")
          .gt("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(limit);
        const photoRows =
          (data ?? []).map((p: any) => ({
            id: `photo_${p.id}`,
            user_id: p.user_id ?? null,
            kind: "photo_post" as ActivityKind,
            created_at: p.created_at as string,
          })) ?? [];
        rows = rows.concat(photoRows);
      } catch {}

      // videos — try spliks first (your main table), then legacy "videos"
      try {
        const { data } = await supabase
          .from("spliks")
          .select("id, user_id, created_at")
          .gt("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(limit);
        const vidRows =
          (data ?? []).map((v: any) => ({
            id: `splik_${v.id}`,
            user_id: v.user_id ?? null,
            kind: "video_post" as ActivityKind,
            created_at: v.created_at as string,
          })) ?? [];
        rows = rows.concat(vidRows);
      } catch {}
      try {
        const { data } = await supabase
          .from("videos")
          .select("id, user_id, created_at")
          .gt("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(limit);
        const vidRows =
          (data ?? []).map((v: any) => ({
            id: `video_${v.id}`,
            user_id: v.user_id ?? null,
            kind: "video_post" as ActivityKind,
            created_at: v.created_at as string,
          })) ?? [];
        rows = rows.concat(vidRows);
      } catch {}

      // prayers
      try {
        const { data } = await supabase
          .from("prayers")
          .select("id, user_id, created_at")
          .gt("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(limit);
        const prayerRows =
          (data ?? []).map((p: any) => ({
            id: `prayer_${p.id}`,
            user_id: p.user_id ?? null,
            kind: "prayer_post" as ActivityKind,
            created_at: p.created_at as string,
          })) ?? [];
        rows = rows.concat(prayerRows);
      } catch {}

      // sort desc and trim
      rows = rows
        .filter((r) => includeKinds.includes(r.kind))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);

      return rows;
    }

    async function load() {
      try {
        const rows = await loadFromHighlights().catch(fallbackQuery);

        // Build stable signature from raw rows; if unchanged, skip rerender
        const sig = JSON.stringify(rows.map((r) => [r.user_id, r.kind, r.id]));
        if (sig === prevSig.current) return;

        prevSig.current = sig;

        // Group by creator for the last 24 hours
        const grouped = groupByUser(rows);
        setGroups(grouped);

        // hydrate profiles for names/avatars
        const userIds = Array.from(
          new Set(grouped.map((g) => g.user_id).filter(Boolean) as string[])
        );
        if (userIds.length) await hydrateProfiles(userIds);
      } catch (e) {
        console.error("RightActivityRail load error:", e);
        setGroups([]);
      }
    }

    load();

    // realtime: any changes to highlights should refresh
    const channel = supabase
      .channel("right_activity_rail_grouped")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_highlights" },
        () => load()
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [includeKinds, limit, profiles]);

  const openModalFor = (g: Grouped) => {
    setActiveGroup(g);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setTimeout(() => setActiveGroup(null), 150);
  };

  const summaryText = (g: Grouped) => {
    const parts: string[] = [];
    const add = (n: number | undefined, word: string) => {
      if (!n) return;
      parts.push(`${n} ${word}${n > 1 ? "s" : ""}`);
    };
    add(g.counts.photo_post, "photo");
    add(g.counts.video_post, "video");
    add(g.counts.prayer_post, "prayer");
    return parts.join(" · ") || "activity";
  };

  return (
    <>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-200">Activity</h3>
          {/* show number of creators in the window */}
          <span className="text-xs text-neutral-500">{groups.length}</span>
        </div>

        <div className="mt-4 space-y-3">
          {groups.length === 0 && (
            <p className="text-sm text-neutral-400">
              New videos, photos, and Daily Prayers from the last 24h will show up here.
            </p>
          )}

          {groups.map((g) => {
            const prof = g.user_id ? profiles[g.user_id] : undefined;
            const name = bestName(prof);
            const avatar = prof?.avatar_url || null;

            return (
              <button
                key={`${g.user_id ?? "null"}_${g.latest_at}`}
                className="w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5 transition text-left"
                onClick={() => openModalFor(g)}
                title={`${name} activity`}
              >
                {/* Avatar (click goes to profile) */}
                <span
                  className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-fuchsia-500 to-indigo-500 ring-2 ring-neutral-800 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (g.user_id)
                      navigate(`/creator/${profileSlug(profiles[g.user_id]) || g.user_id}`);
                  }}
                >
                  {avatar ? (
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-white font-semibold">
                      {name[0]?.toUpperCase() || "U"}
                    </span>
                  )}
                </span>

                <div className="min-w-0">
                  <div className="text-sm text-neutral-100 truncate">
                    <span
                      className="font-semibold hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (g.user_id)
                          navigate(`/creator/${profileSlug(profiles[g.user_id]) || g.user_id}`);
                      }}
                      title={name}
                    >
                      {name}
                    </span>{" "}
                    <span className="text-neutral-300">had {summaryText(g)}</span>
                  </div>

                  <div className="text-[12px] text-neutral-500">
                    {timeAgo(new Date(g.latest_at).getTime())}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Text-only activity modal */}
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeModal())}>
        <DialogContent className="sm:max-w-md">
          {activeGroup && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>Activity — {bestName(activeGroup.user_id ? profiles[activeGroup.user_id] : undefined)}</span>
                  {activeGroup.user_id && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setOpen(false);
                        navigate(
                          `/creator/${profileSlug(
                            profiles[activeGroup.user_id]
                          ) || activeGroup.user_id}`
                        );
                      }}
                    >
                      View profile
                    </Button>
                  )}
                </DialogTitle>
                <DialogDescription>
                  Last {TIME_WINDOW_HOURS} hours — text only
                </DialogDescription>
              </DialogHeader>

              <div className="mt-2 space-y-2">
                {activeGroup.items
                  .slice()
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((it) => {
                    const when = timeAgo(new Date(it.created_at).getTime());
                    let text =
                      it.kind === "photo_post"
                        ? "posted a photo"
                        : it.kind === "video_post"
                        ? "posted a video"
                        : "posted in Daily Prayers";
                    return (
                      <div
                        key={`${it.kind}_${it.id}`}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="text-neutral-500 w-14 shrink-0">{when}</span>
                        <span className="text-neutral-200">{text}</span>
                      </div>
                    );
                  })}
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={closeModal}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
