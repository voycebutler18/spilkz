// src/components/dashboard/VideoUploadModal.tsx
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
  Upload, X, Loader2, Scissors, Volume2, VolumeX,
  AlertCircle, Film, Zap, Smartphone, Info, Utensils, Image as ImageIcon, Video as VideoIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
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

const MAX_VIDEO_DURATION = 3;
const DESKTOP_MAX_SIZE = 1024 * 1024 * 1024;
const MOBILE_MAX_SIZE = 1024 * 1024 * 1024;

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

/** Poster from video at a specific time */
async function makePosterFromVideoSource(source: Blob | File, atSeconds = 1): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.crossOrigin = "anonymous";

    const url = URL.createObjectURL(source);
    video.src = url;

    const cleanup = () => {
      try { URL.revokeObjectURL(url); } catch {}
      try { video.pause(); } catch {}
      video.removeAttribute("src");
      video.load();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to read video for poster"));
    };

    video.onloadedmetadata = () => {
      const safeTarget =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(Math.max(0.1, atSeconds), Math.max(0.1, video.duration - 0.1))
          : 1.0;

      const onSeeked = () => {
        try {
          const targetWidth = 720;
          const ratio = video.videoWidth > 0 ? video.videoHeight / video.videoWidth : 16 / 9;
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = Math.round(targetWidth * ratio);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas context failed");
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              cleanup();
              if (blob) resolve(blob);
              else reject(new Error("Poster encode failed"));
            },
            "image/jpeg",
            0.85
          );
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      video.currentTime = safeTarget;
      video.onseeked = onSeeked;
    };
  });
}

/** Upload a Blob via a signed URL */
async function uploadBlob(bucket: string, path: string, blob: Blob): Promise<{ publicUrl: string }> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) throw error || new Error("Failed to create signed upload URL.");

  await fetch(data.signedUrl, {
    method: "PUT",
    headers: {
      "content-type": blob.type || "application/octet-stream",
      "cache-control": "31536000, immutable",
    },
    body: blob,
  });

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: pub.publicUrl };
}

type MediaType = "video" | "photo";

export default function VideoUploadModal({ open, onClose, onUploadComplete }: VideoUploadModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  // === new: media type (video or photo) ===
  const [mediaType, setMediaType] = useState<MediaType>("video");

  // Shared
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isFood, setIsFood] = useState(false);
  const [mood, setMood] = useState<string>("");

  // Video state
  const [file, setFile] = useState<File | null>(null);
  const [uploadSource, setUploadSource] = useState<Blob | File | null>(null);
  const [uploadExt, setUploadExt] = useState<string>("mp4");
  const [uploadMime, setUploadMime] = useState<string>("video/mp4");
  const [frameSource, setFrameSource] = useState<Blob | File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [originalDuration, setOriginalDuration] = useState<number>(0);
  const [processingVideo, setProcessingVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 3]);
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [coverTime, setCoverTime] = useState(1.5);
  const [transcoding, setTranscoding] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Photo state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Upload progress
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeedMBps, setUploadSpeedMBps] = useState(0);
  const [uploadETA, setUploadETA] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number>();

  const acceptedVideoFormats = ".mp4,.mov,.flv,.webm,.avi,.mkv";
  const acceptedImageFormats = ".jpg,.jpeg,.png,.webp,.gif";
  const maxFileSize = isMobile ? MOBILE_MAX_SIZE : DESKTOP_MAX_SIZE;

  const isMOV = (f: File | null) =>
    !!f && (f.type === "video/quicktime" || /\.mov$/i.test(f.name));

  const inferMimeFromName = (name: string): string => {
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "mp4": return "video/mp4";
      case "mov": return "video/quicktime";
      case "webm": return "video/webm";
      case "flv": return "video/x-flv";
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

  // Keep current user in sync
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setCurrentUser(data.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  // === navigate to profile (unchanged behavior) ===
  const goToProfile = useCallback(async () => {
    let uid = currentUser?.id as string | undefined;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id;
    }
    onClose();
    setTimeout(() => {
      navigate(uid ? `/profile/${uid}` : "/profile");
    }, 0);
  }, [currentUser?.id, navigate, onClose]);

  useEffect(() => {
    return () => {
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [videoPreview, imagePreview]);

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

  // Trim video to exactly 3 seconds
  const trimVideoToThreeSeconds = useCallback(async (sourceFile: Blob | File, startTime: number): Promise<Blob> => {
    setTranscodeProgress(1);
    try {
      const ffmpeg = await getFFmpeg();
      const inputName = "input.mp4";
      const outputName = "trimmed.mp4";
      await ffmpeg.writeFile(inputName, await fetchFile(sourceFile));
      await ffmpeg.exec([
        "-i", inputName,
        "-ss", startTime.toString(),
        "-t", "3.0",
        "-vf", "scale='min(1280,iw)':-2",
        "-r", "30",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-c:a", "aac",
        "-ac", "1",
        "-b:a", "96k",
        "-movflags", "+faststart",
        "-avoid_negative_ts", "make_zero",
        outputName
      ]);
      const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
      return new Blob([data], { type: "video/mp4" });
    } finally {
      setTranscodeProgress(0);
    }
  }, [getFFmpeg]);

  // === VIDEO: select handler (more resilient) ===
  const handleVideoSelect = useCallback(async (selectedFile: File) => {
    setVideoError(null);
    setVideoReady(false);
    setProcessingVideo(true);

    const fileType = selectedFile.type || inferMimeFromName(selectedFile.name);
    const validTypes = ["video/mp4", "video/quicktime", "video/x-flv", "video/webm", "video/x-msvideo", "video/x-matroska"];
    if (!validTypes.includes(fileType)) {
      toast({ title: "Invalid file type", description: "Please upload MP4, MOV, FLV, WebM, AVI or MKV", variant: "destructive" });
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

      const safePrepareFromUrl = async (url: string) => {
        setVideoPreview(url);
        // try to probe metadata but DON'T reject on failure
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.src = url;

        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            probe.src = "";
            probe.removeAttribute("src");
            probe.load();
            resolve();
          };
          const timeout = setTimeout(() => {
            console.warn("Video metadata timeout; proceeding with defaults.");
            setOriginalDuration(3);
            setShowTrimmer(false);
            setTrimRange([0, 3]);
            setCoverTime(1.5);
            finish();
          }, 20000);

          probe.onloadedmetadata = () => {
            clearTimeout(timeout);
            const duration = probe.duration;
            if (isFinite(duration) && duration > 0) {
              setOriginalDuration(duration);
              const end = Math.min(MAX_VIDEO_DURATION, duration);
              setShowTrimmer(duration > MAX_VIDEO_DURATION);
              setTrimRange([0, end]);
              setCoverTime(Math.min(duration, end / 2));
            } else {
              setOriginalDuration(3);
              setShowTrimmer(false);
              setTrimRange([0, 3]);
              setCoverTime(1.5);
            }
            finish();
          };
          probe.onerror = () => {
            clearTimeout(timeout);
            console.warn("Failed to read preview metadata; proceeding with defaults.");
            setOriginalDuration(3);
            setShowTrimmer(false);
            setTrimRange([0, 3]);
            setCoverTime(1.5);
            finish();
          };
        });
      };

      if (isMOV(selectedFile)) {
        toast({ title: "Converting MOV → MP4", description: "We'll upload MP4 so it plays everywhere." });
        const mp4Blob = await transcodeMovToMp4(selectedFile);
        setUploadSource(mp4Blob);
        setUploadExt("mp4");
        setUploadMime("video/mp4");
        setFrameSource(mp4Blob);
        await safePrepareFromUrl(URL.createObjectURL(mp4Blob));
      } else {
        setUploadSource(selectedFile);
        const ext = (selectedFile.name.split(".").pop() || "mp4").toLowerCase();
        setUploadExt(ext);
        setUploadMime(selectedFile.type || inferMimeFromName(selectedFile.name));
        setFrameSource(selectedFile);
        await safePrepareFromUrl(URL.createObjectURL(selectedFile));
      }
    } catch (err: any) {
      console.error("Error processing video:", err);
      setVideoError(err?.message || "Failed to process your video.");
      // IMPORTANT: do not reset file here — keep UI out of drop zone
    } finally {
      setProcessingVideo(false);
      setVideoReady(true);
    }
  }, [toast, maxFileSize, transcodeMovToMp4]);

  // === PHOTO: select handler ===
  const handlePhotoSelect = useCallback(async (selectedFile: File) => {
    const type = selectedFile.type || inferMimeFromName(selectedFile.name);
    if (!/^image\//.test(type)) {
      toast({ title: "Invalid file type", description: "Please upload JPG, PNG, WEBP or GIF", variant: "destructive" });
      return;
    }
    if (selectedFile.size > maxFileSize) {
      toast({
        title: "File too large",
        description: `Max file size is ${formatBytes(maxFileSize)} on ${isMobile ? "mobile" : "desktop"}.`,
        variant: "destructive",
      });
      return;
    }
    setImageFile(selectedFile);
    const fileName = selectedFile.name.replace(/\.[^/.]+$/, "");
    if (!title) setTitle(fileName);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(selectedFile));
  }, [imagePreview, maxFileSize, title, toast]);

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

  // Keyboard shortcut: press "C" to set cover at current frame
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "c") setCoverAtCurrent();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentTime, trimRange]);

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

  const handleSeek = (value: number[]) => {
    if (!videoRef.current) return;
    const [pos] = value;
    const newTime = Math.max(trimRange[0], Math.min(pos, trimRange[1]));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  /** Enforce a 3.0s window even if the user drags beyond */
  const handleTrimChange = (value: number[]) => {
    if (!value || value.length < 2) return;
    let [start, end] = value as [number, number];

    start = Math.max(0, Math.min(start, originalDuration));
    end = Math.max(0, Math.min(end, originalDuration));

    const [prevStart, prevEnd] = trimRange;
    const movedStart = Math.abs(start - prevStart) > Math.abs(end - prevEnd);

    const maxEndFromStart = Math.min(start + MAX_VIDEO_DURATION, originalDuration);
    const minStartFromEnd = Math.max(end - MAX_VIDEO_DURATION, 0);

    if (end - start > MAX_VIDEO_DURATION) {
      if (movedStart) end = maxEndFromStart;
      else start = minStartFromEnd;
    }

    setTrimRange([start, end]);

    const savedEnd = Math.min(start + MAX_VIDEO_DURATION, end, originalDuration);
    const mid = start + Math.min(savedEnd - start, MAX_VIDEO_DURATION) / 2;
    setCoverTime(Math.min(savedEnd - 0.05, Math.max(start + 0.05, mid)));

    if (videoRef.current) {
      if (videoRef.current.currentTime < start || videoRef.current.currentTime > savedEnd) {
        videoRef.current.currentTime = start;
        setCurrentTime(start);
      }
    }
  };

  const uploadWithProgress = async (bucket: string, filePath: string, blob: Blob) => {
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
      xhr.setRequestHeader("cache-control", "31536000, immutable");

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
          const etaSec = MBps > 0 ? remainingBytes / (MBps * 1024 * 1024) : 0;
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

  // Cover selection in-video
  const setCoverAtCurrent = () => {
    const start = trimRange[0];
    const end = Math.min(start + MAX_VIDEO_DURATION, trimRange[1], originalDuration);
    const t = Math.min(end - 0.05, Math.max(start + 0.05, currentTime));
    setCoverTime(t);
    toast({ title: "Cover set", description: `Using frame at ${t.toFixed(2)}s` });
  };

  const onVideoDoubleClick = () => setCoverAtCurrent();

  // === Upload handlers ===

  // VIDEO upload
  const uploadVideo = async () => {
    if (!uploadSource || !title) {
      toast({ title: "Missing information", description: "Please provide a video file and title", variant: "destructive" });
      return;
    }

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      toast({ title: "Session required", description: "Please log in to upload videos.", variant: "destructive" });
      return;
    }

    setUploading(true);
    setUploadProgress(1);

    try {
      const selectedStart = Math.min(
        Math.max(0, trimRange[0]),
        Math.max(0, originalDuration - 0.05)
      );
      const enforcedEnd = Math.min(selectedStart + MAX_VIDEO_DURATION, originalDuration);

      toast({ title: "Processing video", description: "Trimming to exactly 3 seconds..." });
      const trimmedVideo = await trimVideoToThreeSeconds(uploadSource, selectedStart);

      const ext = "mp4";
      const videoPath = `${user.id}/${Date.now()}.${ext}`;

      const { publicUrl } = await uploadWithProgress("spliks", videoPath, trimmedVideo);

      const baseDesc =
        (description || "").trim() ||
        `Trimmed: ${selectedStart.toFixed(1)}s - ${enforcedEnd.toFixed(1)}s`;
      const moodTag = mood ? ` #mood=${mood}` : "";
      const finalDescription = (baseDesc ? baseDesc + " " : "") + moodTag;

      // Poster from trimmed video (cover relative to trimmed start)
      let thumbnail_url: string | null = null;
      let savedCoverTime = coverTime - selectedStart;
      try {
        const relativeCoverTime = Math.min(2.95, Math.max(0.05, coverTime - selectedStart));
        const posterBlob = await makePosterFromVideoSource(trimmedVideo, relativeCoverTime);
        const thumbPath = `${user.id}/${Date.now()}_poster.jpg`;
        const poster = await uploadBlob("spliks", thumbPath, posterBlob);
        thumbnail_url = poster.publicUrl || null;
        savedCoverTime = relativeCoverTime;
      } catch (e) {
        console.warn("Poster generation failed:", e);
        savedCoverTime = 1.5;
      }

      const payload: any = {
        user_id: user.id,
        title,
        description: finalDescription.trim(),
        duration: MAX_VIDEO_DURATION,
        file_size: trimmedVideo.size,
        mime_type: "video/mp4",
        status: "active",
        trim_start: 0,
        trim_end: MAX_VIDEO_DURATION,
        is_food: isFood,
        video_path: videoPath,
        video_url: publicUrl,
        thumbnail_url,
        cover_time: savedCoverTime,
      };

      const { data: newSplik, error: dbError } = await supabase
        .from("spliks")
        .insert(payload)
        .select("id, created_at")
        .single();
      if (dbError) throw dbError;

      try {
        await supabase.from("right_rail_feed").insert({
          user_id: user.id,
          type: "video",
          target_id: newSplik?.id ?? null,
          created_at: newSplik?.created_at ?? new Date().toISOString(),
        });
        window.dispatchEvent(
          new CustomEvent("activity:append", {
            detail: {
              id: newSplik?.id ?? `splik_${Date.now()}`,
              user_id: user.id,
              type: "video",
              created_at: newSplik?.created_at ?? new Date().toISOString(),
            },
          })
        );
      } catch (e) {
        console.warn("right_rail_feed insert failed (non-fatal):", e);
      }

      setUploadProgress(100);
      toast({ title: "Upload successful!", description: "Your 3-second Splik has been saved." });
      resetAll();
      onUploadComplete();
      goToProfile();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", description: error.message || "Failed to upload video", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // PHOTO upload
  const uploadPhoto = async () => {
    if (!imageFile || !title) {
      toast({ title: "Missing information", description: "Please provide a photo and title", variant: "destructive" });
      return;
    }

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      toast({ title: "Session required", description: "Please log in to upload photos.", variant: "destructive" });
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(1);

      const ext = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
      const imagePath = `${user.id}/${Date.now()}_image.${ext}`;
      const { publicUrl } = await uploadWithProgress("spliks", imagePath, imageFile);

      const moodTag = mood ? ` #mood=${mood}` : "";
      const finalDescription = ((description || "").trim() + " " + moodTag).trim();

      const payload: any = {
        user_id: user.id,
        title,
        description: finalDescription,
        duration: 0,
        file_size: imageFile.size,
        mime_type: imageFile.type || inferMimeFromName(imageFile.name),
        status: "active",
        trim_start: null,
        trim_end: null,
        is_food: isFood,
        video_path: null,
        video_url: null,                // no video
        thumbnail_url: publicUrl,       // use the image itself as thumbnail
        cover_time: 0,
      };

      const { data: newSplik, error: dbError } = await supabase
        .from("spliks")
        .insert(payload)
        .select("id, created_at")
        .single();
      if (dbError) throw dbError;

      try {
        await supabase.from("right_rail_feed").insert({
          user_id: user.id,
          type: "photo",
          target_id: newSplik?.id ?? null,
          created_at: newSplik?.created_at ?? new Date().toISOString(),
        });
        window.dispatchEvent(
          new CustomEvent("activity:append", {
            detail: {
              id: newSplik?.id ?? `splik_${Date.now()}`,
              user_id: user.id,
              type: "photo",
              created_at: newSplik?.created_at ?? new Date().toISOString(),
            },
          })
        );
      } catch (e) {
        console.warn("right_rail_feed insert failed (non-fatal):", e);
      }

      setUploadProgress(100);
      toast({ title: "Upload successful!", description: "Your photo has been saved." });
      resetAll();
      onUploadComplete();
      goToProfile();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", description: error.message || "Failed to upload photo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (mediaType === "photo") return uploadPhoto();
    return uploadVideo();
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (!droppedFile) return;
    if (mediaType === "photo") {
      handlePhotoSelect(droppedFile);
    } else {
      handleVideoSelect(droppedFile);
    }
  }, [handlePhotoSelect, handleVideoSelect, mediaType]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  const coverPct = (() => {
    const span = Math.max(0.001, trimRange[1] - trimRange[0]);
    return ((coverTime - trimRange[0]) / span) * 100;
  })();

  const resetAll = () => {
    // shared
    setTitle("");
    setDescription("");
    setIsFood(false);
    setMood("");

    // video
    setFile(null);
    setUploadSource(null);
    setUploadExt("mp4");
    setUploadMime("video/mp4");
    setFrameSource(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setVideoReady(false);
    setVideoError(null);
    setShowTrimmer(false);
    setTrimRange([0, 3]);
    setCoverTime(1.5);
    setUploadSpeedMBps(0);
    setUploadETA(null);

    // photo
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setImageFile(null);
  };

  const mediaChoice = (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Upload:</span>
      <div className="flex rounded-md overflow-hidden border">
        <button
          type="button"
          onClick={() => setMediaType("video")}
          className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
            mediaType === "video" ? "bg-primary text-primary-foreground" : "bg-background"
          }`}
        >
          <VideoIcon className="h-4 w-4" />
          Video
        </button>
        <button
          type="button"
          onClick={() => setMediaType("photo")}
          className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
            mediaType === "photo" ? "bg-primary text-primary-foreground" : "bg-background"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Photo
        </button>
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) goToProfile();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Close */}
        <button
          type="button"
          onClick={goToProfile}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20"
          aria-label="Close and go to profile"
        >
          <X className="h-4 w-4" />
        </button>

        <DialogHeader className="sticky top-0 bg-background z-10 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Upload Your {mediaType === "photo" ? "Photo" : "3-Second Splik"}</DialogTitle>
              <DialogDescription>
                {mediaType === "photo"
                  ? "JPEG/PNG/WEBP/GIF supported."
                  : "Pick any moment; we always save a 3.0s clip."}
              </DialogDescription>
            </div>
            {mediaChoice}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <Alert className="border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                <strong>Tip:</strong> MP4 plays everywhere. MOVs convert automatically.
              </AlertDescription>
            </div>
          </Alert>

          {isMobile && mediaType === "video" && (
            <Alert className="border-muted-foreground/20 bg-muted/10">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  On mobile, you'll see a conversion status if you upload a MOV.
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Drop / Pick area */}
          {mediaType === "video" ? (
            processingVideo || transcoding ? (
              <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {transcoding ? "Converting video to MP4..." : "Processing your video…"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {transcoding
                    ? `Converting for compatibility... ${transcodeProgress}%`
                    : "Preparing the 3-second clip"}
                </p>
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
                  Supported: MP4 (preferred), MOV, FLV, WebM, AVI, MKV (max {formatBytes(maxFileSize)})
                </p>
                <p className="text-xs text-primary font-medium">Saved length is always 3.0s</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedVideoFormats}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleVideoSelect(f);
                  }}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-4">
                {videoError && (
                  <Alert className="border-yellow-500/20 bg-yellow-500/5">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-sm">
                      <strong>Note:</strong> {videoError}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Video + overlay controls */}
                <div className="flex justify-center">
                  <div className="relative bg-black rounded-xl overflow-hidden" style={{ width: "360px", maxWidth: "100%" }}>
                    <div className="relative" style={{ paddingBottom: "177.78%" }}>
                      {!videoPreview ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-white p-4">
                          <Film className="h-10 w-10 opacity-70 mb-2" />
                          <p className="text-sm font-medium">Preparing preview…</p>
                        </div>
                      ) : null}

                      {videoPreview ? (
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
                            onDoubleClick={onVideoDoubleClick}
                          />

                          {!videoReady && !videoError && (
                            <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                              <Loader2 className="h-8 w-8 animate-spin text-white" />
                            </div>
                          )}

                          {(!videoError) && (
                            <div className="absolute inset-0 flex flex-col justify-end p-4 gap-2 bg-gradient-to-b from-black/20 via-transparent to-black/40">
                              {/* Play/Pause big target */}
                              <button
                                onClick={togglePlayPause}
                                className="absolute inset-0 w-full h-full"
                                aria-label="Toggle playback"
                              />

                              {/* Bottom controls */}
                              <div className="relative z-10 space-y-2 pointer-events-none">
                                <div className="flex justify-between items-center text-white text-xs font-medium pointer-events-auto">
                                  <span>{formatTime(Math.max(0, currentTime - trimRange[0]))}</span>
                                  <span className="opacity-90">Saved length: <strong>3.0s</strong></span>
                                </div>

                                {/* Seek + cover marker */}
                                <div className="relative" ref={seekBarRef}>
                                  <Slider
                                    value={[Math.min(Math.max(currentTime, trimRange[0]), trimRange[1])]}
                                    min={trimRange[0]}
                                    max={trimRange[1]}
                                    step={0.01}
                                    onValueChange={handleSeek}
                                    className="w-full pointer-events-auto"
                                  />
                                  {/* cover marker */}
                                  <div
                                    className="absolute -top-1 h-4 w-0.5 bg-white/90 rounded-sm pointer-events-none"
                                    style={{ left: `calc(${coverPct}% - 1px)` }}
                                    title="Cover frame"
                                  />
                                </div>

                                <div className="flex items-center justify-between pointer-events-auto">
                                  <button
                                    onClick={toggleMute}
                                    className="bg-black/60 hover:bg-black/70 rounded-full p-2 ring-1 ring-white/40 shadow"
                                    aria-label={isMuted ? "Unmute" : "Mute"}
                                  >
                                    {isMuted ? <VolumeX className="h-5 w-5 text-white" /> : <Volume2 className="h-5 w-5 text-white" />}
                                  </button>

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={(e) => { e.stopPropagation(); setCoverAtCurrent(); }}
                                    className="ml-auto flex items-center gap-2"
                                  >
                                    <ImageIcon className="h-4 w-4" />
                                    Set cover (C / double-tap)
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Trim picker (3s window auto-enforced) */}
                {videoPreview && showTrimmer && (
                  <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Scissors className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Pick any spot (we'll save 3s)</span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Start: {trimRange[0].toFixed(2)}s</span>
                        <span className="font-bold text-primary">Saved: 3.00s</span>
                        <span>End: {Math.min(trimRange[0] + 3, originalDuration || 3).toFixed(2)}s</span>
                      </div>

                      <Slider
                        value={trimRange}
                        min={0}
                        max={Math.max(originalDuration || 3, 3)}
                        step={0.01}
                        onValueChange={handleTrimChange}
                        className="my-4 touch-none select-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            // PHOTO AREA
            <>
              {!imageFile ? (
                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Drop your photo here</h3>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse files</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Supported: JPG, PNG, WEBP, GIF (max {formatBytes(maxFileSize)})
                  </p>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept={acceptedImageFormats}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePhotoSelect(f);
                    }}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="relative rounded-xl overflow-hidden border bg-muted/30">
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagePreview} alt="Preview" className="max-h-[480px] object-contain" />
                    ) : (
                      <div className="p-8 text-center text-sm text-muted-foreground">Preparing preview…</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Details (shared) */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Enter a title for your ${mediaType === "photo" ? "photo" : "Splik"}`}
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

            <div>
              <Label htmlFor="mood">Mood (optional)</Label>
              <Select value={mood} onValueChange={setMood} disabled={uploading}>
                <SelectTrigger id="mood" className="w-full">
                  <SelectValue placeholder="Choose the mood for this post (optional)" />
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
                If chosen, we'll tag the description with <code>#mood=&lt;value&gt;</code>.
              </p>
            </div>

            <div className="mt-2 flex items-center justify-between rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Utensils className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Food {mediaType === "photo" ? "post" : "video"}</p>
                  <p className="text-xs text-muted-foreground">
                    If enabled, this will also appear on the Food page.
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

          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" />
                  <span>
                    {transcodeProgress > 0
                      ? `Processing... ${transcodeProgress}%`
                      : `Uploading... ${uploadProgress}%${uploadETA ? ` • ETA ${uploadETA}` : ""}`
                    }
                  </span>
                </div>
                <div className="font-mono">
                  {uploadSpeedMBps > 0 ? `${uploadSpeedMBps.toFixed(2)} MB/s` : "— MB/s"}
                </div>
              </div>
              <Progress value={transcodeProgress > 0 ? transcodeProgress : uploadProgress} className="w-full" />
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => resetAll()}
              disabled={uploading}
            >
              <X className="h-4 w-4 mr-2" />
              Remove
            </Button>
            <Button
              onClick={handleUpload}
              disabled={
                uploading ||
                !title ||
                (mediaType === "video" ? !file || !uploadSource : !imageFile)
              }
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {transcodeProgress > 0 ? "Processing..." : "Uploading..."}
                </>
              ) : (
                mediaType === "photo" ? "Upload Photo" : "Upload Splik"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
