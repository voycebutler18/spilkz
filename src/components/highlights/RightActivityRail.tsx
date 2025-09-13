// RightActivityRail.tsx
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type ActivityKind = "photo" | "video" | "quote";

type Activity = {
  id: string;
  user_id: string | null;
  kind: ActivityKind;
  created_at: string;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}

export default function RightActivityRail({
  limit = 60,
}: { limit?: number }) {
  const navigate = useNavigate();
  const [items, setItems] = React.useState<Activity[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, Profile>>({});
  const sigRef = React.useRef("");

  React.useEffect(() => {
    let alive = true;

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

    const load = async () => {
      // right_rail_feed has: id, user_id, media_url, description, location, created_at, type
      const { data, error } = await supabase
        .from("right_rail_feed")
        .select("id, user_id, created_at, type")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const rows: Activity[] = (data || [])
        .map((r: any) => ({
          id: String(r.id),
          user_id: r.user_id ?? null,
          kind: (r.type as ActivityKind) || "photo",
          created_at: r.created_at as string,
        }));

      const sig = JSON.stringify(rows.map((r) => [r.kind, r.id, r.created_at]));
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setItems(rows);
        await hydrateProfiles(
          Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]))
        );
      }
    };

    load().catch(() => { /* swallow */ });

    // Realtime: refresh on new photo/video/quote
    const ch = supabase
      .channel("right-rail-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vibe_photos" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "spliks" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quotes" }, load)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [limit, profiles]);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">Activity</h3>
        <span className="text-xs text-neutral-500">{items.length}</span>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-neutral-400">
            New videos and Daily Prayers updates will show up here.
          </p>
        )}

        {items.map((it) => {
          const prof = it.user_id ? profiles[it.user_id] : undefined;
          const name = prof?.username || prof?.display_name || "User";
          const avatar = prof?.avatar_url || null;

          const action =
            it.kind === "video" ? "posted a video"
            : it.kind === "photo" ? "posted a photo"
            : "posted in ";

          return (
            <div
              key={`${it.kind}_${it.id}`}
              className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5 transition"
            >
              <button
                className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-fuchsia-500 to-indigo-500 ring-2 ring-neutral-800 shrink-0"
                onClick={() => {
                  if (it.user_id) navigate(`/creator/${prof?.username || it.user_id}`);
                }}
                title={name}
              >
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-white font-semibold">
                    {name[0]?.toUpperCase() || "U"}
                  </span>
                )}
              </button>

              <div className="min-w-0">
                <div className="text-sm text-neutral-100 truncate">
                  <button
                    className="font-semibold hover:underline"
                    onClick={() => {
                      if (it.user_id) navigate(`/creator/${prof?.username || it.user_id}`);
                    }}
                    title={name}
                  >
                    {name}
                  </button>{" "}
                  {it.kind === "quote" ? (
                    <>
                      <span className="text-neutral-300">{action}</span>
                      <button
                        className="text-indigo-300 hover:underline ml-1"
                        onClick={() => navigate("/prayers")}
                        title="Go to Daily Prayers"
                      >
                        Daily Prayers
                      </button>
                    </>
                  ) : (
                    <span className="text-neutral-300">{action}</span>
                  )}
                </div>

                <div className="text-[12px] text-neutral-500">
                  {timeAgo(new Date(it.created_at).getTime())}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
