// src/pages/Dashboard/Boosts.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/types/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Supabase = Database;
type BoostedSplik = {
  id: string;
  splik_id: string;
  created_at: string;
  spliks: {
    id: string;
    title: string | null;
    description: string | null;
    thumbnail_url: string | null;
    video_url: string | null;
    created_at: string;
    user_id: string;
    profiles: {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
  boost_count?: number;
};

export default function BoostsPage() {
  const [user, setUser] = useState<any>(null);
  const [boosts, setBoosts] = useState<BoostedSplik[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredBoosts, setFilteredBoosts] = useState<BoostedSplik[]>([]);
  const [activeTab, setActiveTab] = useState("recent");

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getCurrentUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchBoosts();
    }
  }, [user]);

  useEffect(() => {
    // Filter and sort boosts based on search query and active tab
    let filtered = boosts;

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = boosts.filter(boost =>
        boost.spliks?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        boost.spliks?.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        boost.spliks?.profiles?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        boost.spliks?.profiles?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting based on active tab
    if (activeTab === "recent") {
      filtered = [...filtered].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (activeTab === "popular") {
      filtered = [...filtered].sort((a, b) => 
        (b.boost_count || 0) - (a.boost_count || 0)
      );
    } else if (activeTab === "oldest") {
      filtered = [...filtered].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    setFilteredBoosts(filtered);
  }, [searchQuery, boosts, activeTab]);

  const fetchBoosts = async () => {
    try {
      console.log("Fetching boosts for user:", user?.id);
      
      // Step 1: Get user's boosts
      const { data: userBoosts, error: boostsError } = await supabase
        .from("boosts")
        .select("id, splik_id, created_at")
        .eq("user_id", user?.id)
        .order('created_at', { ascending: false });

      console.log("User boosts:", userBoosts, "Error:", boostsError);

      if (boostsError) throw boostsError;
      if (!userBoosts || userBoosts.length === 0) {
        console.log("No boosts found for user");
        setBoosts([]);
        return;
      }

      // Step 2: Get splik details for each boost
      const splikIds = userBoosts.map(boost => boost.splik_id);
      const { data: spliksData, error: spliksError } = await supabase
        .from("spliks")
        .select("id, title, description, thumbnail_url, video_url, created_at, user_id")
        .in("id", splikIds);

      console.log("Spliks data:", spliksData, "Error:", spliksError);

      if (spliksError) throw spliksError;

      // Step 3: Get creator profiles
      const userIds = spliksData?.map(splik => splik.user_id) || [];
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);

      console.log("Profiles data:", profilesData, "Error:", profilesError);

      // Step 4: Combine the data
      const combinedData = userBoosts.map(boost => {
        const splik = spliksData?.find(s => s.id === boost.splik_id);
        const profile = profilesData?.find(p => p.id === splik?.user_id);
        
        return {
          id: boost.id,
          splik_id: boost.splik_id,
          created_at: boost.created_at,
          spliks: splik ? {
            ...splik,
            profiles: profile || null
          } : null,
          boost_count: 0 // Will be calculated next
        };
      });

      // Step 5: Get boost counts for each splik
      const finalData = await Promise.all(
        combinedData.map(async (boost) => {
          if (!boost.spliks?.id) return { ...boost, boost_count: 0 };
          
          const { count } = await supabase
            .from("boosts")
            .select("*", { head: true, count: "exact" })
            .eq("splik_id", boost.spliks.id);
          
          return { ...boost, boost_count: count || 0 };
        })
      );

      console.log("Final combined data:", finalData);
      setBoosts(finalData);
    } catch (error) {
      console.error("Error fetching boosts:", error);
    } finally {
      setLoading(false);
    }
  };

  const removeBoost = async (splikId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("boosts")
        .delete()
        .eq("user_id", user.id)
        .eq("splik_id", splikId);

      if (error) throw error;

      // Update local state
      setBoosts(prev => prev.filter(boost => boost.splik_id !== splikId));
    } catch (error) {
      console.error("Error removing boost:", error);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">My Boosts</h1>
        <p className="text-muted-foreground">
          Spliks you've boosted to show support
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your boosts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Badge variant="secondary" className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          {boosts.length} boosted
        </Badge>
      </div>

      {/* Tabs for sorting */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="recent">Most Recent</TabsTrigger>
          <TabsTrigger value="popular">Most Popular</TabsTrigger>
          <TabsTrigger value="oldest">Oldest First</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredBoosts.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchQuery ? "No boosts found" : "No boosts yet"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery
                    ? "Try adjusting your search terms"
                    : "Start boosting spliks to show your support"
                  }
                </p>
                {!searchQuery && (
                  <Link to="/home">
                    <Button>Discover Spliks</Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredBoosts.map((boost) => {
                if (!boost.spliks) return null;
                
                return (
                  <Card key={boost.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="aspect-video relative bg-muted">
                      {boost.spliks.thumbnail_url ? (
                        <img
                          src={boost.spliks.thumbnail_url}
                          alt={boost.spliks.title || "Splik thumbnail"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-4xl text-muted-foreground">📹</div>
                        </div>
                      )}
                      
                      {/* Boost count badge */}
                      <Badge className="absolute top-2 left-2 bg-orange-500 text-white">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {boost.boost_count || 0}
                      </Badge>

                      <Button
                        size="sm"
                        variant="outline"
                        className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm"
                        onClick={() => removeBoost(boost.splik_id)}
                      >
                        <TrendingDown className="h-4 w-4" />
                      </Button>
                    </div>

                    <CardHeader className="pb-2">
                      <CardTitle className="text-base line-clamp-2">
                        <Link
                          to={`/splik/${boost.splik_id}`}
                          className="hover:text-primary transition-colors"
                        >
                          {boost.spliks.title || "Untitled Splik"}
                        </Link>
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {boost.spliks.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {boost.spliks.description}
                        </p>
                      )}

                      {/* Creator Info */}
                      <div className="flex items-center gap-2">
                        {boost.spliks.profiles?.avatar_url ? (
                          <img
                            src={boost.spliks.profiles.avatar_url}
                            alt={boost.spliks.profiles.display_name || "Creator"}
                            className="w-6 h-6 rounded-full"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                            {(boost.spliks.profiles?.display_name || boost.spliks.profiles?.username || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <Link
                          to={`/creator/${boost.spliks.profiles?.username || boost.spliks.user_id}`}
                          className="text-sm font-medium hover:text-primary transition-colors"
                        >
                          {boost.spliks.profiles?.display_name || boost.spliks.profiles?.username || "Unknown User"}
                        </Link>
                      </div>

                      {/* Stats and timestamps */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {boost.boost_count || 0} boosts
                          </span>
                        </div>
                        <span>
                          Boosted {formatDistanceToNow(new Date(boost.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
