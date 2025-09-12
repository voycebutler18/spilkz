import * as React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type ActivityKind = "video_post" | "prayer_post";

type Activity = {
  id: string;               // highlight id or underlying row id as fallback
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
  includeKinds = ["video_post", "prayer_post"],
  limit = 60,
}: {
  includeKinds?: ActivityKind[];
  limit?: number;
}) {
  const navigate = useNavigate();

  const [items, setItems] = React.useState<Activity[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, Profile>>({});
  const [userId, setUserId] = React.useState<string | null>(null);

  // track previous payload to avoid needless re-renders (reduces flicker)
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
        // safety: enforce only known kinds
        .filter((r) => includeKinds.includes(r.kind));

      // dedupe by (kind+id) and make stable signature
      const sig = JSON.stringify(rows.map((r) => [r.kind, r.id, r.created_at]));
      if (sig !== prevSig.current) {
        prevSig.current = sig;
        setItems(rows);
        await hydrateProfiles(
          Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]))
        );
      }
    }

    // fallback if highlights view/table isn’t present
    async function fallbackQuery() {
      const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // videos (guessing table name "videos"; adjust if yours differs)
      let videoRows: Activity[] = [];
      try {
        const { data } = await supabase
          .from("videos")
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
      } catch {
        // swallow if table missing
      }

      // prayers (guessing table name "prayers"; adjust if yours differs)
      let prayerRows: Activity[] = [];
      try {
        const { data } = await supabase
          .from("prayers")
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
      } catch {
        // swallow if table missing
      }

      const rows = [...videoRows, ...prayerRows]
        .filter((r) => includeKinds.includes(r.kind))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);

      const sig = JSON.stringify(rows.map((r) => [r.kind, r.id, r.created_at]));
      if (sig !== prevSig.current) {
        prevSig.current = sig;
        setItems(rows);
        await hydrateProfiles(
          Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]))
        );
      }
    }

    (async () => {
      try {
        await loadFromHighlights();
      } catch {
        await fallbackQuery();
      }
    })();

    // realtime: throttle updates by re-fetching, but avoid flicker by signature check
    const channel = supabase
      .channel("right_activity_rail")
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
  }, [includeKinds, limit, profiles]);

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

          return (
            <div
              key={`${it.kind}_${it.id}`}
              className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5 transition"
            >
              {/* Avatar -> clicking always goes to creator profile */}
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
                  {/* Name -> profile */}
                  <button
                    className="font-semibold hover:underline"
                    onClick={() => {
                      if (it.user_id) navigate(`/creator/${prof?.username || it.user_id}`);
                    }}
                    title={name}
                  >
                    {name}
                  </button>{" "}
                  {it.kind === "video_post" ? (
                    <span className="text-neutral-300">posted a video</span>
                  ) : (
                    <>
                      <span className="text-neutral-300">posted in </span>
                      <button
                        className="text-indigo-300 hover:underline"
                        onClick={() => navigate("/prayers")}
                        title="Go to Daily Prayers"
                      >
                        Daily Prayers
                      </button>
                    </>
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
