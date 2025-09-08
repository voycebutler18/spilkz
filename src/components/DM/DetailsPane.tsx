import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Search, BellOff, Shield, Info } from "lucide-react";
import { BlockButton, UnblockButton } from "@/components/DM/BlockButtons";

type ProfileLite = { id: string; username: string | null; display_name: string | null; avatar_url?: string | null };

export default function DetailsPane() {
  const { otherId } = useParams();
  const [profile, setProfile] = useState<ProfileLite | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!otherId) { setProfile(null); return; }
      const { data } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .eq("id", otherId)
        .single();
      setProfile((data as any) || null);
    };
    run();
  }, [otherId]);

  if (!otherId) {
    return (
      <div className="h-[78vh] flex items-center justify-center text-muted-foreground">
        Conversation details
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[78vh]">
      <div className="p-6 border-b flex items-center gap-3">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-12 h-12 rounded-full border" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center font-semibold">
            {(profile?.display_name || profile?.username || "U").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="font-semibold">{profile?.display_name || profile?.username || "User"}</div>
          {profile?.username && <div className="text-xs text-muted-foreground">@{profile.username}</div>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <Button variant="outline" className="w-full justify-start"><Search className="w-4 h-4 mr-2" /> Search in conversation</Button>
        <Button variant="outline" className="w-full justify-start"><BellOff className="w-4 h-4 mr-2" /> Mute notifications</Button>
        <div className="pt-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" /> Safety
          </div>
          <div className="flex gap-2">
            <BlockButton otherUserId={otherId!} />
            <UnblockButton otherUserId={otherId!} />
          </div>
        </div>
        <div className="pt-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-2">
            <Info className="w-3.5 h-3.5" /> About
          </div>
          <div className="text-sm text-muted-foreground">
            Conversation tools and profile details appear here.
          </div>
        </div>
      </div>
    </div>
  );
}
