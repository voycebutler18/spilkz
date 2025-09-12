// src/pages/Vibes.tsx
import * as React from "react";
import VibeComposer from "@/components/vibes/VibeComposer";
import VibeCard, { Vibe } from "@/components/vibes/VibeCard";
import { supabase } from "@/integrations/supabase/client";

export default function VibesPage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Vibe[]>([]);

  // helper: attach the author's profile to a vibe
  const hydrateProfile = React.useCallback(async (v: any): Promise<Vibe> => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, username, display_name, first_name, last_name, avatar_url") // ✅ include first/last
      .eq("id", v.user_id)
      .maybeSingle();
    return { ...v, profile: prof || null } as Vibe;
  }, []);

  const fetchVibes = React.useCallback(async () => {
    setLoading(true);
    try {
      // fetch latest vibes
      const { data, error } = await supabase
        .from("vibes")
        .select("id, user_id, content, mood, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const hydrated = await Promise.all((data ?? []).map(hydrateProfile));
      setRows(hydrated);
    } catch (e) {
      console.error("Failed to load vibes:", e);
    } finally {
      setLoading(false);
    }
  }, [hydrateProfile]);

  // initial load + realtime inserts
  React.useEffect(() => {
    fetchVibes();

    const ch = supabase
      .channel("live-vibes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vibes" },
        async (payload) => {
          const hydrated = await hydrateProfile(payload.new);
          setRows((prev) => [hydrated, ...prev]);
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [fetchVibes, hydrateProfile]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* ✅ No local Header/Footer here – AppLayout already provides them */}
      
      <div className="relative z-10">
        {/* Hero section with subtle gradient */}
        <div className="bg-gradient-to-b from-slate-900/50 to-transparent backdrop-blur-sm border-b border-slate-800/50">
          <div className="max-w-4xl mx-auto px-6 py-12">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent mb-3">
                Share Your Vibe
              </h1>
              <p className="text-slate-400 text-lg font-light">
                Express yourself in the moment
              </p>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Enhanced Composer Section */}
          <div className="mb-12">
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl p-8">
              <VibeComposer
                onPosted={async (newRow) => {
                  if (newRow) {
                    // Composer usually attaches profile; if not, hydrate it.
                    const next =
                      (newRow as Vibe).profile
                        ? (newRow as Vibe)
                        : await hydrateProfile(newRow);
                    setRows((prev) => [next, ...prev]);
                  } else {
                    await fetchVibes();
                  }
                }}
              />
            </div>
          </div>

          {/* Feed Section */}
          <div className="space-y-6">
            {loading ? (
              <div className="py-24 flex flex-col items-center justify-center">
                <div className="relative">
                  <div className="h-12 w-12 border-2 border-slate-600 border-t-purple-400 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 h-12 w-12 border-2 border-transparent border-b-blue-400 rounded-full animate-spin animation-delay-150"></div>
                </div>
                <p className="mt-6 text-slate-400 font-light">Loading vibes...</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-20 text-center">
                <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-12">
                  <div className="mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full mx-auto flex items-center justify-center">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-200 mb-2">No vibes yet</h3>
                  <p className="text-slate-400 font-light">Be the first to share your vibe!</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Vibes header */}
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-semibold text-slate-200">Latest Vibes</h2>
                  <div className="flex items-center space-x-2 text-sm text-slate-400">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span>Live</span>
                  </div>
                </div>

                {/* Enhanced Vibe Cards Container */}
                <div className="space-y-4">
                  {rows.map((v, index) => (
                    <div 
                      key={v.id}
                      ref={index === 0 ? topVibeRef : null}
                      className="group"
                      style={{
                        animationDelay: `${index * 50}ms`
                      }}
                    >
                      <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 hover:border-slate-600/70 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/10 p-1">
                        <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/40 rounded-xl p-6">
                          <VibeCard vibe={v} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom spacer */}
        <div className="h-20"></div>
      </div>

      {/* Subtle noise texture overlay */}
      <div 
        className="fixed inset-0 opacity-20 pointer-events-none mix-blend-soft-light"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      ></div>
    </div>
  );
}
