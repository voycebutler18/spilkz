// src/pages/Index.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import SplikCard from "@/components/splik/SplikCard";
import { useToast } from "@/components/ui/use-toast";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Loader2, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Simple unbiased shuffle */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Take latest N, but break ties with random so refresh ≠ identical */
function recentThenShuffle<T extends { created_at: string }>(rows: T[], limit: number): T[] {
  const sorted = rows
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  // keep the most recent ~100 then shuffle and cut to limit
  const head = sorted.slice(0, Math.max(limit, 30));
  return shuffle(head).slice(0, limit);
}

const FEED_LIMIT = 24;     // total items to show
const BOOST_EVERY = 3;     // 1 boosted per 3 organic
const BOOST_MAX = 10;      // how many boosted items to fetch

type ProfileLite = {
  id?: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type Splik = {
  id: string;
  user_id: string;
  created_at: string;
  boost_score?: number | null;
  // … any other fields your card uses
  profiles?: ProfileLite; // from Supabase relation (if available)
  profile?: ProfileLite;  // normalized for SplikCard
  isBoosted?: boolean;
};

const Index = () => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // keep a stable randomization key per mount (prevents reshuffle mid-session)
  const sessionKey = useMemo(() => Math.random().toString(36).slice(2), []);

  useEffect(() => {
    // current user
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user ?? null));

    // auth changes
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    fetchFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFeed = async () => {
    setLoading(true);

    try {
      // --- 1) Pull recent organic (non-boosted) ---
      // Try with relation first (profiles via FK). If your FK is named differently,
      // adjust `profiles!spliks_user_id_fkey` to your constraint name or just use `profiles(*)`.
      let regular: Splik[] = [];
      {
        const { data, error } = await supabase
          .from("spliks")
          .select(
            `
            *,
            profiles:profiles (
              id, username, display_name, avatar_url
            )
          `
          )
          .order("created_at", { ascending: false })
          .limit(200); // grab a wider pool then trim/shuffle locally

        if (error) throw error;

        // filter non-boosted
        const organic = (data || []).filter((r: any) => (r.boost_score ?? 0) <= 0);

        // recent tie-broken by shuffle; then normalize profile field
        regular = recentThenShuffle<Splik>(organic as Splik[], FEED_LIMIT).map((row) => ({
          ...row,
          profile: row.profiles ?? undefined,
        }));
      }

      // --- 2) Pull boosted (active) ---
      let boosted: Splik[] = [];
      {
        // If you store boosted metadata in a separate table, you can join via RPC or a view.
        // Here we assume spliks has boost_score > 0 and there is a boosted_videos table for validity.
        const { data, error } = await supabase
          .from("spliks")
          .select(
            `
            *,
            boosted_videos!inner (
              boost_level,
              end_date,
              status
            ),
            profiles:profiles (
              id, username, display_name, avatar_url
            )
          `
          )
          .gt("boost_score", 0)
          .eq("boosted_videos.status", "active")
          .gt("boosted_videos.end_date", new Date().toISOString())
          .order("boost_score", { ascending: false })
          .limit(BOOST_MAX);

        if (!error && data) {
          boosted = (data as Splik[]).map((row) => ({
            ...row,
            isBoosted: true,
            profile: row.profiles ?? undefined,
          }));
        }
      }

      // --- 3) Interleave boosted into regular (1 every 3) ---
      const mixed: Splik[] = [];
      let bIdx = 0;
      for (let i = 0; i < regular.length; i++) {
        mixed.push(regular[i]);
        if ((i + 1) % BOOST_EVERY === 0 && bIdx < boosted.length) {
          const ad = boosted[bIdx++];
          mixed.push(ad);
          // track impression safely (use the actual ad we just inserted)
          // ignore result / errors—non-blocking
          supabase.rpc("increment_boost_impression", { p_splik_id: ad.id }).catch(() => {});
        }
        if (mixed.length >= FEED_LIMIT) break;
      }

      // If we still have space (e.g., not enough regulars), top up with leftover boosted or regulars
      while (mixed.length < FEED_LIMIT && bIdx < boosted.length) {
        const ad = boosted[bIdx++];
        mixed.push(ad);
        supabase.rpc("increment_boost_impression", { p_splik_id: ad.id }).catch(() => {});
      }
      while (mixed.length < FEED_LIMIT && mixed.length < regular.length + boosted.length) {
        const next = regular[mixed.length] ?? boosted[mixed.length - regular.length];
        if (!next) break;
        mixed.push(next);
      }

      // --- 4) Final shuffle pass with session key as a light salt so refresh reshuffles ---
      // We keep “recent pool” bias but still change ordering per session/refresh.
      // (If you want strictly deterministic per user, seed by user.id instead.)
      setSpliks(shuffle(mixed));
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to load videos",
        variant: "destructive",
      });
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

  const handleSplik = async (splikId: string) => {
    // hook for future actions
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
    console.log("React:", splikId);
  };

  const handleShare = async (splikId: string) => {
    const url = `${window.location.origin}/video/${splikId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied!",
        description: "The video link has been copied to your clipboard",
      });
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

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
              <p className="text-muted-foreground">Be the first to post a splik!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="w-full px-2 sm:px-4">
            {/* Mobile: Single column, Desktop: Centered single column */}
            <div className="max-w-[400px] sm:max-w-[500px] mx-auto space-y-4 md:space-y-6">
              {spliks.map((splik) => (
                <SplikCard
                  key={splik.id}
                  splik={splik}
                  onSplik={() => handleSplik(splik.id)}
                  onReact={() => handleReact(splik.id)}
                  onShare={() => handleShare(splik.id)}
                />
              ))}
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
            fetchFeed();
            toast({
              title: "Upload successful",
              description: "Your video has been uploaded",
            });
          }}
        />
      )}

      <Footer />
    </div>
  );
};

export default Index;
