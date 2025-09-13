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

/* ─ Types ─ */
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

/* ─ Helpers ─ */
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

/* ─ Component ─ */
export default function MobileActivityBar({ limit = 60 }: { limit?: number }) {
  const navigate = useNavigate();
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, Profile>>({});
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<Group | null>(null);
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

    const ch = supabase
      .channel("mobile-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vibe_photos" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "vibe_photos" }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "vibe_photos" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "spliks" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quotes" }, load)
      .subscribe();

    const onActivityAppend = () => load();
    window.addEventListener("activity:append", onActivityAppend as EventListener);

    return () => {
      alive = false;
      try { supabase.removeChannel(ch); } catch {}
      window.removeEventListener("activity:append", onActivityAppend as EventListener);
    };
  }, [limit]);

  const latest = groups[0];
  const prof = latest?.user_id ? profiles[latest.user_id] : undefined;

  const summaryText = (g: Group) => {
    const parts: string[] = [];
    const add = (n: number | undefined, w: string) => n && n > 0 && parts.push(`${n} ${w}${n > 1 ? "s" : ""}`);
    add(g.counts.photo, "photo");
    add(g.counts.video, "video");
    add(g.counts.quote, "prayer");
    return parts.join(" · ") || "activity";
  };

  const openModalFor = (g: Group) => {
    setActive(g);
    setOpen(true);
  };
  const closeModal = () => {
    setOpen(false);
    setTimeout(() => setActive(null), 150);
  };

  return (
    <>
      {/* Compact bar — show only on mobile (hidden on lg and up) */}
      <div className="lg:hidden">
        <button
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-left flex items-center gap-3"
          onClick={() => latest && openModalFor(latest)}
        >
          <span className="h-9 w-9 rounded-full overflow-hidden bg-gradient-to-br from-fuchsia-500 to-indigo-500 ring-2 ring-neutral-800 shrink-0">
            {prof?.avatar_url ? (
              <img src={prof.avatar_url} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-white text-sm font-semibold">
                {(bestName(prof)[0] || "U").toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <div className="text-sm text-neutral-100 truncate">
              <span className="font-semibold">{bestName(prof)}</span>{" "}
              {latest ? (
                <span className="text-neutral-300">had {summaryText(latest)}</span>
              ) : (
                <span className="text-neutral-400">Nothing new in the last 24h</span>
              )}
            </div>
            {latest && (
              <div className="text-[12px] text-neutral-500">
                {timeAgo(new Date(latest.latest_at).getTime())}
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Detail modal (same style as rail) */}
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeModal())}>
        <DialogContent className="sm:max-w-md">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>Activity — {bestName(active.user_id ? profiles[active.user_id] : undefined)}</span>
                  {active.user_id && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setOpen(false);
                        const p = active.user_id ? profiles[active.user_id] : undefined;
                        navigate(`/creator/${profileSlug(p) || active.user_id}`);
                      }}
                    >
                      View profile
                    </Button>
                  )}
                </DialogTitle>
                <DialogDescription>Last {TIME_WINDOW_HOURS} hours — text + mini previews</DialogDescription>
              </DialogHeader>

              <div className="mt-2 space-y-2">
                {active.items
                  .slice()
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((it) => {
                    const when = timeAgo(new Date(it.created_at).getTime());
                    const text =
                      it.kind === "photo"
                        ? "posted a photo"
                        : it.kind === "video"
                        ? "posted a video"
                        : "posted in Daily Prayers";
                    return (
                      <div key={`${it.kind}_${it.id}`} className="flex items-center gap-3 text-sm">
                        <span className="text-neutral-500 w-14 shrink-0">{when}</span>
                        {it.kind === "photo" && it.media_url ? (
                          <span className="h-10 w-10 shrink-0 rounded-md overflow-hidden border border-neutral-800">
                            <img src={it.media_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                          </span>
                        ) : null}
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
