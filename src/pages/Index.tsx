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
    fetchSpliks();
  }, []);

  const fetchSpliks = async () => {
    try {
      // Fetch regular spliks
      const { data: regularSpliks, error: regularError } = await supabase
        .from('spliks')
        .select('*')
        .eq('boost_score', 0) // Non-boosted videos
        .order('created_at', { ascending: false })
        .limit(20);

      if (regularError) throw regularError;

      // Fetch boosted spliks separately
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
        .gt('boost_score', 0) // Only boosted videos
        .eq('boosted_videos.status', 'active')
        .gt('boosted_videos.end_date', new Date().toISOString())
        .order('boost_score', { ascending: false })
        .limit(10);

      if (boostedError) console.log('No boosted videos');

      // Mix boosted content into regular feed
      // Insert 1 boosted video every 3 regular videos (like Instagram ads)
      const mixedSpliks: any[] = [];
      const regularList = regularSpliks || [];
      const boostedList = boostedSpliks || [];
      let boostedIndex = 0;

      regularList.forEach((splik, index) => {
        mixedSpliks.push(splik);
        
        // Insert boosted content every 3 videos
        if ((index + 1) % 3 === 0 && boostedIndex < boostedList.length) {
          mixedSpliks.push({
            ...boostedList[boostedIndex],
            isBoosted: true // Mark as boosted for visual indication
          });
          boostedIndex++;
          
          // Track impression for the boosted video
          supabase.rpc('increment_boost_impression', {
            p_splik_id: boostedList[boostedIndex - 1].id
          }).then(() => {
            console.log('Impression tracked');
          });
        }
      });

      // Fetch profiles separately
      const spliksWithProfiles = await Promise.all(
        mixedSpliks.map(async (splik) => {
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
      console.error('Error fetching spliks:', error);
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
    console.log('React:', splikId);
  };

  const handleShare = async (splikId: string) => {
    const url = `${window.location.origin}/video/${splikId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied!",
        description: "The video link has been copied to your clipboard",
      });
    } catch (error) {
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
            fetchSpliks();
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