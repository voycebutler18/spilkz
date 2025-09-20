import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Camera, Upload, Loader2, Trash2, Video, Image as ImageIcon } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // When a new prayer post is created, let the parent prepend it to the feed
  onPosted?: (newPrayer: any) => void;
};

const PRAYER_BUCKET = import.meta.env.VITE_PRAYER_BUCKET || "prayer_media";

const isImage = (file: File) => file.type.startsWith("image/");
const isVideo = (file: File) => file.type.startsWith("video/");

export default function PrayerMediaUpload({ open, onOpenChange, onPosted }: Props) {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);

  const [file, setFile] = useState<File | null>(null);
  const [desc, setDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState<number | null>(null); // seconds for video

  // Keep info about the object we just uploaded (to allow delete-on-cancel)
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // Probe video duration before upload: 3s max
  const probeDuration = async (f: File) => {
    return new Promise<number>((resolve, reject) => {
      const url = URL.createObjectURL(f);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      v.onloadedmetadata = () => {
        const d = v.duration;
        URL.revokeObjectURL(url);
        resolve(isFinite(d) ? d : 0);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Unable to read video metadata"));
      };
    });
  };

  const reset = () => {
    setFile(null);
    setDesc("");
    setDuration(null);
    setUploadedPath(null);
  };

  const onPick = async (f: File | null) => {
    setFile(f);
    setDuration(null);
    if (f && isVideo(f)) {
      try {
        const d = await probeDuration(f);
        setDuration(d);
        if (d > 3.05) {
          toast({
            title: "Video too long",
            description: "Please upload a clip up to 3 seconds.",
            variant: "destructive",
          });
          setFile(null);
        }
      } catch {
        toast({ title: "Couldn’t read video", description: "Try a different file.", variant: "destructive" });
        setFile(null);
      }
    }
  };

  const doUpload = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to upload.", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "No file", description: "Pick a photo or a 3-second video.", variant: "destructive" });
      return;
    }
    if (isVideo(file) && duration && duration > 3.05) {
      toast({ title: "Video too long", description: "Max 3 seconds.", variant: "destructive" });
      return;
    }

    try {
      setUploading(true);
      // 1) upload to dedicated PRAYER bucket
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${user.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from(PRAYER_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(PRAYER_BUCKET).getPublicUrl(path);
      const media_url = pub?.publicUrl;
      if (!media_url) throw new Error("Could not resolve media URL.");

      setUploadedPath(path);

      // 2) insert record into a dedicated table (see SQL below)
      const kind: "photo" | "video" = isImage(file) ? "photo" : "video";

      // Create the prayer post + media row in one go (if your schema keeps media on prayers table, adapt here)
      // Table: prayer_media (id, user_id, kind, media_url, desc, duration, created_at)
      const { data: mediaRow, error: mediaErr } = await supabase
        .from("prayer_media")
        .insert({
          user_id: user.id,
          kind,
          media_url,
          description: desc.trim() || null,
          duration: kind === "video" ? Math.round((duration ?? 0) * 1000) : 0, // ms
        })
        .select("*")
        .single();

      if (mediaErr) throw mediaErr;

      // If your feed uses a `prayers` table, you likely want to create a post entry that references this media
      // Minimal insert that most schemas can tolerate (adjust columns as needed)
      // (Optional) If you don't want a post, remove this block.
      const { data: prayerPost } = await supabase
        .from("prayers")
        .insert({
          user_id: user.id,
          content: desc?.trim() || null,
          media_url,
          media_type: kind,       // if column exists
          media_ref_id: mediaRow?.id, // if column exists
        })
        .select("*")
        .maybeSingle();

      if (onPosted && prayerPost) onPosted(prayerPost);

      toast({ title: "Uploaded!", description: `Your ${kind === "photo" ? "photo" : "video"} is live on Prayers.` });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Upload failed", description: e?.message || "Please try again", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Allow deleting the uploaded object (owner only); use when upload succeeded but user cancels
  const deleteUploadedFromBucket = async () => {
    if (!uploadedPath) return;
    try {
      await supabase.storage.from(PRAYER_BUCKET).remove([uploadedPath]);
      setUploadedPath(null);
    } catch (e) {
      // non-fatal
    }
  };

  const close = async () => {
    // If we uploaded a file to storage but didn’t finalize (no DB row), clean it up
    if (uploadedPath) {
      await deleteUploadedFromBucket();
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload to Daily Prayers</DialogTitle>
          <DialogDescription>Photos or 3-second videos. Stored in a separate bucket.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="file">Choose media</Label>
            <Input
              id="file"
              type="file"
              accept="image/*,video/*"
              onChange={(e) => onPick(e.target.files?.[0] || null)}
            />
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {isImage(file) ? <ImageIcon className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                <span className="truncate">{file.name}</span>
                {isVideo(file) && duration != null && (
                  <span className="ml-auto">{duration.toFixed(2)}s</span>
                )}
              </div>
            )}
            {isVideo(file || ({} as File)) && (
              <p className="text-xs text-muted-foreground">Max length: 3 seconds.</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="desc">Caption (optional)</Label>
            <Textarea
              id="desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value.slice(0, 220))}
              placeholder="Say something about this prayer photo/video (max 220 chars)"
            />
            <div className="text-xs text-muted-foreground text-right">{desc.length}/220</div>
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={close} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={doUpload} disabled={uploading || !file}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload
          </Button>
        </div>

        {uploadedPath && (
          <div className="mt-2 flex items-center justify-between rounded-md border p-2 text-xs">
            <span className="text-muted-foreground truncate">Uploaded: {uploadedPath}</span>
            <Button
              size="sm"
              variant="destructive"
              onClick={deleteUploadedFromBucket}
              title="Delete uploaded file from bucket"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
