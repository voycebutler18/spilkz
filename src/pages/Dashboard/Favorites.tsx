import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import VideoContainer from "@/components/VideoContainer";
import { Bookmark, Grid3x3, List, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Favorite {
  id: string;
  splik_id: string;
  created_at: string;
  splik: {
    id: string;
    video_url: string;
    thumbnail_url: string;
    title: string;
    description: string;
    views: number;
    likes_count: number;
    created_at: string;
    user_id: string;
    profile?: {
      username: string;
      display_name: string;
      avatar_url: string;
    };
  };
}

const Favorites = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate('/login');
      return;
    }

    await fetchFavorites();
  };

  const fetchFavorites = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get favorites directly from the table
      const { data: favoritesData, error: favError } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (favError) throw favError;

      const favoritesList = favoritesData as Array<{
        id: string;
        splik_id: string;
        created_at: string;
      }>;

      if (!favoritesList || favoritesList.length === 0) {
        setFavorites([]);
        return;
      }

      // Get the spliks for those favorites
      const splikIds = favoritesList.map(f => f.splik_id);
      const { data: spliksData, error: spliksError } = await supabase
        .from('spliks')
        .select('*')
        .in('id', splikIds);

      if (spliksError) throw spliksError;

      // Get profiles for the spliks
      const userIds = [...new Set(spliksData?.map(s => s.user_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', userIds);

      // Combine the data
      const transformedData = favoritesList.map(fav => {
        const splik = spliksData?.find(s => s.id === fav.splik_id);
        const profile = profilesData?.find(p => p.id === splik?.user_id);
        
        return {
          id: fav.id,
          splik_id: fav.splik_id,
          created_at: fav.created_at,
          splik: splik ? {
            ...splik,
            profile: profile || undefined
          } : null
        };
      }).filter(item => item.splik !== null) as Favorite[];

      setFavorites(transformedData);
    } catch (error) {
      console.error('Error fetching favorites:', error);
      toast.error('Failed to load favorites');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromFavorites = async (favoriteId: string, splikId: string) => {
    try {
      // Use raw SQL to delete
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Direct delete using the favorites table
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('id', favoriteId);

      if (error) throw error;

      toast.success('Removed from favorites');
      fetchFavorites();
    } catch (error) {
      console.error('Error removing from favorites:', error);
      toast.error('Failed to remove from favorites');
    }
  };

  const handleVideoClick = (splikId: string) => {
    navigate(`/video/${splikId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
          >
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
              {favorites.length} {favorites.length === 1 ? 'video' : 'videos'} saved
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
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
            <Button 
              className="mt-4"
              onClick={() => navigate('/')}
            >
              Explore Videos
            </Button>
          </Card>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {favorites.map((favorite) => (
                  <Card 
                    key={favorite.id} 
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  >
                    <div 
                      className="relative aspect-[9/16] bg-black"
                      onClick={() => handleVideoClick(favorite.splik.id)}
                    >
                      <VideoContainer
                        src={favorite.splik.video_url}
                        poster={favorite.splik.thumbnail_url}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 pointer-events-none" />
                      <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                        <p className="font-semibold text-sm truncate">
                          {favorite.splik.title || 'Untitled'}
                        </p>
                        <p className="text-xs opacity-80">
                          {favorite.splik.views?.toLocaleString() || 0} views
                        </p>
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {favorite.splik.profile?.avatar_url && (
                            <img
                              src={favorite.splik.profile.avatar_url}
                              alt={favorite.splik.profile.display_name}
                              className="w-6 h-6 rounded-full"
                            />
                          )}
                          <span className="text-sm text-muted-foreground truncate">
                            {favorite.splik.profile?.display_name || 'Unknown'}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFromFavorites(favorite.id, favorite.splik_id);
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
                {favorites.map((favorite) => (
                  <Card 
                    key={favorite.id}
                    className="overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div 
                          className="relative w-32 aspect-[9/16] bg-black rounded-lg overflow-hidden cursor-pointer flex-shrink-0"
                          onClick={() => handleVideoClick(favorite.splik.id)}
                        >
                          <VideoContainer
                            src={favorite.splik.video_url}
                            poster={favorite.splik.thumbnail_url}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 
                            className="font-semibold mb-1 cursor-pointer hover:text-primary"
                            onClick={() => handleVideoClick(favorite.splik.id)}
                          >
                            {favorite.splik.title || 'Untitled Video'}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {favorite.splik.description || 'No description'}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{favorite.splik.views?.toLocaleString() || 0} views</span>
                            <span>{favorite.splik.likes_count?.toLocaleString() || 0} likes</span>
                            <span>
                              Saved {new Date(favorite.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-2">
                              {favorite.splik.profile?.avatar_url && (
                                <img
                                  src={favorite.splik.profile.avatar_url}
                                  alt={favorite.splik.profile.display_name}
                                  className="w-8 h-8 rounded-full"
                                />
                              )}
                              <span className="text-sm">
                                {favorite.splik.profile?.display_name || 'Unknown Creator'}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFromFavorites(favorite.id, favorite.splik_id);
                              }}
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
          </>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Favorites;