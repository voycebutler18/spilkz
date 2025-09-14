// src/pages/Index.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
// ✅ Fix: point to the real location
import VideoFeed from "@/components/VideoFeed";
import { useToast } from "@/components/ui/use-toast";
import NotificationBell from "@/components/notifications/NotificationBell";

export default function Index() {
  const [user, setUser] = useState<any>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => mounted && setUser(data.user ?? null));
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Splikz</h1>
          <div className="md:hidden">
            <NotificationBell user={user} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <NotificationBell user={user} />
          </div>
          <Button onClick={openUpload}>Upload</Button>
        </div>
      </div>

      <VideoFeed user={user} />

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
