// src/pages/Dashboard/Favorites.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client"; // ✅ correct client
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import VideoContainer from "@/components/VideoContainer";
import { Bookmark, Grid3x3, List, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type SplikRow = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  hype_count?: number | null; // cache column we maintain via trigger
  // optional profile we’ll hydrate
  profile?: Profile | null;
};

type Favorite = {
  id: string;
  splik_id: string;
  created_at: string;
  splik: SplikRow;
};

const Favorites = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
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

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData.user;
      if (!user) {
        setFavorites([]);
        return;
      }

      // 1) Grab favorites (user_id, splik_id)
      const { data: favRows, error: favErr } = await supabase
        .from("favorites")
        .select("id, splik_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (favErr) throw favErr;
      const favs = favRows ?? [];
      if (favs.length === 0) {
        setFavorites([]);
        return;
      }

      // 2) Fetch those spliks
      const splikIds = favs.map((f) => f.splik_id);
      const { data: spliks, error: spliksErr } = await supabase
        .from("spliks")
        .select(
          "id,user_id,title,description,video_url,thumbnail_url,created_at,hype_count"
        )
        .in("id", splikIds);

      if (spliksErr) throw spliksErr;
      const spliksById: Record<string, SplikRow> = {};
      (spliks ?? []).forEach((s: any) => (spliksById[s.id] = s));

      // 3) Hydrate minimal profiles for creator badges
      const creatorIds = Array.from(
        new Set((spliks ?? []).map((s: any) => s.user_id))
      );
      if (creatorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,username,display_name,avatar_url")
          .in("id", creatorIds);
        const byId: Record<string, Profile> = {};
        (profs ?? []).forEach((p: any) => (byId[p.id] = p));
        (spliks ?? []).forEach((s: any) => {
          if (spliksById[s.id]) spliksById[s.id].profile = byId[s.user_id] ?? null;
        });
      }

      // 4) Build Favorites[]
      const transformed: Favorite[] = favs
        .map((f) => {
          const s = spliksById[f.splik_id];
          if (!s) return null;
          return {
            id: f.id,
            splik_id: f.splik_id,
            created_at: f.created_at,
            splik: s,
          };
        })
        .filter(Boolean) as Favorite[];

      setFavorites(transformed);
    } catch (err) {
      console.error("Error fetching favorites:", err);
      toast.error("Failed to load favorites");
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (favoriteId: string, splikId: string) => {
    try {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .match({ id: favoriteId, splik_id: splikId });
      if (error) throw error;
      toast.success("Removed from favorites");
      setFavorites((prev) => prev.filter((f) => f.id !== favoriteId));
    } catch (err) {
      console.error("Error removing from favorites:", err);
      toast.error("Failed to remove from favorites");
    }
  };

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
            <p className="text-sm text-muted-foreground">
              Videos you bookmark will appear here
            </p>
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
                    src={fav.splik.video_url ?? ""}
                    poster={fav.splik.thumbnail_url ?? ""}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    <p className="font-semibold text-sm truncate">
                      {fav.splik.title || "Untitled"}
                    </p>
                    <p className="text-xs opacity-80">
                      {fav.splik.hype_count ?? 0} hype
                    </p>
                  </div>
                </div>
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {!!fav.splik.profile?.avatar_url && (
                        <img
                          src={fav.splik.profile.avatar_url}
                          alt={fav.splik.profile.display_name ?? "Creator"}
                          className="w-6 h-6 rounded-full"
                        />
                      )}
                      <span className="text-sm text-muted-foreground truncate">
                        {fav.splik.profile?.display_name ||
                          fav.splik.profile?.username ||
                          "Creator"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFavorite(fav.id, fav.splik_id);
                      }}
                      title="Remove from favorites"
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
                        src={fav.splik.video_url ?? ""}
                        poster={fav.splik.thumbnail_url ?? ""}
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
                        <span>{fav.splik.hype_count ?? 0} hype</span>
                        <span>Saved {new Date(fav.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          {!!fav.splik.profile?.avatar_url && (
                            <img
                              src={fav.splik.profile.avatar_url}
                              alt={fav.splik.profile.display_name ?? "Creator"}
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                          <span className="text-sm">
                            {fav.splik.profile?.display_name ||
                              fav.splik.profile?.username ||
                              "Creator"}
                          </span>
                        </div>
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
                            removeFavorite(fav.id, fav.splik_id);
                          }}
                          title="Remove from favorites"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
