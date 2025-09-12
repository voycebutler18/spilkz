// src/components/highlights/MobileActivity.tsx
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useActivityFeed, timeAgo, ActivityKind } from "./useActivityFeed";

type Chip = {
  id: string;
  kind: ActivityKind;
  name: string;
  avatar_url?: string | null;
  user_id?: string | null;
  created_at: string;
};

export default function MobileActivity() {
  const navigate = useNavigate();
  const { items, profiles } = useActivityFeed({ includeKinds: ["video_post", "prayer_post"], limit: 40 });

  const chips: Chip[] = React.useMemo(() => {
    return items.map((it) => {
      const prof = it.user_id ? profiles[it.user_id] : undefined;
      const name = prof?.username || prof?.display_name || "User";
      return {
        id: `${it.kind}_${it.id}`,
        kind: it.kind,
        name,
        avatar_url: prof?.avatar_url ?? null,
        user_id: it.user_id ?? null,
        created_at: it.created_at,
      };
    });
  }, [items, profiles]);

  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Compact bar under the mobile header */}
      <div className="sticky top-12 z-30 -mx-3 sm:-mx-4 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="px-3 sm:px-4 py-2 flex items-center justify-between">
          <div className="text-[13px] font-semibold">Activity</div>
          <button
            className="text-xs text-indigo-300 hover:text-indigo-200"
            onClick={() => setOpen(true)}
          >
            See all
          </button>
        </div>

        <div className="px-3 sm:px-4 pb-2 overflow-x-auto no-scrollbar">
          <div className="flex gap-2">
            {chips.length === 0 ? (
              <div className="text-[12px] text-neutral-500 py-1">Nothing new in the last 24h</div>
            ) : (
              chips.slice(0, 12).map((c) => (
                <button
                  key={c.id}
                  className="shrink-0 flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5"
                  onClick={() => {
                    if (c.kind === "prayer_post") navigate("/prayers");
                    else if (c.user_id) navigate(`/creator/${profiles[c.user_id!]?.username || c.user_id}`);
                  }}
                  title={
                    c.kind === "prayer_post"
                      ? `${c.name} posted in Daily Prayers • ${timeAgo(new Date(c.created_at).getTime())}`
                      : `${c.name} posted a video • ${timeAgo(new Date(c.created_at).getTime())}`
                  }
                >
                  <div className="h-6 w-6 rounded-full overflow-hidden bg-gradient-to-br from-fuchsia-500 to-indigo-500 ring-1 ring-neutral-800">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-[11px] text-white font-semibold">
                        {c.name?.[0]?.toUpperCase() || "U"}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-neutral-200">
                    <span className="font-medium">{c.name}</span>{" "}
                    {c.kind === "prayer_post" ? "in Daily Prayers" : "posted a video"}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Full-screen drawer */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          aria-modal="true"
          role="dialog"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl border border-neutral-800 bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="font-semibold">Activity (last 24h)</div>
              <button
                className="text-sm text-neutral-400 hover:text-neutral-200"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="p-3 divide-y divide-neutral-800 overflow-y-auto">
              {chips.length === 0 && (
                <div className="text-sm text-neutral-400 p-3">No recent activity</div>
              )}
              {chips.map((c) => (
                <button
                  key={c.id}
                  className="w-full text-left py-3 flex items-center gap-3 hover:bg-white/5 rounded-xl px-2"
                  onClick={() => {
                    if (c.kind === "prayer_post") navigate("/prayers");
                    else if (c.user_id) navigate(`/creator/${profiles[c.user_id!]?.username || c.user_id}`);
                    setOpen(false);
                  }}
                >
                  <div className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-fuchsia-500 to-indigo-500 ring-2 ring-neutral-800 shrink-0">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-white font-semibold">
                        {c.name?.[0]?.toUpperCase() || "U"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-neutral-100 truncate">
                      <span className="font-semibold">{c.name}</span>{" "}
                      {c.kind === "prayer_post" ? (
                        <>
                          posted in <span className="text-indigo-300">Daily Prayers</span>
                        </>
                      ) : (
                        "posted a video"
                      )}
                    </div>
                    <div className="text-[12px] text-neutral-500">
                      {timeAgo(new Date(c.created_at).getTime())}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
