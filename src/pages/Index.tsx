import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import SplikCard from "@/components/splik/SplikCard";
import { useToast } from "@/components/ui/use-toast";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Play } from "lucide-react";

// Helper functions for dynamic feed rotation
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

const seededRandom = (seed: number): number => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const applyRotationAlgorithm = (spliks: any[], userId: string | null = null) => {
  if (!spliks.length) return [];

  // Create a seed that changes every hour + includes user ID for personalization
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDate();
  const userSeed = userId ? hashString(userId) : 0;
  const timeSeed = currentHour + (currentDay * 24);
  const combinedSeed = userSeed + timeSeed;

  // Apply weighted shuffle based on engagement, recency, and randomization
  const weightedSpliks = spliks.map((splik, index) => {
    const ageInHours = (Date.now() - new Date(splik.created_at).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 100 - ageInHours); // Newer content scores higher
    const engagementScore = (splik.likes_count || 0) + (splik.comments_count || 0) * 2;
    const randomFactor = seededRandom(combinedSeed + index) * 60; // Random boost
    const boostFactor = splik.boost_score || 0;
    
    return {
      ...splik,
      rotationScore: recencyScore + engagementScore + randomFactor + boostFactor
    };
  });

  // Sort by rotation score and shuffle within score ranges
  return weightedSpliks
    .sort((a, b) => b.rotationScore - a.rotationScore)
    .slice(0, 40); // Limit for performance
};

const Index = () => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [spliks, setSpliks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchDynamicFeed();
  }, [user]); // Refetch when user changes

  const fetchDynamicFeed = async () => {
    setLoading(true);
    try {
      // 1. Get fresh content (posted in last 3 hours) - always at top
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { data: freshSpliks, error: freshError } = await supabase
        .from('spliks')
        .select('*')
        .gte('created_at', threeHoursAgo)
        .order('created_at', { ascending: false });

      if (freshError && freshError.code !== 'PGRST116') throw freshError;

      // 2. Get older content for rotation
      const { data: olderSpliks, error: olderError } = await supabase
        .from('spliks')
        .select('*')
        .lt('created_at', threeHoursAgo)
        .limit(100); // Get more content for better rotation

      if (olderError && olderError.code !== 'PGRST116') throw olderError;

      // 3. Get boosted content
      const { data: boostedSpliks, error: boostedError } = await supabase
        .from('spliks')
        .select(`
          *,
          boosted_videos!inner(
            boost_level,
            end_date,
            status
          )
        `)
        .gt('boost_score', 0)
        .eq('boosted_videos.status', 'active')
        .gt('boosted_videos.end_date', new Date().toISOString())
        .order('boost_score', { ascending: false })
        .limit(15);

      // Don't throw error for boosted content if none exist

      // 4. Apply rotation algorithm to older content
      const allOlderContent = [...(olderSpliks || [])];
      const rotatedContent = applyRotationAlgorithm(allOlderContent, user?.id);

      // 5. Combine content: Fresh at top, then rotated content with boosted mixed in
      const finalFeed: any[] = [];
      
      // Add fresh content at the top with special flag
      if (freshSpliks?.length) {
        freshSpliks.forEach(splik => {
          finalFeed.push({ ...splik, isFresh: true });
        });
      }

      // Mix rotated content with boosted content
      const boostedList = boostedSpliks || [];
      let boostedIndex = 0;

      rotatedContent.forEach((splik, index) => {
        finalFeed.push(splik);
        
        // Insert boosted content every 4 videos
        if ((index + 1) % 4 === 0 && boostedIndex < boostedList.length) {
          finalFeed.push({
            ...boostedList[boostedIndex],
            isBoosted: true
          });
          boostedIndex++;
          
          // Track impression for the boosted video
          supabase.rpc('increment_boost_impression', {
            p_splik_id: boostedList[boostedIndex - 1].id
          }).catch(() => {
            // Ignore errors for impression tracking
          });
        }
      });

      // 6. Fetch profiles for all spliks
      const spliksWithProfiles = await Promise.all(
        finalFeed.slice(0, 30).map(async (splik) => { // Limit to 30 for initial load
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', splik.user_id)
            .maybeSingle();
          
          return {
            ...splik,
            profile: profileData || undefined
          };
        })
      );

      setSpliks(spliksWithProfiles);
    } catch (error) {
      console.error('Error fetching dynamic feed:', error);
      toast({
        title: "Error",
        description: "Failed to load videos. Please try again.",
        variant: "destructive",
      });
      setSpliks([]);
    } finally {
      setLoading(false);
    }
  };

  // Force refresh feed (can be called on pull-to-refresh or button click)
  const refreshFeed = () => {
    fetchDynamicFeed();
    toast({
      title: "Feed refreshed",
      description: "Showing you a fresh mix of videos",
    });
  };

  const handleUploadClick = () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to upload videos",
        variant: "destructive",
      });
      return;
    }
    setUploadModalOpen(true);
  };

  const handleSplik = async (splikId: string) => {
    console.log('Splik:', splikId);
    // Add your splik logic here
  };

  const handleReact = async (splikId: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to react to videos",
        variant: "default",
      });
      return;
    }
    
    // Update local state optimistically
    setSpliks(prev => prev.map(splik => {
      if (splik.id === splikId) {
        return {
          ...splik,
          likes_count: (splik.likes_count || 0) + 1,
          user_has_liked: true
        };
      }
      return splik;
    }));

    // Send to backend
    try {
      await supabase.rpc('handle_like', { splik_id: splikId });
    } catch (error) {
      console.error('Error liking splik:', error);
      // Revert optimistic update on error
      setSpliks(prev => prev.map(splik => {
        if (splik.id === splikId) {
          return {
            ...splik,
            likes_count: Math.max(0, (splik.likes_count || 0) - 1),
            user_has_liked: false
          };
        }
        return splik;
      }));
    }
  };

  const handleShare = async (splikId: string) => {
    const url = `${window.location.origin}/video/${splikId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Check out this Splik!',
          url: url
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link copied!",
          description: "The video link has been copied to your clipboard",
        });
      }
    } catch (error) {
      toast({
        title: "Failed to share",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Pull to refresh indicator could go here */}
      <div className="w-full pt-2">
        <button 
          onClick={refreshFeed}
          className="mx-auto block text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          Tap to refresh feed
        </button>
      </div>

      {/* Main Content */}
      <main className="w-full py-4 md:py-8 flex justify-center">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : spliks.length === 0 ? (
          <Card className="max-w-md mx-auto mx-4">
            <CardContent className="p-8 text-center">
              <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Splikz Yet</h3>
              <p className="text-muted-foreground mb-4">Be the first to post a splik!</p>
              <button 
                onClick={refreshFeed}
                className="text-primary hover:underline"
              >
                Refresh Feed
              </button>
            </CardContent>
          </Card>
        ) : (
          <div className="w-full px-2 sm:px-4">
            {/* Mobile: Single column, Desktop: Centered single column */}
            <div className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
              {spliks.map((splik, index) => (
                <div key={`${splik.id}-${index}`} className="relative">
                  {/* Fresh content indicator */}
                  {splik.isFresh && (
                    <div className="absolute top-2 left-2 z-10 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                      Fresh
                    </div>
                  )}
                  {/* Boosted content indicator */}
                  {splik.isBoosted && (
                    <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                      Sponsored
                    </div>
                  )}
                  <SplikCard 
                    splik={splik}
                    onSplik={() => handleSplik(splik.id)}
                    onReact={() => handleReact(splik.id)}
                    onShare={() => handleShare(splik.id)}
                  />
                </div>
              ))}
              
              {/* Load more button */}
              <div className="text-center py-4">
                <button 
                  onClick={refreshFeed}
                  className="text-primary hover:underline"
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load More Videos'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Video Upload Modal */}
      {user && (
        <VideoUploadModal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onUploadComplete={() => {
            setUploadModalOpen(false);
            refreshFeed(); // Use refresh to get the new video at the top
            toast({
              title: "Upload successful",
              description: "Your video has been uploaded and is now live!",
            });
          }}
        />
      )}

      <Footer />
    </div>
  );
};

export default Index;
