// src/components/dashboard/VideoUploadModal.tsx
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  X,
  Loader2,
  Scissors,
  Play,
  Pause,
  Volume2,
  VolumeX,
  AlertCircle,
  Film,
  Zap,
  Smartphone,
  Info,
  Utensils,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";

// Optional mood picker (UI only; stored as tag in description)
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// ffmpeg v0.12+ API
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document));
const isMobile =
  typeof navigator !== "undefined" &&
  (/Mobi|Android/i.test(navigator.userAgent) || isIOS);

interface VideoUploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

const MAX_VIDEO_DURATION = 3; // hard cap at save time (server rule)
const DESKTOP_MAX_SIZE = 1024 * 1024 * 1024; // 1GB
const MOBILE_MAX_SIZE = 1024 * 1024 * 1024; // 1GB

// Optional mood choices (not a DB column)
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
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
};

const VideoUploadModal = ({ open, onClose, onUploadComplete }: VideoUploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Category toggle (lights up)
  const [isFood, setIsFood] = useState(false);

  // Optional mood (UI only; stored in description as a tag)
  const [mood, setMood] = useState<string>("");

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeedMBps, setUploadSpeedMBps] = useState(0);
  const [uploadETA, setUploadETA] = useState<string | null>(null);

  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [originalDuration, setOriginalDuration] = useState<number>(0);
  const [processingVideo, setProcessingVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // UNLIMITED trim range while editing (two independent thumbs)
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 3]);

  const [showTrimmer, setShowTrimmer] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // ffmpeg/transcode state
  const [transcoding, setTranscoding] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number>();
  const { toast } = useToast();

  const acceptedFormats = ".mp4,.mov,.flv,.webm,.avi";
  const maxFileSize = isMobile ? MOBILE_MAX_SIZE : DESKTOP_MAX_SIZE;

  const isMOV = (f: File | null) =>
    !!f && (f.type === "video/quicktime" || /\.mov$/i.test(f.name));

  const inferMimeFromName = (name: string): string => {
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "mp4":
        return "video/mp4";
      case "mov":
        return "video/quicktime";
      case "webm":
        return "video/webm";
      case "flv":
        return "video/x-flv";
      case "avi":
        return "video/x-msvideo";
      default:
        return "video/mp4";
    }
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getUser();
  }, []);

  useEffect(() => {
    return () => {
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [videoPreview]);

  const getFFmpeg = useCallback(async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      if (typeof progress === "number") {
        setTranscodeProgress(Math.min(99, Math.round(progress * 100)));
      }
    });
    await ffmpeg.load();
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }, []);

  // FASTER proxy: 720p cap, ultrafast, higher CRF, mono 96k
  const transcodeMovToMp4 = useCallback(async (movFile: File): Promise<Blob> => {
    setTranscoding(true);
    setTranscodeProgress(1);
    try {
      const ffmpeg = await getFFmpeg();
      const inputName = "input.mov";
      const outputName = "output.mp4";

      await ffmpeg.writeFile(inputName, await fetchFile(movFile));

      await ffmpeg.exec([
        "-i", inputName,
        "-vf", "scale='min(1280,iw)':-2",
        "-r", "30",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-c:a", "aac",
        "-ac", "1",
        "-b:a", "96k",
        "-movflags", "+faststart",
        outputName
      ]);

      const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
      return new Blob([data], { type: "video/mp4" });
    } finally {
      setTranscoding(false);
      setTranscodeProgress(0);
    }
  }, [getFFmpeg]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      setVideoError(null);
      setVideoReady(false);
      setProcessingVideo(true);

      const fileType = selectedFile.type || inferMimeFromName(selectedFile.name);
      const validTypes = [
        "video/mp4",
        "video/quicktime",
        "video/x-flv",
        "video/webm",
        "video/x-msvideo",
      ];
      if (!validTypes.includes(fileType)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a video file (MP4, MOV, FLV, WebM, AVI)",
          variant: "destructive",
        });
        setProcessingVideo(false);
        return;
      }

      if (selectedFile.size > maxFileSize) {
        toast({
          title: "File too large",
          description: `Max file size is ${formatBytes(maxFileSize)} on ${isMobile ? "mobile" : "desktop"}.`,
          variant: "destructive",
        });
        setProcessingVideo(false);
        return;
      }

      try {
        setFile(selectedFile);
        const fileName = selectedFile.name.replace(/\.[^/.]+$/, "");
        setTitle(fileName);

        if (/\.(mov)$/i.test(selectedFile.name)) {
          toast({
            title: "Heads up: MOV selected",
            description: "MP4 previews/upload faster. Converting for smooth trimming.",
          });
        } else if (/\.(mp4)$/i.test(selectedFile.name)) {
          toast({
            title: "Great choice",
            description: "MP4 loads and uploads fastest.",
          });
        }

        const prepareFromUrl = async (url: string) => {
          setVideoPreview(url);
          const probe = document.createElement("video");
          probe.preload = "metadata";
          probe.src = url;

          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (ok: boolean, err?: any) => {
              if (settled) return;
              settled = true;
              probe.src = "";
              probe.removeAttribute("src");
              probe.load();
              ok ? resolve() : reject(err);
            };

            probe.onloadedmetadata = () => {
              const duration = probe.duration;
              if (!isFinite(duration) || duration <= 0) {
                finish(false, new Error("Invalid video duration"));
                return;
              }
              setOriginalDuration(duration);

              // Show the trimmer only if the source is longer than 3s
              setShowTrimmer(duration > MAX_VIDEO_DURATION);

              // Initialize the range to [0, min(3, duration)], but we **DON'T** lock it
              const initialEnd = Math.min(MAX_VIDEO_DURATION, duration);
              setTrimRange([0, initialEnd]);
              finish(true);
            };

            probe.onerror = () => finish(false, new Error("Failed to read preview metadata."));
            setTimeout(() => finish(false, new Error("Video metadata timeout")), 8000);
          });
        };

        if (isMOV(selectedFile)) {
          if (isMobile) {
            toast({
              title: "Converting on mobile",
              description: "MOV → MP4 for preview. This can take a bit on phones.",
            });
          }
          const mp4Blob = await transcodeMovToMp4(selectedFile);
          await prepareFromUrl(URL.createObjectURL(mp4Blob));
        } else {
          await prepareFromUrl(URL.createObjectURL(selectedFile));
        }
      } catch (err: any) {
        console.error("Error processing video:", err);
        setVideoError(err?.message || "Failed to process your video.");
        setFile(null);
        if (videoPreview) {
          URL.revokeObjectURL(videoPreview);
          setVideoPreview(null);
        }
      } finally {
        setProcessingVideo(false);
      }
    },
    [toast, maxFileSize, videoPreview, transcodeMovToMp4]
  );

  useEffect(() => {
    if (!videoRef.current || !videoPreview) return;

    const el = videoRef.current;
    const onMeta = () => {
      el.currentTime = trimRange[0];
      setVideoReady(true);
      setVideoError(null);
    };
    const onCanPlay = () => setVideoReady(true);
    const onErr = (e: Event) => {
      console.error("Video preview error:", e);
      setVideoError("Preview failed. You can still upload.");
      setVideoReady(false);
    };

    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("error", onErr);
    };
  }, [videoPreview, trimRange]);

  useEffect(() => {
    if (!videoRef.current || !isPlaying) return;
    const el = videoRef.current;
    const tick = () => {
      // Keep looping within the chosen range while previewing
      if (el.currentTime >= trimRange[1] || el.currentTime < trimRange[0]) {
        el.currentTime = trimRange[0];
      }
      setCurrentTime(el.currentTime);
      if (isPlaying) animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, trimRange]);

  const togglePlayPause = () => {
    if (!videoRef.current || !videoReady || videoError) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (
        videoRef.current.currentTime < trimRange[0] ||
        videoRef.current.currentTime >= trimRange[1]
      ) {
        videoRef.current.currentTime = trimRange[0];
      }
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          videoRef.current!.muted = true;
          setIsMuted(true);
          videoRef.current!
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => setVideoError("Playback failed. Unsupported codec?"));
        });
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const m = !isMuted;
    videoRef.current.muted = m;
    setIsMuted(m);
  };

  // Move the **scrubber** (middle single-thumb) for preview
  const handleSeek = (value: number[]) => {
    if (!videoRef.current) return;
    const [pos] = value;
    const newTime = Math.max(trimRange[0], Math.min(pos, trimRange[1]));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Move the **two trim handles** freely (UNLIMITED range while editing)
  const handleTrimChange = (value: number[]) => {
    if (!value || value.length < 2) return;
    let [start, end] = value as [number, number];

    // Keep handles inside the video duration
    start = Math.max(0, Math.min(start, originalDuration));
    end = Math.max(0, Math.min(end, originalDuration));
    if (end < start) [start, end] = [end, start]; // normalize if crossed

    setTrimRange([start, end]);

    // If the video is playing, keep the currentTime inside the new range
    if (videoRef.current) {
      if (videoRef.current.currentTime < start || videoRef.current.currentTime > end) {
        videoRef.current.currentTime = start;
        setCurrentTime(start);
      }
    }
  };

  /**
   * Upload with real-time progress using Supabase Signed Upload URL + XHR.
   */
  const uploadWithProgress = async (
    bucket: string,
    filePath: string,
    blob: Blob
  ): Promise<{ publicUrl: string }> => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(filePath);
    if (error || !data?.signedUrl) throw error || new Error("Failed to create signed upload URL.");

    setUploading(true);
    setUploadProgress(0);
    setUploadSpeedMBps(0);
    setUploadETA(null);

    const startedAt = Date.now();
    const totalBytes = blob.size;

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", data.signedUrl, true);
      xhr.setRequestHeader("content-type", (blob as any).type || "application/octet-stream");

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const loaded = event.loaded;
        const pct = Math.max(1, Math.floor((loaded / totalBytes) * 100));
        setUploadProgress(pct);

        const seconds = (Date.now() - startedAt) / 1000;
        if (seconds > 0) {
          const MBps = (loaded / (1024 * 1024)) / seconds;
          setUploadSpeedMBps(MBps);

          const remainingBytes = totalBytes - loaded;
          const etaSec = remainingBytes / (MBps * 1024 * 1024);
          const m = Math.floor(etaSec / 60);
          const s = Math.max(0, Math.ceil(etaSec % 60));
          setUploadETA(`${m > 0 ? `${m}m ` : ""}${s}s`);
        }
      };

      xhr.onerror = () => reject(new Error("Upload failed (network error)."));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (status ${xhr.status}).`));
      };

      xhr.send(blob);
    });

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return { publicUrl: pub.publicUrl };
  };

  // ✅ UPDATED: deterministic path + save video_path in DB
  const handleUpload = async () => {
    if (!file || !title) {
      toast({
        title: "Missing information",
        description: "Please provide a video file and title",
        variant: "destructive",
      });
      return;
    }
    if (!currentUser) {
      toast({
        title: "Not authenticated",
        description: "Please login to upload videos",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setUploadProgress(1);

    try {
      // 1) Build deterministic STORAGE PATH (powers per-clip URLs later)
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const videoPath = `${currentUser.id}/${Date.now()}.${ext}`; // e.g. "user-uuid/1725720800123.mp4"

      // 2) Upload the file to the 'spliks' bucket at that exact path
      const { publicUrl } = await uploadWithProgress("spliks", videoPath, file);

      // 3) Enforce trim metadata (existing behavior)
      const selectedStart = Math.max(0, Math.min(trimRange[0], originalDuration));
      const enforcedEnd = Math.min(selectedStart + MAX_VIDEO_DURATION, originalDuration);

      // Build description + optional mood tag (existing behavior)
      const baseDesc =
        (description || "").trim() ||
        (showTrimmer
          ? `Trimmed: ${selectedStart.toFixed(1)}s - ${enforcedEnd.toFixed(1)}s`
          : "");
      const moodTag = mood ? ` #mood=${mood}` : "";
      const finalDescription = (baseDesc ? baseDesc + " " : "") + moodTag;

      // 4) INSERT: SAVE video_path (KEY)
      const payload: any = {
        user_id: currentUser.id,
        title,
        description: finalDescription.trim(),
        duration: MAX_VIDEO_DURATION,
        file_size: file.size,
        mime_type: file.type || inferMimeFromName(file.name),
        status: "active",
        trim_start: selectedStart,
        trim_end: enforcedEnd,
        is_food: isFood,

        // NEW: the storage path we just used
        video_path: videoPath,

        // Keep this for now so existing UI keeps working until Step 4 view
        video_url: publicUrl,
      };

      const { error: dbError } = await supabase.from("spliks").insert(payload);
      if (dbError) throw dbError;

      setUploadProgress(100);
      toast({ title: "Upload successful!", description: "Your 3-second Splik is live." });

      // Reset UI
      setFile(null);
      setTitle("");
      setDescription("");
      setIsFood(false);
      setMood("");
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
      setCurrentTime(0);
      setIsPlaying(false);
      setVideoReady(false);
      setVideoError(null);
      setShowTrimmer(false);
      setTrimRange([0, 3]);
      setUploadSpeedMBps(0);
      setUploadETA(null);

      onUploadComplete();
      onClose();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload video",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        const fakeEvent = { target: { files: [droppedFile] } } as unknown as React.ChangeEvent<HTMLInputElement>;
        handleFileSelect(fakeEvent);
      }
    },
    [handleFileSelect]
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-2">
          <DialogTitle>Upload Your 3-Second Splik</DialogTitle>
          <DialogDescription>
            Share your perfect 3-second moment with the world
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* MP4 preferred notice */}
          <Alert className="border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                <strong>Tip:</strong> <span className="font-semibold">MP4 uploads and previews the fastest.</span> MOVs may convert first for trimming (slower on phones).
              </AlertDescription>
            </div>
          </Alert>

          {isMobile && (
            <Alert className="border-muted-foreground/20 bg-muted/10">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  On mobile, we’ll show a live conversion status if you upload a MOV.
                </AlertDescription>
              </div>
            </Alert>
          )}

          {processingVideo ? (
            <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Processing your video…</h3>
              <p className="text-sm text-muted-foreground">Preparing for 3-second clip</p>
            </div>
          ) : !file ? (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Drop your video here</h3>
              <p className="text-sm text-muted-foreground mb-4">or click to browse files</p>
              <p className="text-xs text-muted-foreground mb-2">
                Supported: MP4 (preferred), MOV, FLV, WebM, AVI (max {formatBytes(maxFileSize)})
              </p>
              <p className="text-xs text-primary font-medium">Videos will be trimmed to exactly 3 seconds on save</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptedFormats}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Video Error Alert */}
              {videoError && (
                <Alert className="border-yellow-500/20 bg-yellow-500/5">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-sm">
                    <strong>Note:</strong> {videoError}
                  </AlertDescription>
                </Alert>
              )}

              {/* MOV transcode progress */}
              {transcoding && (
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium">
                    Converting MOV to MP4 for preview… {transcodeProgress}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    For fastest uploads next time, choose MP4.
                  </p>
                </div>
              )}

              {/* Preview area */}
              <div className="flex justify-center">
                <div className="relative bg-black rounded-xl overflow-hidden" style={{ width: "360px", maxWidth: "100%" }}>
                  <div className="relative" style={{ paddingBottom: "177.78%" }}>
                    {!videoPreview && !transcoding ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-white p-4">
                        <Film className="h-10 w-10 opacity-70 mb-2" />
                        <p className="text-sm font-medium">Preparing preview…</p>
                      </div>
                    ) : null}

                    {videoPreview && !transcoding ? (
                      <>
                        <video
                          ref={videoRef}
                          src={videoPreview}
                          className="absolute inset-0 w-full h-full object-cover"
                          loop={false}
                          muted={isMuted}
                          playsInline
                          preload="metadata"
                          controls={false}
                        />
                        {!videoReady && !videoError && (
                          <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-white" />
                          </div>
                        )}
                        {videoReady && !videoError && (
                          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40">
                            <button
                              onClick={togglePlayPause}
                              className="absolute inset-0 w-full h-full flex items-center justify-center group"
                            >
                              <div
                                className={`${isPlaying ? "opacity-0" : "opacity-100"} group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-4`}
                              >
                                {isPlaying ? (
                                  <Pause className="h-12 w-12 text-white" />
                                ) : (
                                  <Play className="h-12 w-12 text-white ml-1" />
                                )}
                              </div>
                            </button>

                            {/* Bottom controls */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
                              <div className="flex justify-between text-white text-xs font-medium">
                                <span>{formatTime(currentTime - trimRange[0])}</span>
                                <span>
                                  Duration: {(trimRange[1] - trimRange[0]).toFixed(1)}s{" "}
                                  <span className="opacity-80">(saved as exactly 3.0s)</span>
                                </span>
                              </div>

                              {/* Scrubber (single thumb) */}
                              <Slider
                                value={[currentTime]}
                                min={trimRange[0]}
                                max={trimRange[1]}
                                step={0.01}
                                onValueChange={handleSeek}
                                className="w-full"
                              />

                              <button onClick={toggleMute} className="text-white hover:text-primary transition-colors">
                                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Trimmer */}
              {videoPreview && showTrimmer && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Trim (unlimited while editing)</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Start: {trimRange[0].toFixed(1)}s</span>
                      <span className="font-bold text-primary">
                        Range: {(trimRange[1] - trimRange[0]).toFixed(1)}s
                      </span>
                      <span>End: {trimRange[1].toFixed(1)}s</span>
                    </div>

                    {/* Two-thumb range slider – NO 3s restriction */}
                    <Slider
                      value={trimRange}
                      min={0}
                      max={Math.max(originalDuration, 3)}
                      step={0.1}
                      onValueChange={handleTrimChange}
                      className="my-4 touch-none select-none"
                    />

                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTrimRange([0, Math.min(3, originalDuration)]);
                          if (videoRef.current) {
                            videoRef.current.currentTime = 0;
                            setCurrentTime(0);
                          }
                        }}
                      >
                        First 3s
                      </Button>
                      {originalDuration > 6 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const midStart = Math.max(0, originalDuration / 2 - 1.5);
                            setTrimRange([midStart, Math.min(midStart + 3, originalDuration)]);
                            if (videoRef.current) {
                              videoRef.current.currentTime = midStart;
                              setCurrentTime(midStart);
                            }
                          }}
                        >
                          Middle 3s
                        </Button>
                      )}
                      {originalDuration > 3 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const lastStart = Math.max(0, originalDuration - 3);
                            setTrimRange([lastStart, originalDuration]);
                            if (videoRef.current) {
                              videoRef.current.currentTime = lastStart;
                              setCurrentTime(lastStart);
                            }
                          }}
                        >
                          Last 3s
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Title / Description / Category */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter a title for your Splik"
                    disabled={uploading}
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add a description"
                    disabled={uploading}
                  />
                </div>

                {/* Mood (optional) */}
                <div>
                  <Label htmlFor="mood">Mood (optional)</Label>
                  <Select value={mood} onValueChange={setMood} disabled={uploading}>
                    <SelectTrigger id="mood" className="w-full">
                      <SelectValue placeholder="Choose the mood for this video (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {MOOD_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    If chosen, we’ll tag the description with <code>#mood=&lt;value&gt;</code> so viewers can see it.
                  </p>
                </div>

                {/* Food toggle as a lighting button */}
                <div className="mt-2 flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <Utensils className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Food video</p>
                      <p className="text-xs text-muted-foreground">
                        If enabled, this video will also appear on the Food page.
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => setIsFood((v) => !v)}
                    variant={isFood ? "default" : "outline"}
                    className={isFood ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white" : ""}
                    disabled={uploading}
                  >
                    <Utensils className="h-4 w-4 mr-2" />
                    {isFood ? "Food Enabled" : "Mark as Food"}
                  </Button>
                </div>
              </div>

              {/* Upload progress with speed & ETA */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Info className="h-3.5 w-3.5" />
                      <span>
                        Uploading… {uploadProgress}%{uploadETA ? ` • ETA ${uploadETA}` : ""}
                      </span>
                    </div>
                    <div className="font-mono">
                      {uploadSpeedMBps > 0 ? `${uploadSpeedMBps.toFixed(2)} MB/s` : "— MB/s"}
                    </div>
                  </div>
                  <Progress value={uploading ? uploadProgress : 0} className="w-full" />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    if (videoPreview) URL.revokeObjectURL(videoPreview);
                    setVideoPreview(null);
                    setTitle("");
                    setDescription("");
                    setIsFood(false);
                    setMood("");
                    setIsPlaying(false);
                    setVideoReady(false);
                    setVideoError(null);
                    setShowTrimmer(false);
                    setTrimRange([0, 3]);
                    setUploadSpeedMBps(0);
                    setUploadETA(null);
                  }}
                  disabled={uploading}
                >
                  <X className="h-4 w-4 mr-2" />
                  Remove
                </Button>
                <Button onClick={handleUpload} disabled={uploading || !title}>
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    "Upload Splik"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoUploadModal;
