// src/components/dashboard/SimpleUploadModal.tsx
import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, X, Loader2, Film, Image as ImageIcon, Video as VideoIcon,
  AlertCircle, Info, Utensils,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

interface SimpleUploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

type MediaType = "video" | "photo";

const PHOTOS_BUCKET = import.meta.env.VITE_PHOTOS_BUCKET || "vibe_photos";
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

const MOOD_OPTIONS = [
  { value: "happy", label: "Happy" },
  { value: "chill", label: "Chill" },
  { value: "hype", label: "Hype" },
  { value: "romance", label: "Romance" },
  { value: "aww", label: "Aww" },
  { value: "funny", label: "Funny" },
  { value: "excited", label: "Excited" },
  { value: "relaxed", label: "Relaxed" },
  { value: "inspired", label: "Inspired" },
  { value: "nostalgic", label: "Nostalgic" },
  { value: "motivated", label: "Motivated" },
  { value: "surprised", label: "Surprised" },
  { value: "sad", label: "Sad" },
  { value: "angry", label: "Angry" },
  { value: "cozy", label: "Cozy" },
  { value: "neutral", label: "Neutral / Natural" },
] as const;

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
};

const inferMimeType = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4": return "video/mp4";
    case "mov": return "video/quicktime";
    case "webm": return "video/webm";
    case "avi": return "video/x-msvideo";
    case "mkv": return "video/x-matroska";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "application/octet-stream";
  }
};

export default function SimpleUploadModal({ open, onClose, onUploadComplete }: SimpleUploadModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mood, setMood] = useState<string>("");
  const [isFood, setIsFood] = useState(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setMood("");
    setIsFood(false);
    setFile(null);
    setError(null);
    setUploadProgress(0);
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
    }
  }, [preview]);

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setError(null);
    
    // Validate file type
    const isVideo = selectedFile.type.startsWith("video/") || 
                   /\.(mp4|mov|webm|avi|mkv)$/i.test(selectedFile.name);
    const isImage = selectedFile.type.startsWith("image/") || 
                   /\.(jpg|jpeg|png|webp|gif)$/i.test(selectedFile.name);
    
    if (mediaType === "video" && !isVideo) {
      toast({
        title: "Invalid file type",
        description: "Please select a video file (MP4, MOV, WebM, AVI, MKV)",
        variant: "destructive"
      });
      return;
    }
    
    if (mediaType === "photo" && !isImage) {
      toast({
        title: "Invalid file type", 
        description: "Please select an image file (JPG, PNG, WEBP, GIF)",
        variant: "destructive"
      });
      return;
    }

    // Validate file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: `Maximum file size is ${formatBytes(MAX_FILE_SIZE)}`,
        variant: "destructive"
      });
      return;
    }

    // Set file and create preview
    setFile(selectedFile);
    
    // Auto-fill title from filename
    const filename = selectedFile.name.replace(/\.[^/.]+$/, "");
    if (!title) {
      setTitle(filename);
    }

    // Create preview URL
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(URL.createObjectURL(selectedFile));
  }, [mediaType, title, toast, preview]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const uploadFileWithProgress = async (): Promise<string> => {
    if (!file) throw new Error("No file selected");

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("Please log in to upload files");
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const timestamp = Date.now();
    const bucket = mediaType === "photo" ? PHOTOS_BUCKET : "spliks";
    const filePath = `${user.id}/${timestamp}.${extension}`;

    // Get signed URL for upload
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(filePath);
    if (error || !data?.signedUrl) {
      throw error || new Error("Failed to create signed upload URL");
    }

    // Upload with progress tracking
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(Math.min(progress, 90)); // Reserve 10% for database operations
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath);
          resolve(pub.publicUrl);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));

      xhr.open("PUT", data.signedUrl);
      xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
      xhr.setRequestHeader("cache-control", "31536000, immutable");
      xhr.send(file);
    });
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a file and title",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setError(null);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("Please log in to upload");
      }

      // Upload file with progress tracking
      const fileUrl = await uploadFileWithProgress();
      
      setUploadProgress(95);

      // Create description with mood tag
      const moodTag = mood ? ` #mood=${mood}` : "";
      const finalDescription = (description.trim() + " " + moodTag).trim();

      // Insert into database
      const payload: any = {
        user_id: user.id,
        title: title.trim(),
        description: finalDescription || null,
        file_size: file.size,
        mime_type: file.type || inferMimeType(file.name),
        status: "active",
        is_food: isFood,
      };

      // Set video or photo specific fields
      if (mediaType === "video") {
        payload.duration = null; // Will be processed later if needed
        payload.video_path = fileUrl;
        payload.video_url = fileUrl;
        payload.thumbnail_url = null;
        payload.trim_start = null;
        payload.trim_end = null;
        payload.cover_time = null;
      } else {
        payload.duration = null;
        payload.video_path = null;
        payload.video_url = null;
        payload.thumbnail_url = fileUrl;
        payload.trim_start = null;
        payload.trim_end = null;
        payload.cover_time = null;
      }

      const { data: newRecord, error: dbError } = await supabase
        .from("spliks")
        .insert(payload)
        .select("id, created_at")
        .single();

      if (dbError) {
        console.error("Database error:", dbError);
        throw new Error(dbError.message || "Failed to save to database");
      }

      // Add to photos table if it's a photo
      if (mediaType === "photo") {
        try {
          await supabase.from("vibe_photos").insert({
            user_id: user.id,
            photo_url: fileUrl,
            description: finalDescription || null,
            location: null,
          });

          // Dispatch event for real-time updates
          window.dispatchEvent(
            new CustomEvent("vibe-photo-uploaded", {
              detail: { 
                user_id: user.id, 
                photo_url: fileUrl, 
                description: finalDescription || null, 
                location: null 
              }
            })
          );
        } catch (photoError) {
          console.warn("Failed to add to photos table (non-fatal):", photoError);
        }
      }

      // Add to activity feed
      try {
        await supabase.from("right_rail_feed").insert({
          user_id: user.id,
          type: mediaType,
          media_url: fileUrl,
          created_at: newRecord?.created_at || new Date().toISOString(),
        });

        window.dispatchEvent(
          new CustomEvent("activity:append", {
            detail: {
              id: newRecord?.id || `${mediaType}_${Date.now()}`,
              user_id: user.id,
              type: mediaType,
              created_at: newRecord?.created_at || new Date().toISOString(),
            },
          })
        );
      } catch (activityError) {
        console.warn("Failed to add to activity feed (non-fatal):", activityError);
      }

      setUploadProgress(100);
      
      toast({
        title: "Upload successful!",
        description: `Your ${mediaType} has been uploaded successfully.`
      });

      resetForm();
      onUploadComplete();

    } catch (error: any) {
      console.error("Upload error:", error);
      setError(error.message || "Upload failed");
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred during upload",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const mediaTypeSelector = (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Type:</span>
      <div className="flex rounded-md overflow-hidden border">
        <button
          type="button"
          onClick={() => setMediaType("video")}
          className={`px-3 py-1.5 text-sm flex items-center gap-1 transition-colors ${
            mediaType === "video" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
          }`}
        >
          <VideoIcon className="h-4 w-4" />
          Video
        </button>
        <button
          type="button"
          onClick={() => setMediaType("photo")}
          className={`px-3 py-1.5 text-sm flex items-center gap-1 transition-colors ${
            mediaType === "photo" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Photo
        </button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Upload {mediaType === "photo" ? "Photo" : "Video"}</DialogTitle>
              <DialogDescription>
                Share your {mediaType === "photo" ? "photos" : "videos"} with the community
              </DialogDescription>
            </div>
            {mediaTypeSelector}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* File Upload Area */}
          {!file ? (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">
                Drop your {mediaType} here
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                or click to browse files
              </p>
              <p className="text-xs text-muted-foreground">
                Max size: {formatBytes(MAX_FILE_SIZE)}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={mediaType === "video" ? "video/*" : "image/*"}
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
            /* File Preview */
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="relative bg-muted rounded-lg overflow-hidden max-w-md">
                  {mediaType === "video" ? (
                    <div className="relative">
                      <video
                        src={preview || undefined}
                        className="w-full h-auto max-h-64 object-contain"
                        controls
                        preload="metadata"
                      />
                      <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
                        {formatBytes(file.size)}
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <img
                        src={preview || undefined}
                        alt="Preview"
                        className="w-full h-auto max-h-64 object-contain"
                      />
                      <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
                        {formatBytes(file.size)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center">
                <p className="text-sm font-medium">{file.name}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    if (preview) {
                      URL.revokeObjectURL(preview);
                      setPreview(null);
                    }
                  }}
                  className="mt-2"
                >
                  <X className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Enter a title for your ${mediaType}`}
                disabled={uploading}
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description (optional)"
                disabled={uploading}
              />
            </div>

            <div>
              <Label htmlFor="mood">Mood</Label>
              <Select value={mood} onValueChange={setMood} disabled={uploading}>
                <SelectTrigger id="mood">
                  <SelectValue placeholder="Choose the mood (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {MOOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Utensils className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Food Content</p>
                  <p className="text-xs text-muted-foreground">
                    Mark this as food-related content
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => setIsFood(!isFood)}
                variant={isFood ? "default" : "outline"}
                disabled={uploading}
              >
                {isFood ? "Food Enabled" : "Mark as Food"}
              </Button>
            </div>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={resetForm}
              disabled={uploading}
            >
              Reset
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !title.trim() || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                `Upload ${mediaType === "photo" ? "Photo" : "Video"}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
