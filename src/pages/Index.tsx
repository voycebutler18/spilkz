// src/pages/Index.tsx
import { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import SplikCard from "@/components/splik/SplikCard";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RefreshCw, Play, Rocket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { createHomeFeed, forceNewRotation } from "@/lib/feed";

type SplikWithProfile = any;

const Index = () => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [spliks, setSpliks] = useState<SplikWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchDynamicFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchDynamicFeed = async (
    showToast = false,
    forceNewShuffle = false
  ) => {
    if (showToast) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      if (forceNewShuffle) {
        forceNewRotation();
      }

      // 1) Get all spliks
      const { data: allSpliks, error: spliksError } = await supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);

      if (spliksError) throw spliksError;

      // 2) Get boosted content (optional)
      const { data: boostedSpliks } = await supabase
        .from("spliks")
        .select(
          `
          *,
          boosted_videos!inner(
            boost_level,
            end_date,
            status
          )
        `
        )
        .gt("boost_score", 0)
        .eq("boosted_videos.status", "active")
        .gt("boosted_videos.end_date", new Date().toISOString())
        .order("boost_score", { ascending: false })
        .limit(15);

      const boostedList = boostedSpliks || [];

      // 3) Build rotated feed
      const rotatedFeed = createHomeFeed(allSpliks || [], boostedList || [], {
        userId: user?.id,
        feedType: "home",
        maxResults: 30,
      });

      // 4) Track boosted impressions
      const boostedInFeed = rotatedFeed.filter((s: any) => s.isBoosted);
      boostedInFeed.forEach((splik: any) => {
        supabase
          .rpc("increment_boost_impression", {
            p_splik_id: splik.id,
          })
          .catch(() => {});
      });

      // 5) Attach profiles
      const spliksWithProfiles = await Promise.all(
        rotatedFeed.map(async (splik: any) => {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", splik.user_id)
            .maybeSingle();

          return {
            ...splik,
            profile: profileData || undefined,
          };
        })
      );

      setSpliks(spliksWithProfiles);

      if (showToast) {
        toast({
          title: forceNewShuffle ? "Feed reshuffled!" : "Feed refreshed!",
          description: forceNewShuffle
            ? "Showing you a completely new mix"
            : "Updated with latest content",
        });
      }
    } catch (error) {
      console.error("Error fetching dynamic feed:", error);
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

  const refreshFeed = () => fetchDynamicFeed(true, true);
  const refreshContent = () => fetchDynamicFeed(true, false);

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
    console.log("Splik:", splikId);
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

    // optimistic update
    setSpliks((prev) =>
      prev.map((s) =>
        s.id === splikId
          ? {
              ...s,
              likes_count: (s.likes_count || 0) + 1,
              user_has_liked: true,
            }
          : s
      )
    );

    try {
      await supabase.rpc("handle_like", { splik_id: splikId });
    } catch (error) {
      console.error("Error liking splik:", error);
      setSpliks((prev) =>
        prev.map((s) =>
          s.id === splikId
            ? {
                ...s,
                likes_count: Math.max(0, (s.likes_count || 0) - 1),
                user_has_liked: false,
              }
            : s
        )
      );
    }
  };

  const handleShare = async (splikId: string) => {
    const url = `${window.location.origin}/video/${splikId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Check out this Splik!",
          url,
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

  const handlePromote = (splikId: string) => {
    // Public naming: "Promote Video". Route it to your dashboard flow.
    // You can read the query param in your dashboard and open a promote modal there.
    navigate(`/dashboard?promote=${encodeURIComponent(splikId)}`);
  };

  return (
    <TooltipProvider>
      <div className="w-full">
        <Helmet>
          <title>Splikz - Short Video Platform</title>
          <meta
            name="description"
            content="Watch and share short vertical videos on Splikz"
          />
          <meta
            name="google-site-verification"
            content="YOUR_VERIFICATION_CODE_HERE"
          />
          <meta name="google-adsense-account" content="ca-pub-7160715578591513" />
          <script
            async
            src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7160715578591513"
            crossOrigin="anonymous"
          />
          <meta property="og:title" content="Splikz - Short Video Platform" />
          <meta
            property="og:description"
            content="Watch and share short vertical videos on Splikz"
          />
          <meta property="og:type" content="website" />
          <meta property="og:url" content="https://splikz.com" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Splikz - Short Video Platform" />
          <meta
            name="twitter:description"
            content="Watch and share short vertical videos on Splikz"
          />
        </Helmet>

        {/* Refresh controls (top of feed) */}
        <div className="w-full pt-2 pb-2">
          <div className="flex justify-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshContent}
              disabled={refreshing || loading}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Updating..." : "Update"}
            </Button>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshFeed}
              disabled={refreshing || loading}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Shuffling..." : "Shuffle"}
            </Button>
          </div>
        </div>

        {/* Feed */}
        <section className="w-full py-2 md:py-4 flex justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">
                Loading your personalized feed...
              </p>
            </div>
          ) : spliks.length === 0 ? (
            <Card className="max-w-md mx-auto mx-4">
              <CardContent className="p-8 text-center">
                <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Splikz Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Be the first to post a splik!
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={refreshContent} variant="outline" disabled={refreshing}>
                    {refreshing ? "Loading..." : "Get Latest"}
                  </Button>
                  <Button onClick={refreshFeed} disabled={refreshing}>
                    {refreshing ? "Shuffling..." : "Shuffle Feed"}
                  </Button>
                  <Button onClick={handleUploadClick} variant="default">
                    Upload
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="w-full px-2 sm:px-4">
              <div className="max-w-[400px] sm:max-w-[500px] mx-auto mb-4">
                <p className="text-xs text-center text-muted-foreground">
                  Showing {spliks.length} videos • New shuffle on each refresh
                </p>
              </div>

              <div className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
                {spliks.map((splik: any, index: number) => {
                  const isOwner = user?.id && splik?.user_id === user.id;

                  return (
                    <div key={`${splik.id}-${index}`} className="relative">
                      {/* Top-left “Fresh” pill */}
                      {splik.isFresh && (
                        <div className="absolute top-2 left-2 z-10 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          Fresh
                        </div>
                      )}

                      {/* Top-right stack: Sponsored pill + Promote button (owner only) */}
                      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-2">
                        {splik.isBoosted && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center rounded-full bg-amber-500 text-white text-[11px] px-2 py-1 font-medium shadow">
                                Sponsored
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs max-w-[220px]">
                              Promoted Video — creators or brands may boost visibility. Ads are mixed
                              into the feed and clearly labeled.
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {isOwner && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-xs rounded-full shadow-sm"
                            onClick={() => handlePromote(splik.id)}
                            aria-label="Promote Video"
                            title="Promote Video"
                          >
                            <Rocket className="h-3.5 w-3.5 mr-1" />
                            Promote Video
                          </Button>
                        )}
                      </div>

                      <SplikCard
                        splik={splik}
                        onSplik={() => handleSplik(splik.id)}
                        onReact={() => handleReact(splik.id)}
                        onShare={() => handleShare(splik.id)}
                      />
                    </div>
                  );
                })}

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
                      <RefreshCw
                        className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                      />
                      {refreshing ? "Loading..." : "Get Latest"}
                    </Button>
                    <Button
                      onClick={refreshFeed}
                      disabled={refreshing}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                      />
                      {refreshing ? "Shuffling..." : "Shuffle Feed"}
                    </Button>
                    <Button onClick={handleUploadClick}>Upload</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Upload Modal */}
        {user && (
          <VideoUploadModal
            open={uploadModalOpen}
            onClose={() => setUploadModalOpen(false)}
            onUploadComplete={() => {
              setUploadModalOpen(false);
              refreshContent();
              toast({
                title: "Upload successful!",
                description:
                  "Your video is now live and appears at the top of feeds",
              });
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
};

export default Index;
