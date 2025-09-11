// src/pages/Index.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import VideoFeed from "@/components/ui/VideoFeed";
import { useToast } from "@/components/ui/use-toast";

export default function Index() {
  const [user, setUser] = useState<any>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { toast } = useToast();

  // Non-blocking auth: do NOT gate the page render on this
  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  const openUpload = () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to upload videos",
        variant: "destructive",
      });
      return;
    }
    setUploadOpen(true);
  };

  return (
    <div className="min-h-[100svh]">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Home</h1>
        <Button onClick={openUpload}>Upload</Button>
      </div>

      {/* The feed paints instantly from Splash cache; refreshes in background */}
      <VideoFeed user={user} />

      {/* Upload modal */}
      {user && (
        <VideoUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploadComplete={() => {
            setUploadOpen(false);
            toast({
              title: "Upload successful!",
              description: "Your video is live in the feed.",
            });
          }}
        />
      )}
    </div>
  );
}
