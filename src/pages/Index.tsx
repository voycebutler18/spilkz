import LeftSidebar from "@/components/layout/LeftSidebar";
import { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import { supabase } from "@/integrations/supabase/client";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import SplikCard from "@/components/splik/SplikCard";
import { useToast } from "@/components/ui/use-toast";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createHomeFeed, forceNewRotation, type SplikWithScore } from "@/lib/feed";

const Index = () => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [spliks, setSpliks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  }, [user]);

  const fetchDynamicFeed = async (showToast = false, forceNewShuffle = false) => {
    if (showToast) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      // Force new rotation if requested
      if (forceNewShuffle) {
        forceNewRotation();
      }

      // 1. Get all spliks for rotation
      const { data: allSpliks, error: spliksError } = await supabase
        .from('spliks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150); // Get more content for better rotation

      if (spliksError) throw spliksError;

      // 2. Get boosted content
      const { data: boostedSpliks } = await supabase
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
      const boostedList = boostedSpliks || [];

      // 3. Apply session-based home feed rotation
      const rotatedFeed = createHomeFeed(
        allSpliks || [],
        boostedList || [],
        { 
          userId: user?.id,
          feedType: 'home',
          maxResults: 30 
        }
      );

      // 4. Track impressions for boosted content
      const boostedInFeed = rotatedFeed.filter(s => s.isBoosted);
      boostedInFeed.forEach(splik => {
        supabase.rpc('increment_boost_impression', {
          p_splik_id: splik.id
        }).catch(() => {
          // Ignore impression tracking errors
        });
      });

      // 5. Fetch profiles for all spliks
      const spliksWithProfiles = await Promise.all(
        rotatedFeed.map(async (splik) => {
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
      
      if (showToast) {
        toast({
          title: forceNewShuffle ? "Feed reshuffled!" : "Feed refreshed!",
          description: forceNewShuffle ? "Showing you a completely new mix" : "Updated with latest content",
        });
      }
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
      setRefreshing(false);
    }
  };

  // Force refresh feed with new shuffle
  const refreshFeed = () => {
    fetchDynamicFeed(true, true);
  };

  // Refresh without new shuffle (just get latest content)
  const refreshContent = () => {
    fetchDynamicFeed(true, false);
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

  const handleSplik = async (splikId) => {
    console.log('Splik:', splikId);
  };

  const handleReact = async (splikId) => {
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

  const handleShare = async (splikId) => {
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
      <Helmet>
        <title>Splikz - Short Video Platform</title>
        <meta name="description" content="Watch and share short vertical videos on Splikz" />
        
        {/* Google Search Console Verification - Replace with your actual verification code */}
        <meta name="google-site-verification" content="YOUR_VERIFICATION_CODE_HERE" />
        
        {/* Google AdSense Verification */}
        <meta name="google-adsense-account" content="ca-pub-7160715578591513" />
        
        {/* Google AdSense Script */}
        <script 
          async 
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7160715578591513"
          crossOrigin="anonymous"
        />
        
        {/* Open Graph tags for better social sharing */}
        <meta property="og:title" content="Splikz - Short Video Platform" />
        <meta property="og:description" content="Watch and share short vertical videos on Splikz" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://splikz.com" />
        
        {/* Twitter Card tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Splikz - Short Video Platform" />
        <meta name="twitter:description" content="Watch and share short vertical videos on Splikz" />
      </Helmet>

      <Header />

      {/* ---- LAYOUT: Sidebar + Center content ---- */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 md:grid-cols-[224px_1fr]">
        {/* Left Sidebar (fixed/sticky component) */}
        <LeftSidebar />

        {/* Center Column (your existing content) */}
        <div>
          {/* Enhanced refresh controls */}
          <div className="w-full pt-2 pb-2">
            <div className="container flex justify-center gap-2">
              <Button 
                variant="ghost"
                size="sm"
                onClick={refreshContent}
                disabled={refreshing || loading}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Updating...' : 'Update'}
              </Button>
              <div className="h-4 w-px bg-border"></div>
              <Button 
                variant="ghost"
                size="sm"
                onClick={refreshFeed}
                disabled={refreshing || loading}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Shuffling...' : 'Shuffle'}
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <main className="w-full py-4 md:py-8 flex justify-center">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Loading your personalized feed...</p>
              </div>
            ) : spliks.length === 0 ? (
              <Card className="max-w-md mx-auto mx-4">
                <CardContent className="p-8 text-center">
                  <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Splikz Yet</h3>
                  <p className="text-muted-foreground mb-4">Be the first to post a splik!</p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button 
                      onClick={refreshContent}
                      variant="outline"
                      disabled={refreshing}
                    >
                      {refreshing ? 'Loading...' : 'Get Latest'}
                    </Button>
                    <Button 
                      onClick={refreshFeed}
                      disabled={refreshing}
                    >
                      {refreshing ? 'Shuffling...' : 'Shuffle Feed'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="w-full px-2 sm:px-4">
                {/* Content info */}
                <div className="max-w-[400px] sm:max-w-[500px] mx-auto mb-4">
                  <p className="text-xs text-center text-muted-foreground">
                    Showing {spliks.length} videos • New shuffle on each refresh
                  </p>
                </div>
                
                {/* Mobile: Single column, Desktop: Centered single column */}
                <div className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
                  {spliks.map((splik, index) => (
                    <div key={`${splik.id}-${index}`} className="relative">
                      {/* Fresh content indicator */}
                      {splik.isFresh && (
                        <div className="absolute top-2 left-2 z-10 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          Fresh
                        </div>
                      )}
                      {/* Boosted content indicator */}
                      {splik.isBoosted && (
                        <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-medium">
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
                  
                  {/* Load more section with both options */}
                  <div className="text-center py-6 border-t border-border/40">
                    <p className="text-sm text-muted-foreground mb-3">
                      Want to see more?
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <Button 
                        onClick={refreshContent}
                        variant="outline"
                        disabled={refreshing}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Loading...' : 'Get Latest'}
                      </Button>
                      <Button 
                        onClick={refreshFeed}
                        disabled={refreshing}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Shuffling...' : 'Shuffle Feed'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Video Upload Modal */}
      {user && (
        <VideoUploadModal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onUploadComplete={() => {
            setUploadModalOpen(false);
            refreshContent(); // Refresh to show new video
            toast({
              title: "Upload successful!",
              description: "Your video is now live and appears at the top of feeds",
            });
          }}
        />
      )}

      <Footer />
    </div>
  );
};

export default Index;
