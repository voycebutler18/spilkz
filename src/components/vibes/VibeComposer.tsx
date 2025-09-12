import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send, Smile } from "lucide-react";

type Props = {
  // still optional; now we may pass the new row so the page can append instantly
  onPosted?: (newRow?: any) => void;
};

const MOODS = [
  { value: "happy", label: "😄 Happy" },
  { value: "chill", label: "🧘 Chill" },
  { value: "hype",  label: "🔥 Hype" },
  { value: "sad",   label: "😢 Sad" },
  { value: "angry", label: "😤 Angry" },
  { value: "grateful", label: "🙏 Grateful" },
];

export default function VibeComposer({ onPosted }: Props) {
  const { toast } = useToast();
  const [content, setContent] = React.useState("");
  const [mood, setMood] = React.useState<string>("");
  const [posting, setPosting] = React.useState(false);

  const charCount = content.trim().length;
  const remaining = 500 - charCount;

  const handlePost = async () => {
    const text = content.trim();
    if (!text) return;

    setPosting(true);
    try {
      const { data: { user }, error: uerr } = await supabase.auth.getUser();
      if (uerr || !user) {
        toast({ title: "Sign in to post a vibe", variant: "destructive" });
        return;
      }

      // Insert and immediately SELECT the new row
      const { data: inserted, error: ierr } = await supabase
        .from("vibes")
        .insert({
          user_id: user.id,
          content: text,
          mood: mood || null,
        })
        .select("id, user_id, content, mood, created_at")
        .single();

      if (ierr) throw ierr;

      // Hydrate profile so the card can render instantly
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      const newVibe = {
        ...inserted,
        profile: prof ?? null,
      };

      // Clear inputs first so UI feels snappy
      setContent("");
      setMood("");

      // 🔥 Notify parent with the new row so it can append immediately
      onPosted?.(newVibe);

      toast({ title: "Vibe posted ✨" });
    } catch (e: any) {
      toast({
        title: "Couldn't post",
        description: e?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <Textarea
        placeholder="Share how you're feeling..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={500}
        className="min-h-[100px] resize-y"
      />
      <div className="flex items-center gap-3">
        <Select value={mood} onValueChange={setMood}>
          <SelectTrigger className="w-[180px]">
            <Smile className="mr-2 h-4 w-4 opacity-70" />
            <SelectValue placeholder="Add a mood (optional)" />
          </SelectTrigger>
          <SelectContent>
            {MOODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-sm ${remaining < 0 ? "text-red-500" : "text-muted-foreground"}`}>
            {remaining} left
          </span>
          <Button onClick={handlePost} disabled={!charCount || charCount > 500 || posting}>
            {posting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Post
          </Button>
        </div>
      </div>
    </Card>
  );
}
