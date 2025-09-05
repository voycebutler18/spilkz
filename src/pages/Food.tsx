import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import SplikCard from "@/components/splik/SplikCard";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Loader2, Utensils, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { applySessionRotation, forceNewRotation, type SplikWithScore } from "@/lib/feed";

type Profile = {
  id: string;
  username?: string | null;
  handle?: string | null;
  first_name?: string | null;
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
  likes_count: number | null;
  comments_count: number | null;
  created_at: string;
  is_food: boolean;
  boost_score?: number | null;
  profile?: Profile;
};

export default function Food() {
  const [spliks, setSpliks] = useState<SplikRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

  // Ref for autoplay management
  const foodFeedRef = useRef<HTMLDivElement | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchFood();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel("food-feed")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "spliks", filter: "is_food=eq.true" },
        (payload) => {
          setSpliks((prev) =>
            prev.map((s) =>
              s.id === (payload.new as any).id
                ? {
                    ...s,
                    likes_count: (payload.new as any).likes_count ?? 0,
                    comments_count: (payload.new as any).comments_count ?? 0,
                  }
                : s
            )
          );
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  const fetchFood = async (showRefreshToast: boolean = false, forceNewShuffle: boolean = false) => {
    try {
      if (showRefreshToast) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Force new rotation if requested
      if (forceNewShuffle) {
        forceNewRotation();
      }

      // Get all food videos
      const { data, error } = await supabase
        .from("spliks")
        .select("*")
        .eq("is_food", true)
        .order("created_at", { ascending: false })
        .limit(100); // Get more for better rotation

      if (error) throw error;

      if (data && data.length > 0) {
        // Apply session-based rotation to food videos
        const rotatedSpliks = applySessionRotation(
          data.map(item => ({
            ...item,
            likes_count: item.likes_count || 0,
            comments_count: item.comments_count || 0,
            boost_score: item.boost_score || 0,
            tag: 'food'
          })) as SplikWithScore[],
          { 
            userId: user?.id, 
            category: 'food',
            feedType: 'discovery' as const,
            maxResults: 50 
          }
        );

        // Attach profiles to rotated content
        const withProfiles = await Promise.all(
          rotatedSpliks.map(async (row: any) => {
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", row.user_id)
              .maybeSingle();
            return { ...row, profile: profile || undefined } as SplikRow;
          })
        );

        setSpliks(withProfiles);
      } else {
        setSpliks([]);
      }

      if (showRefreshToast) {
        toast({
          title: forceNewShuffle ? "Food feed reshuffled!" : "Food feed refreshed!",
          description: forceNewShuffle ? "Showing you a completely new mix of food videos" : "Updated with latest food content",
        });
      }
    } catch (e) {
      console.error("Failed to load food videos:", e);
      toast({
        title: "Error",
        description: "Failed to load food videos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Enhanced autoplay manager (same as in Explore)
  const useAutoplayIn = (hostRef: React.RefObject<HTMLElement>, deps: any[] = []) => {
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const videoVisibility = new Map<HTMLVideoElement, number>();
      let currentPlayingVideo: HTMLVideoElement | null = null;
      let isProcessing = false;

      const setupVideoForMobile = (video: HTMLVideoElement) => {
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('webkit-playsinline', 'true');
        video.preload = 'metadata';
        video.load();
        
        video.addEventListener('loadeddata', () => {
          if (video.currentTime === 0) {
            video.currentTime = 0.1;
          }
        }, { once: true });
      };

      const getAllVideos = () => Array.from(host.querySelectorAll("video")) as HTMLVideoElement[];

      const pauseAllVideos = (exceptVideo?: HTMLVideoElement) => {
        getAllVideos().forEach((video) => {
          if (video !== exceptVideo && !video.paused) {
            video.pause();
          }
        });
      };

      const findMostVisibleVideo = (): HTMLVideoElement | null => {
        const visibilityEntries = Array.from(videoVisibility.entries());
        if (visibilityEntries.length === 0) return null;

        const sortedVideos = visibilityEntries.sort((a, b) => b[1] - a[1]);
        const mostVisible = sortedVideos[0];
        
        return mostVisible && mostVisible[1] >= 0.6 ? mostVisible[0] : null;
      };

      const handleVideoPlayback = async () => {
        if (isProcessing) return;
        isProcessing = true;

        try {
          const targetVideo = findMostVisibleVideo();
          
          if (currentPlayingVideo && (videoVisibility.get(currentPlayingVideo) || 0) < 0.45) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
          }

          if (targetVideo && targetVideo !== currentPlayingVideo) {
            pauseAllVideos(targetVideo);
            setupVideoForMobile(targetVideo);

            if (targetVideo.readyState < 2) {
              targetVideo.load();
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (targetVideo.currentTime === 0 && targetVideo.duration > 0) {
              targetVideo.currentTime = 0.1;
            }
            
            try {
              await targetVideo.play();
              currentPlayingVideo = targetVideo;
            } catch (playError) {
              console.log("Autoplay prevented, trying muted:", playError);
              if (!targetVideo.muted) {
                targetVideo.muted = true;
                try {
                  await targetVideo.play();
                  currentPlayingVideo = targetVideo;
                } catch (mutedError) {
                  console.log("Video autoplay blocked even when muted:", mutedError);
                  if (targetVideo.currentTime === 0) {
                    targetVideo.currentTime = 0.1;
                  }
                }
              } else {
                if (targetVideo.currentTime === 0) {
                  targetVideo.currentTime = 0.1;
                }
              }
            }
          } else if (!targetVideo && currentPlayingVideo) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
          }
        } catch (error) {
          console.error("Error handling video playback:", error);
        } finally {
          isProcessing = false;
        }
      };

      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const video = entry.target as HTMLVideoElement;
            videoVisibility.set(video, entry.intersectionRatio);
          }
          
          handleVideoPlayback();
        },
        { 
          root: null, 
          threshold: [0, 0.25, 0.45, 0.6, 0.75, 1.0],
          rootMargin: "10px"
        }
      );

      const initializeVideos = () => {
        getAllVideos().forEach((video) => {
          if (!video.hasAttribute('data-mobile-initialized')) {
            setupVideoForMobile(video);
            video.setAttribute('data-mobile-initialized', 'true');
          }
          
          if (!videoVisibility.has(video)) {
            videoVisibility.set(video, 0);
            intersectionObserver.observe(video);
          }
        });
      };

      const mutationObserver = new MutationObserver((mutations) => {
        let hasNewVideos = false;
        
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const videos = element.querySelectorAll ? element.querySelectorAll("video") : [];
              if (videos.length > 0) {
                hasNewVideos = true;
              }
            }
          });
        });

        if (hasNewVideos) {
          setTimeout(initializeVideos, 100);
        }
      });

      setTimeout(initializeVideos, 100);
      mutationObserver.observe(host, { 
        childList: true, 
        subtree: true 
      });

      return () => {
        intersectionObserver.disconnect();
        mutationObserver.disconnect();
        pauseAllVideos();
        videoVisibility.clear();
        currentPlayingVideo = null;
      };
    }, deps);
  };

  // Apply autoplay to food feed
  useAutoplayIn(foodFeedRef, [spliks]);

  // Refresh functions
  const handleRefresh = () => {
    fetchFood(true, true); // Force new shuffle
  };

  const handleUpdate = () => {
    fetchFood(true, false); // Just refresh content
  };

  // Handle interactions
  const handleSplik = (splikId: string) => {
    console.log('Splik:', splikId);
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
          title: 'Check out this delicious food video!',
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

      {/* Header with refresh controls */}
      <div className="bg-gradient-to-b from-secondary/10 to-background py-8 px-4">
        <div className="container">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Utensils className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">Food</h1>
                <p className="text-muted-foreground">Delicious videos • New shuffle each refresh</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleUpdate}
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Update
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Shuffle
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="w-full py-6 md:py-8">
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Loading delicious content...</p>
            </div>
          ) : spliks.length === 0 ? (
            <Card className="max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <Utensils className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No food videos yet</h3>
                <p className="text-muted-foreground mb-4">
                  Be the first to upload a delicious clip.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={handleUpdate} variant="outline" disabled={refreshing}>
                    {refreshing ? 'Updating...' : 'Get Latest'}
                  </Button>
                  <Button onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? 'Shuffling...' : 'Shuffle Food'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="text-center text-sm text-muted-foreground mb-4">
                Showing {spliks.length} food videos • New shuffle each refresh
              </div>
              <div className="w-full">
                <div ref={foodFeedRef} className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
                  {spliks.map((splik) => (
                    <SplikCard 
                      key={splik.id} 
                      splik={splik as any}
                      onSplik={() => handleSplik(splik.id)}
                      onReact={() => handleReact(splik.id)}
                      onShare={() => handleShare(splik.id)}
                    />
                  ))}
                </div>
              </div>
              <div className="text-center py-6 border-t border-border/40 mt-8">
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button 
                    onClick={handleUpdate}
                    variant="outline"
                    disabled={refreshing}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Updating...' : 'Get Latest'}
                  </Button>
                  <Button 
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Shuffling...' : 'Shuffle Food'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
