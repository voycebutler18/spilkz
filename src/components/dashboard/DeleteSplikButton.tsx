
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase"; // if your app uses "@/integrations/supabase/client", swap import
import { useToast } from "@/hooks/use-toast"; // if you use "@/components/ui/use-toast", swap import

type Props = {
  splikId: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  onDeleted?: () => void; // e.g., refetch list after delete
};

function parseBucketAndKey(publicUrl?: string | null): { bucket: string; key: string } | null {
  if (!publicUrl) return null;
  // Matches: /storage/v1/object/public/<bucket>/<key...>
  const m = publicUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { bucket: m[1], key: m[2] };
}

export default function DeleteSplikButton({ splikId, videoUrl, thumbnailUrl, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      setBusy(true);

      // 1) Try to remove storage objects first (ignore if they’re missing)
      const targets: Array<{ bucket: string; key: string }> = [];
      const v = parseBucketAndKey(videoUrl);
      if (v) targets.push(v);
      const t = parseBucketAndKey(thumbnailUrl || undefined);
      if (t) targets.push(t);

      // Group by bucket
      const byBucket: Record<string, string[]> = {};
      for (const { bucket, key } of targets) {
        byBucket[bucket] ??= [];
        byBucket[bucket].push(key);
      }
      for (const bucket of Object.keys(byBucket)) {
        const keys = byBucket[bucket];
        if (keys.length) {
          await supabase.storage.from(bucket).remove(keys);
        }
      }

      // 2) Remove DB row (restrict to owner via RLS or equality)
      const { error: dbErr } = await supabase.from("spliks").delete().eq("id", splikId);
      if (dbErr) throw dbErr;

      toast({ title: "Deleted", description: "Your video was deleted." });
      setOpen(false);
      onDeleted?.();
    } catch (err: any) {
      console.error("Delete failed:", err);
      toast({
        title: "Could not delete",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this video?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the video and its file(s). This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
