// src/components/prayers/PrayerMediaUpload.tsx
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Loader2, Image, Video } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export interface PrayerMediaItem {
  id: string;
  user_id: string;
  kind: "photo" | "video";
  url: string;
  thumbnail_url?: string | null;
  duration?: number | null;
  description?: string | null;
  created_at: string;
}

interface PrayerMediaUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (item: PrayerMediaItem) => void;
}

const PRAYER_BUCKET = import.meta.env.VITE_PRAYERS_BUCKET || "prayers_media";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_DURATION = 30; // 30 seconds

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
};

/** Upload a Blob via a signed URL with progress tracking */
async function uploadWithProgress(
  bucket: string, 
  path: string, 
  blob: Blob,
  onProgress?: (progress: number, speedMBps: number, eta: string | null) => void
): Promise<{ publicUrl: string }> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    throw error || new Error("Failed to create signed upload URL.");
  }

  const startedAt = Date.now();
  const totalBytes = blob.size;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.signedUrl, true);
    xhr.setRequestHeader("content-type", blob.type || "application/octet-stream");
    xhr.setRequestHeader("cache-control", "31536000, immutable");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const loaded = event.loaded;
      const pct = Math.max(1, Math.floor((loaded / totalBytes) * 100));

      const seconds = (Date.now() - startedAt) / 1000;
      let speedMBps = 0;
      let eta: string | null = null;

      if (seconds > 0) {
        speedMBps = (loaded / (1024 * 1024)) / seconds;
        const remainingBytes = totalBytes - loaded;
        const etaSec = speedMBps > 0 ? remainingBytes / (speedMBps * 1024 * 1024) : 0;
        const m = Math.floor(etaSec / 60);
        const s = Math.max(0, Math.ceil(etaSec % 60));
        eta = `${m > 0 ? `${m}m ` : ""}${s}s`;
      }

      onProgress(pct, speedMBps, eta);
    };

    xhr.onerror = () => reject(new Error("Upload failed (network error)."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (status ${xhr.status}).`));
    };

    xhr.send(blob);
  });

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: pub.publicUrl };
}

export default function PrayerMediaUpload({ open, onOpenChange, onUploaded }: PrayerMediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeedMBps, setUploadSpeedMBps] = useState(0);
  const [uploadETA, setUploadETA] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setFile(null);
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    setDescription("");
    setVideoDuration(null);
    setUploading(false);
    setUploadProgress(0);
    setUploadSpeedMBps(0);
    setUploadETA(null);
  }, [preview]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum size is ${formatBytes(MAX_FILE_SIZE)}.`);
      return;
    }

    const isVideo = selectedFile.type.startsWith("video/");
    const isImage = selectedFile.type.startsWith("image/");

    if (!isVideo && !isImage) {
      toast.error("Please select an image or video file.");
      return;
    }

    setFile(selectedFile);
    
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);

    // Check video duration
    if (isVideo) {
      const video = document.createElement("video");
      video.src = url;
      video.onloadedmetadata = () => {
        const duration = video.duration;
        setVideoDuration(duration);
        if (duration > MAX_VIDEO_DURATION) {
          toast.error(`Video too long. Maximum duration is ${MAX_VIDEO_DURATION} seconds.`);
        }
      };
      video.onerror = () => {
        console.warn("Could not read video duration");
        setVideoDuration(null);
      };
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setUploadProgress(1);

      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast.error("You must be logged in to upload media.");
        return;
      }

      // Check video duration again
      if (videoDuration && videoDuration > MAX_VIDEO_DURATION) {
        toast.error(`Video is too long (${videoDuration.toFixed(1)}s). Maximum is ${MAX_VIDEO_DURATION}s.`);
        return;
      }

      const isVideo = file.type.startsWith("video/");
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to storage with progress tracking
      const { publicUrl } = await uploadWithProgress(
        PRAYER_BUCKET,
        fileName,
        file,
        (progress, speedMBps, eta) => {
          setUploadProgress(progress);
          setUploadSpeedMBps(speedMBps);
          setUploadETA(eta);
        }
      );

      // Insert into database
      const insertData = {
        user_id: user.id,
        kind: (isVideo ? "video" : "photo") as "photo" | "video",
        url: publicUrl,
        description: description.trim() || null,
        duration: isVideo ? videoDuration : null,
      };

      const { data: dbData, error: dbError } = await supabase
        .from("prayer_media")
        .insert(insertData)
        .select()
        .single();

      if (dbError) {
        console.error("Database error:", dbError);
        // Try to clean up uploaded file
        const pathFromUrl = (url: string) => {
          try {
            const u = new URL(url);
            const parts = u.pathname.split("/");
            const idx = parts.findIndex((p) => p === PRAYER_BUCKET);
            if (idx >= 0) return decodeURIComponent(parts.slice(idx + 1).join("/"));
          } catch {}
          return null;
        };
        const filePath = pathFromUrl(publicUrl);
        if (filePath) {
          await supabase.storage.from(PRAYER_BUCKET).remove([filePath]);
        }
        toast.error("Failed to save media record. Please try again.");
        return;
      }

      setUploadProgress(100);
      toast.success(`${isVideo ? "Video" : "Photo"} uploaded successfully!`);
      
      const mediaItem: PrayerMediaItem = {
        id: String(dbData.id),
        user_id: dbData.user_id,
        kind: dbData.kind,
        url: dbData.url,
        thumbnail_url: dbData.thumbnail_url,
        duration: dbData.duration,
        description: dbData.description,
        created_at: dbData.created_at,
      };

      onUploaded(mediaItem);
      onOpenChange(false);
      resetForm();

    } catch (error) {
      console.error("Upload error:", error);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      onOpenChange(false);
      resetForm();
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const isVideo = file?.type.startsWith("video/");
  const canUpload = file && (!isVideo || !videoDuration || videoDuration <= MAX_VIDEO_DURATION);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Share Prayer Media
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!file ? (
            <div 
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex justify-center mb-4">
                <div className="flex gap-4">
                  <Image className="h-8 w-8 text-muted-foreground" />
                  <Video className="h-8 w-8 text-muted-foreground" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Upload a photo or video (max {MAX_VIDEO_DURATION}s, {formatBytes(MAX_FILE_SIZE)})
              </p>
              <p className="text-xs text-muted-foreground">
                Drop files here or click to browse
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    handleFileSelect(selectedFile);
                  }
                }}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden bg-muted/10 border">
                {isVideo ? (
                  <video
                    src={preview!}
                    className="w-full h-48 object-cover"
                    controls
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={preview!}
                    alt="Preview"
                    className="w-full h-48 object-cover"
                  />
                )}
                
                <button
                  onClick={resetForm}
                  disabled={uploading}
                  className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full hover:bg-black/75"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isVideo && videoDuration && (
                <div className="text-sm text-muted-foreground">
                  Duration: {videoDuration.toFixed(1)}s
                  {videoDuration > MAX_VIDEO_DURATION && (
                    <span className="text-red-500 ml-2">
                      (Too long - max {MAX_VIDEO_DURATION}s)
                    </span>
                  )}
                </div>
              )}

              <Textarea
                placeholder="Add a description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={uploading}
                rows={3}
              />

              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span>Uploading... {uploadProgress}%{uploadETA ? ` • ETA ${uploadETA}` : ""}</span>
                    <span className="font-mono">
                      {uploadSpeedMBps > 0 ? `${uploadSpeedMBps.toFixed(2)} MB/s` : ""}
                    </span>
                  </div>
                  <Progress value={uploadProgress} className="w-full" />
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={uploading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!canUpload || uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    "Upload"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
