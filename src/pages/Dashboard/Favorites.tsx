// src/pages/Dashboard/Favorites.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import VideoContainer from "@/components/VideoContainer";
import { Bookmark, Grid3x3, List, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface FavoriteRow {
  id: string;
  user_id: string;
  splik_id: string | null; // be defensive in case of legacy rows
  created_at: string;
}

interface ProfileLite {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface SplikLite {
  id: string;
  user_id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  title: string | null;
  description: string | null;
  likes_count?: number | null;
  views?: number | null;
  created_at: string;
  profile?: ProfileLite;
}

interface Favorite {
  id: string;
  splik_id: string;
  created_at: string;
  splik: SplikLite;
}

const Favorites = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        navigate("/login");
        return;
      }
      await fetchFavorites();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFavorites = async () => {
    try {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      // 1) Get favorites rows for this user
      const { data: favRows, error: favErr } = await supabase
        .from("favorites")
        .select("id,user_id,splik_id,created_at")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false });

      if (favErr) throw favErr;

      const cleanFavs: FavoriteRow[] = (favRows || []) as FavoriteRow[];

      if (!cleanFavs.length) {
        setFavorites([]);
        return;
      }

      // 2) Collect only valid UUIDs (avoid 'undefined' -> 400 error)
      const splikIds = cleanFavs
        .map((f) => f.splik_id)
        .filter((v): v is string => Boolean(v));

      if (splikIds.length === 0) {
        setFavorites([]);
        return;
      }

      // 3) Fetch spliks for those IDs
      const { data: spliksData, error: spliksErr } = await supabase
        .from("spliks")
        .select("id,user_id,video_url,thumbnail_url,title,description,likes_count,created_at,views")
        .in("id", splikIds);

      if (spliksErr) throw spliksErr;

      // 4) Hydrate creator profiles for display
      const creatorIds = Array.from(new Set((spliksData || []).map((s: any) => s.user_id)));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", creatorIds);

      const byCreator: Record<string, ProfileLite> = {};
      (profs || []).forEach((p: any) => (byCreator[p.id] = p));

      const bySplik: Record<string, SplikLite> = {};
      (spliksData || []).forEach((s: any) => {
        bySplik[s.id] = { ...s, profile: byCreator[s.user_id] || undefined };
      });

      // 5) Build view models in the same order as favorites list
      const transformed: Favorite[] = cleanFavs
        .map((f) => {
          const s = f.splik_id ? bySplik[f.splik_id] : undefined;
          if (!s) return null;
          return {
            id: f.id,
            splik_id: f.splik_id!,
            created_at: f.created_at,
            splik: s,
          };
        })
        .filter(Boolean) as Favorite[];

      setFavorites(transformed);
    } catch (err: any) {
      console.error("Error fetching favorites:", err);
      toast.error("Failed to load favorites");
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (favoriteId: string) => {
    try {
      const { error } = await supabase.from("favorites").delete().eq("id", favoriteId);
      if (error) throw error;
      // Optimistic UI
      setFavorites((cur) => cur.filter((f) => f.id !== favoriteId));
      toast.success("Removed from favorites");
    } catch (err) {
      console.error("Error removing from favorites:", err);
      toast.error("Failed to remove from favorites");
    }
  };

  // Open the creator page focused on this video
  const openOnCreator = (fav: Favorite) => {
    const slug = fav.splik.profile?.username || fav.splik.user_id;
    navigate(`/creator/${slug}?video=${fav.splik.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              My Favorites
            </h1>
            <p className="text-muted-foreground mt-2">
              {favorites.length} {favorites.length === 1 ? "video" : "videos"} saved
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("grid")}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {favorites.length === 0 ? (
          <Card className="p-12 text-center">
            <Bookmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No favorites yet</p>
            <p className="text-sm text-muted-foreground">Videos you bookmark will appear here</p>
            <Button className="mt-4" onClick={() => navigate("/")}>
              Explore Videos
            </Button>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {favorites.map((fav) => (
              <Card
                key={fav.id}
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => openOnCreator(fav)}
              >
                <div className="relative aspect-[9/16] bg-black">
                  <VideoContainer
                    src={fav.splik.video_url || ""}
                    poster={fav.splik.thumbnail_url || undefined}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    <p className="font-semibold text-sm truncate">
                      {fav.splik.title || "Untitled"}
                    </p>
                    <p className="text-xs opacity-80">
                      {(fav.splik.views || 0).toLocaleString()} views
                    </p>
                  </div>
                </div>
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      {fav.splik.profile?.avatar_url && (
                        <img
                          src={fav.splik.profile.avatar_url}
                          alt={fav.splik.profile.display_name || "Creator"}
                          className="w-6 h-6 rounded-full"
                        />
                      )}
                      <span className="text-sm text-muted-foreground truncate">
                        {fav.splik.profile?.display_name || fav.splik.profile?.username || "Unknown"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFavorite(fav.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {favorites.map((fav) => (
              <Card key={fav.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <div
                      className="relative w-32 aspect-[9/16] bg-black rounded-lg overflow-hidden cursor-pointer flex-shrink-0"
                      onClick={() => openOnCreator(fav)}
                    >
                      <VideoContainer
                        src={fav.splik.video_url || ""}
                        poster={fav.splik.thumbnail_url || undefined}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-semibold mb-1 cursor-pointer hover:text-primary"
                        onClick={() => openOnCreator(fav)}
                      >
                        {fav.splik.title || "Untitled Video"}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {fav.splik.description || "No description"}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{(fav.splik.views || 0).toLocaleString()} views</span>
                        <span>{(fav.splik.likes_count || 0).toLocaleString()} likes</span>
                        <span>Saved {new Date(fav.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          {fav.splik.profile?.avatar_url && (
                            <img
                              src={fav.splik.profile.avatar_url}
                              alt={fav.splik.profile.display_name || "Creator"}
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                          <span className="text-sm">
                            {fav.splik.profile?.display_name || fav.splik.profile?.username || "Unknown Creator"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openOnCreator(fav)}
                            className="mr-2"
                          >
                            Watch on creator page
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFavorite(fav.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Favorites;
