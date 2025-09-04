import { useState, useEffect } from "react";
import SplikCard from "@/components/splik/SplikCard";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase, type Splik } from "@/lib/supabase";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const Home = () => {
  const [spliks, setSpliks] = useState<Splik[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSpliks = async () => {
      try {
        const { data, error } = await supabase
          .from('spliks')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Fetch profiles for each splik
        const spliksWithProfiles = await Promise.all(
          (data || []).map(async (splik) => {
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
          description: "Failed to load spliks. Please refresh the page.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSpliks();
  }, [toast]);

  // These are now handled within SplikCard
  const handleSplik = (splikId: string) => {
    // Handled in SplikCard
  };

  const handleReact = (splikId: string) => {
    // Handled in SplikCard
  };

  const handleShare = (splikId: string) => {
    // Handled in SplikCard
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="min-h-[calc(100vh-8rem)]">
        {/* Hero Section */}
        <div className="bg-gradient-to-b from-primary/10 to-background py-12 px-4">
          <div className="container max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
              Short. Sweet. Viral.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Say it in 3 seconds. Share gesture loops that speak louder than words.
            </p>
          </div>
        </div>

        {/* Feed */}
        <div className="container max-w-2xl mx-auto py-8 px-4">
          {spliks.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-xl text-muted-foreground">No videos at the moment</p>
            </div>
          ) : (
            <div className="space-y-8">
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
          )}
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default Home;