
// src/pages/Vibes.tsx
import * as React from "react";
import VibeComposer from "@/components/vibes/VibeComposer";
import VibeCard, { Vibe } from "@/components/vibes/VibeCard";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Plus, Users, TrendingUp, X, ChevronUp, ChevronDown } from "lucide-react";

export default function VibesPage() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Vibe[]>([]);
  const [selectedPhoto, setSelectedPhoto] = React.useState<number | null>(null);
  const [photos] = React.useState([
    { id: 1, src: "https://images.unsplash.com/photo-1494790108755-2616b332b1c0?w=400", user: "Sarah Chen" },
    { id: 2, src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400", user: "Mike Johnson" },
    { id: 3, src: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400", user: "Emma Wilson" },
    { id: 4, src: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400", user: "Alex Rodriguez" },
    { id: 5, src: "https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=400", user: "Lisa Park" },
  ]);
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

  const navigatePhoto = (direction: 'up' | 'down') => {
    if (selectedPhoto === null) return;
    
    if (direction === 'up' && selectedPhoto > 0) {
      setSelectedPhoto(selectedPhoto - 1);
    } else if (direction === 'down' && selectedPhoto < photos.length - 1) {
      setSelectedPhoto(selectedPhoto + 1);
    }
  };

  // Keyboard navigation for photo viewer
  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (selectedPhoto === null) return;
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigatePhoto('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigatePhoto('down');
      } else if (e.key === 'Escape') {
        setSelectedPhoto(null);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedPhoto, photos.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* Photo Viewer Modal */}
      {selectedPhoto !== null && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="relative max-w-4xl max-h-screen p-4">
            {/* Close button */}
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10 transition-colors"
            >
              <X className="h-6 w-6 text-white" />
            </button>

            {/* Navigation buttons */}
            {selectedPhoto > 0 && (
              <button
                onClick={() => navigatePhoto('up')}
                className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10 transition-colors"
              >
                <ChevronUp className="h-6 w-6 text-white" />
              </button>
            )}
            
            {selectedPhoto < photos.length - 1 && (
              <button
                onClick={() => navigatePhoto('down')}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10 transition-colors"
              >
                <ChevronDown className="h-6 w-6 text-white" />
              </button>
            )}

            {/* Photo */}
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
              <img
                src={photos[selectedPhoto].src}
                alt="User photo"
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              <div className="p-6 border-t border-slate-700/50">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium text-sm">
                      {photos[selectedPhoto].user.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{photos[selectedPhoto].user}</h3>
                    <p className="text-slate-400 text-sm">2 hours ago</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Photo counter */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
              {selectedPhoto + 1} of {photos.length}
            </div>
          </div>
        </div>
      )}

      {/* ✅ No local Header/Footer here – AppLayout already provides them */}
      
      <div className="relative z-10">
        {/* Desktop Layout Container */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Sidebar - Navigation & Quick Access */}
            <div className="lg:col-span-3 space-y-6">
              {/* Quick Stats */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Your Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                      <span className="text-slate-300 text-sm">Total Hype</span>
                    </div>
                    <span className="text-white font-semibold">127</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-blue-400" />
                      <span className="text-slate-300 text-sm">Connections</span>
                    </div>
                    <span className="text-white font-semibold">342</span>
                  </div>
                </div>
              </div>

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
            </div>

            {/* Center Feed - Main Content */}
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

            {/* Right Sidebar - Photos & Activity */}
            <div className="lg:col-span-3 space-y-6">
              {/* Photo Gallery Section */}
              <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-200">Photo Gallery</h2>
                  <Camera className="h-5 w-5 text-slate-400" />
                </div>
                
                {/* Add Photo Button */}
                <div className="mb-4">
                  <button className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl p-3 transition-all duration-300 group">
                    <div className="flex items-center justify-center space-x-2">
                      <Plus className="h-5 w-5 text-white" />
                      <span className="text-white font-medium text-sm">Add Photo</span>
                    </div>
                  </button>
                </div>

                {/* Photo Grid - Vertical Scrollable */}
                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                  {photos.map((photo, index) => (
                    <div 
                      key={photo.id}
                      className="relative aspect-square bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl border border-slate-600/30 overflow-hidden group hover:from-slate-600/50 hover:to-slate-700/50 transition-all cursor-pointer"
                      onClick={() => setSelectedPhoto(index)}
                    >
                      <img
                        src={photo.src}
                        alt={`Photo by ${photo.user}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-white text-xs font-medium truncate">{photo.user}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-medium">U</span>
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

      {/* Custom scrollbar styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(51, 65, 85, 0.3);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.6);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.8);
        }
      `}</style>

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
