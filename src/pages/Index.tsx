// src/pages/Index.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import SplikCard from "@/components/splik/SplikCard";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createHomeFeed } from "@/lib/feed";

type SplikWithProfile = any;

// Rolling window: keep 5 videos “live” at any time
const LOAD_WINDOW = 5;
const HALF = Math.floor(LOAD_WINDOW / 2);

// crypto-safe random
const cRandom = () => {
  if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) {
    const u = new Uint32Array(1);
    (crypto as any).getRandomValues(u);
    return u[0] / 2 ** 32;
  }
  return Math.random();
};

// Fisher–Yates shuffle (always shuffle the full feed each mount)
const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(cRandom() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const Index = () => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [spliks, setSpliks] = useState<SplikWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0); // who’s mostly visible

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Splikz - Short Video Platform";
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchFeed(); // auto-load + auto-shuffle on every visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      // 1) all spliks (recent first from DB)
      const { data: allSpliks, error: spliksError } = await supabase
        .from("spliks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);
      if (spliksError) throw spliksError;

      // 2) boosted subset
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

      // 3) build feed via your helper, then ALWAYS shuffle everything
      let feed = createHomeFeed(allSpliks || [], boostedSpliks || [], {
        userId: user?.id,
        feedType: "home",
        maxResults: 60,
      }) as SplikWithProfile[];

      // 🔀 no pinning — just shuffle the entire result on every mount
      feed = shuffle(feed);

      // 4) record impressions for boosted (fire and forget)
      feed
        .filter((s: any) => s.isBoosted)
        .forEach((s: any) =>
          supabase.rpc("increment_boost_impression", { p_splik_id: s.id }).catch(() => {})
        );

      // 5) attach profiles
      const withProfiles = await Promise.all(
        feed.map(async (s: any) => {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", s.user_id)
            .maybeSingle();
          return { ...s, profile: profileData || undefined };
        })
      );

      setSpliks(withProfiles);
      setActiveIndex(0); // reset window to the first item
    } catch (e) {
      console.error("Error fetching feed:", e);
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

  const handleSplik = async (_id: string) => {};
  const handleReact = async (_id: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to react to videos",
        variant: "default",
      });
      return;
    }
  };
  const handleShare = async (splikId: string) => {
    const url = `${window.location.origin}/video/${splikId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Check out this Splik!", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied!", description: "Copied to clipboard" });
      }
    } catch {
      toast({ title: "Failed to share", description: "Please try again", variant: "destructive" });
    }
  };

  // compute which indices should have a real <video src=...> attached
  const shouldLoadIndex = (i: number) => {
    if (!spliks.length) return false;
    if (activeIndex <= HALF) return i <= Math.min(spliks.length - 1, LOAD_WINDOW - 1);
    const start = Math.max(0, activeIndex - HALF);
    const end = Math.min(spliks.length - 1, activeIndex + HALF);
    return i >= start && i <= end;
  };

  return (
    <div className="w-full">
      {/* Feed */}
      <section className="w-full py-2 md:py-4 flex justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Loading your feed…</p>
          </div>
        ) : spliks.length === 0 ? (
          <Card className="max-w-md mx-auto mx-4">
            <CardContent className="p-8 text-center">
              <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Splikz Yet</h3>
              <p className="text-muted-foreground mb-4">Be the first to post a splik!</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button onClick={handleUploadClick} variant="default">
                  Upload
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="w-full px-2 sm:px-4">
            <div className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
              {spliks.map((splik: any, index: number) => (
                <div key={`${splik.id}-${index}`} className="relative">
                  <SplikCard
                    index={index}
                    shouldLoad={shouldLoadIndex(index)}
                    onPrimaryVisible={(i) => setActiveIndex(i)}
                    splik={splik}
                    onSplik={() => handleSplik(splik.id)}
                    onReact={() => handleReact(splik.id)}
                    onShare={() => handleShare(splik.id)}
                  />
                </div>
              ))}
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
            fetchFeed(); // just reload (auto-shuffle will apply)
            toast({
              title: "Upload successful!",
              description: "Your video is live in the feed.",
            });
          }}
        />
      )}
    </div>
  );
};

export default Index;
