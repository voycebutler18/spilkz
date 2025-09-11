import { useState } from "react";
import { createPrayer, PrayerType } from "@/lib/prayers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function PrayerComposer({ onPosted }: { onPosted?: (p: any) => void }) {
  const [type, setType] = useState<PrayerType>("request");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const remaining = 5000 - body.length;

  const handlePost = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      setLoading(true);
      // get the inserted row back from Supabase
      const created = await createPrayer(type, text);
      setBody("");
      toast({ title: "Shared", description: "Your post was published." });
      onPosted?.(created); // <— send row up so the feed can prepend instantly
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={(v)=>setType(v as PrayerType)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="request">Prayer Request</SelectItem>
            <SelectItem value="testimony">Testimony</SelectItem>
            <SelectItem value="quote">Quote / Verse</SelectItem>
          </SelectContent>
        </Select>
        <div className={`ml-auto text-xs ${remaining < 0 ? "text-red-500" : "text-muted-foreground"}`}>
          {remaining}
        </div>
      </div>

      <Textarea
        value={body}
        onChange={(e)=>setBody(e.target.value)}
        rows={5}
        placeholder="Share a prayer request, a testimony, or a verse…"
      />

      <div className="flex justify-end">
        <Button onClick={handlePost} disabled={loading || !body.trim() || body.length > 5000}>
          {loading ? "Posting…" : "Share"}
        </Button>
      </div>
    </div>
  );
}
