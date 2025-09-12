// src/pages/Vibes.tsx
import * as React from "react";
import VibeComposer from "@/components/vibes/VibeComposer";
import VibeCard, { Vibe } from "@/components/vibes/VibeCard";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Plus, Users, TrendingUp } from "lucide-react";

export default function VibesPage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Vibe[]>([]);
  const topVibeRef = React.useRef<HTMLDivElement>(null);

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
        {/* Main Layout Container */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Sidebar - Photo Stories */}
            <div className="lg:col-span-3 space-y-6">
              {/* Photo Stories Section */}
              <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-200">Photo Stories</h2>
                  <Camera className="h-5 w-5 text-slate-400" />
                </div>
                
                {/* Add Photo Story Button */}
                <div className="mb-4">
                  <button className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl p-4 transition-all duration-300 group">
                    <div className="flex flex-col items-center space-y-2">
                      <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
                        <Plus className="h-6 w-6 text-white" />
                      </div>
                      <span className="text-white font-medium text-sm">Add Photo</span>
                    </div>
                  </button>
                </div>

                {/* Photo Stories Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="aspect-square bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl border border-slate-600/30 flex items-center justify-center group hover:from-slate-600/50 hover:to-slate-700/50 transition-all cursor-pointer">
                      <Camera className="h-8 w-8 text-slate-400 group-hover:text-slate-300 transition-colors" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Your Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                      <span className="text-slate-300 text-sm">Total Hype</span>
                    </div>
                    <span className="text-white font-semibold">42</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-blue-400" />
                      <span className="text-slate-300 text-sm">Connections</span>
                    </div>
                    <span className="text-white font-semibold">128</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Center Feed */}
            <div className="lg:col-span-6 space-y-6">
              {/* Enhanced Composer Section */}
              <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl p-6">
                <VibeComposer
                  onPosted={async (newRow) => {
                    if (newRow) {
                      // Composer usually attaches profile; if not, hydrate it.
                      const next =
                        (newRow as Vibe).profile
                          ? (newRow as Vibe)
                          : await hydrateProfile(newRow);
                      setRows((prev) => [next, ...prev]);
                      
                      // Scroll to the new vibe after a brief delay to ensure it's rendered
                      setTimeout(() => {
                        topVibeRef.current?.scrollIntoView({ 
                          behavior: 'smooth', 
                          block: 'start' 
                        });
                      }, 100);
                    } else {
                      await fetchVibes();
                    }
                  }}
                />
              </div>

              {/* Feed Section */}
              <div className="space-y-4">
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
                  <div className="space-y-4">
                    {/* Vibes header */}
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-semibold text-slate-200">Latest Vibes</h2>
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
                          <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 hover:border-slate-600/70 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/10 overflow-hidden">
                            <div className="p-6">
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

            {/* Right Sidebar - Trending & People */}
            <div className="lg:col-span-3 space-y-6">
              {/* Trending Moods */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Trending Moods</h3>
                <div className="space-y-3">
                  {[
                    { mood: "🔥 Hype", count: "1.2k vibes" },
                    { mood: "😄 Happy", count: "892 vibes" },
                    { mood: "🧘 Chill", count: "634 vibes" },
                    { mood: "🙏 Grateful", count: "428 vibes" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-700/30 hover:bg-slate-700/50 transition-colors cursor-pointer">
                      <span className="text-slate-200 font-medium">{item.mood}</span>
                      <span className="text-slate-400 text-sm">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {[1,2,3].map((i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-medium">U</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-300 text-sm">
                          <span className="font-medium">User {i}</span> hyped your vibe
                        </p>
                        <p className="text-slate-500 text-xs">{i * 2} minutes ago</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
