import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import VideoFeed from "@/components/ui/VideoFeed";
import { useToast } from "@/components/ui/use-toast";
import RightPhotoRail from "@/components/thoughts/RightPhotoRail"; // ⬅️ add

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
    return () => { mounted = false; sub?.subscription.unsubscribe(); };
  }, []);

  const openUpload = () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to upload videos", variant: "destructive" });
      return;
    }
    setUploadOpen(true);
  };

  return (
    <div className="min-h-[100svh] bg-neutral-950 text-neutral-100">
      {/* Header */}
      <div className="max-w-[110rem] mx-auto px-3 sm:px-4 md:px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Home</h1>
        <Button onClick={openUpload}>Upload</Button>
      </div>

      {/* Grid: main + right rail (desktop), single column on mobile */}
      <div className="max-w-[110rem] mx-auto px-3 sm:px-4 md:px-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 md:gap-6 pb-10">
        <div>
          <VideoFeed user={user} />
        </div>
        <RightPhotoRail /> {/* shows latest photos from Thoughts */}
      </div>

      {user && (
        <VideoUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploadComplete={() => {
            setUploadOpen(false);
            toast({ title: "Upload successful!", description: "Your video is live in the feed." });
          }}
        />
      )}
    </div>
  );
}
