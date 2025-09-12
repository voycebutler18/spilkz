// src/components/vibes/VibeCard.tsx
import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export type Vibe = {
  id: string;
  user_id: string;
  content: string;
  mood?: string | null;
  created_at: string;
  profile?: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

type Props = {
  vibe: Vibe;
};

export default function VibeCard({ vibe }: Props) {
  const { toast } = useToast();
  const [hypeCount, setHypeCount] = React.useState<number>(0);
  const [hasHyped, setHasHyped] = React.useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { count } = await supabase
        .from("vibe_hype")
        .select("*", { head: true, count: "exact" })
        .eq("vibe_id", vibe.id);
      if (!cancelled) setHypeCount(count || 0);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("vibe_hype")
          .select("id")
          .eq("vibe_id", vibe.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setHasHyped(!!data);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [vibe.id]);

  const toggleHype = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Sign in to hype", variant: "default" });
        return;
      }
      const { data: existing } = await supabase
        .from("vibe_hype")
        .select("id")
        .eq("vibe_id", vibe.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from("vibe_hype").delete().eq("id", existing.id);
        setHasHyped(false);
        setHypeCount((n) => Math.max(0, n - 1));
      } else {
        await supabase.from("vibe_hype").insert({ vibe_id: vibe.id, user_id: user.id });
        setHasHyped(true);
        setHypeCount((n) => n + 1);
      }
    } catch {
      toast({ title: "Couldn't update hype", variant: "destructive" });
    }
  };

  const name =
    vibe.profile?.display_name ||
    vibe.profile?.username ||
    "User";

  const creatorHref = `/creator/${vibe.profile?.username || vibe.user_id}`;
  const initial = (name?.trim()?.charAt(0) || "?").toUpperCase();

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Link to={creatorHref} className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={vibe.profile?.avatar_url || undefined}
              alt={name}
            />
            <AvatarFallback className="font-semibold">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="font-semibold">{name}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(vibe.created_at), { addSuffix: true })}
              {vibe.mood ? ` • ${vibe.mood}` : ""}
            </p>
          </div>
        </Link>

        <Button
          size="sm"
          variant={hasHyped ? "default" : "outline"}
          className={hasHyped ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
          onClick={toggleHype}
        >
          <Flame className="h-4 w-4 mr-1" />
          {hypeCount}
        </Button>
      </div>

      <p className="text-[15px] leading-6 whitespace-pre-wrap">{vibe.content}</p>
    </Card>
  );
}
