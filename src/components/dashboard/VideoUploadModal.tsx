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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { VideoRangeSlider } from "./VideoRangeSlider";
import { Slider } from "@/components/ui/slider";

// NEW: ffmpeg.wasm imports
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

/** Simple env detection (no deps) */
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

const MAX_VIDEO_DURATION = 3; // 3 seconds max
const DESKTOP_MAX_SIZE = 500 * 1024 * 1024; // 500MB
const MOBILE_MAX_SIZE = 150 * 1024 * 1024; // safer cap for mobile/iOS

const VideoUploadModal = ({ open, onClose, onUploadComplete }: VideoUploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [originalDuration, setOriginalDuration] = useState<number>(0);
  const [processingVideo, setProcessingVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 3]);
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // NEW: ffmpeg/transcode state
  const [transcoding, setTranscoding] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const ffmpegRef = useRef<ReturnType<typeof createFFmpeg> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number>();
  const { toast } = useToast();

  const acceptedFormats = ".mp4,.mov,.flv,.webm,.avi";
  const maxFileSize = isMobile ? MOBILE_MAX_SIZE : DESKTOP_MAX_SIZE;

  /** Helpers */
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

  // NEW: lazy-load ffmpeg
  const getFFmpeg = useCallback(async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const ffmpeg = createFFmpeg({
      log: false,
      // corePath: "/ffmpeg/ffmpeg-core.js", // optional: host it yourself
    });
    ffmpeg.setProgress(({ ratio }) => {
      if (ratio) setTranscodeProgress(Math.min(99, Math.round(ratio * 100)));
    });
    await ffmpeg.load();
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }, []);

  // NEW: MOV → MP4 proxy for preview
  const transcodeMovToMp4 = useCallback(async (movFile: File): Promise<Blob> => {
    setTranscoding(true);
    setTranscodeProgress(1);
    try {
      const ffmpeg = await getFFmpeg();
      const inputName = "input.mov";
      const outputName = "output.mp4";

      ffmpeg.FS("writeFile", inputName, await fetchFile(movFile));

      await ffmpeg.run(
        "-i", inputName,
        "-vf", "scale='min(1280,iw)':-2",
        "-r", "30",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputName
      );

      const data = ffmpeg.FS("readFile", outputName);
      return new Blob([data.buffer], { type: "video/mp4" });
    } finally {
      setTranscoding(false);
      setTranscodeProgress(0);
    }
  }, [getFFmpeg]);

  /** Auth */
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getUser();
  }, []);

  /** Cleanup object URL + RAF */
  useEffect(() => {
    return () => {
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [videoPreview]);

  /** File select */
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      setVideoError(null);
      setVideoReady(false);
      setProcessingVideo(true);

      // Validate type/size
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
          description: `On ${isMobile ? "mobile" : "desktop"}, the max size is ${isMobile ? "150MB" : "500MB"}.`,
          variant: "destructive",
        });
        setProcessingVideo(false);
        return;
      }

      try {
        setFile(selectedFile);
        const fileName = selectedFile.name.replace(/\.[^/.]+$/, "");
        setTitle(fileName);

        // CHANGED: handle MOV by creating an MP4 preview proxy instead of disabling preview
        if (isMOV(selectedFile)) {
          try {
            toast({
              title: "Preparing preview…",
              description: "Converting MOV to MP4 for smooth preview.",
            });
            const mp4Blob = await transcodeMovToMp4(selectedFile);
            const url = URL.createObjectURL(mp4Blob);
            setVideoPreview(url);

            // Probe metadata from proxy
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
                if (duration > MAX_VIDEO_DURATION) {
                  setShowTrimmer(true);
                  setTrimRange([0, MAX_VIDEO_DURATION]);
                  toast({
                    title: "Select your 3-second clip",
                    description: `Your video is ${duration.toFixed(1)}s long. Use the trimmer to pick any 3s segment.`,
                  });
                } else {
                  setShowTrimmer(false);
                  setTrimRange([0, duration]);
                }
                finish(true);
              };

              probe.onerror = () =>
                finish(false, new Error("Failed to read MP4 preview metadata."));
              setTimeout(
                () => finish(false, new Error("Video metadata timeout")),
                8000
              );
            });
          } catch (e: any) {
            console.error(e);
            setVideoPreview(null);
            setShowTrimmer(false);
            setOriginalDuration(MAX_VIDEO_DURATION);
            setTrimRange([0, MAX_VIDEO_DURATION]);
            setVideoError("We couldn't prepare a preview for this MOV. You can still upload it.");
          }
          setProcessingVideo(false);
          return;
        }

        // Non-MOV: normal preview
        const url = URL.createObjectURL(selectedFile);
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
            if (duration > MAX_VIDEO_DURATION) {
              setShowTrimmer(true);
              setTrimRange([0, MAX_VIDEO_DURATION]);
              toast({
                title: "Select your 3-second clip",
                description: `Your video is ${duration.toFixed(
                  1
                )}s long. Use the trimmer to pick any 3s segment.`,
              });
            } else {
              setShowTrimmer(false);
              setTrimRange([0, duration]);
            }
            finish(true);
          };

          probe.onerror = () =>
            finish(false, new Error(`Failed to read video metadata (${fileType}).`));

          setTimeout(() => finish(false, new Error("Video metadata timeout")), 8000);
        });
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

  /** Bind preview element events (non-null preview only) */
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
    const onStart = () => setVideoError(null);

    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("error", onErr);
    el.addEventListener("loadstart", onStart);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("error", onErr);
      el.removeEventListener("loadstart", onStart);
    };
  }, [videoPreview, trimRange]);

  /** Loop inside trim range */
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
          // fallback to muted (autoplay constraints)
          videoRef.current!.muted = true;
          setIsMuted(true);
          videoRef.current!
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {
              setVideoError("Playback failed. This video may use an unsupported codec.");
            });
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
    const newTime = Math.max(trimRange[0], Math.min(value[0], trimRange[1]));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

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
    setUploadProgress(10);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;

      setUploadProgress(30);

      const { error: uploadError } = await supabase.storage
        .from("spliks")
        .upload(fileName, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

      setUploadProgress(70);

      const {
        data: { publicUrl },
      } = supabase.storage.from("spliks").getPublicUrl(fileName);

      setUploadProgress(85);

      // Always cap at 3s
      const finalStart = showTrimmer ? trimRange[0] : 0;
      const finalEnd = showTrimmer
        ? trimRange[1]
        : Math.min(3, originalDuration || 3);

      const { error: dbError } = await supabase.from("spliks").insert({
        user_id: currentUser.id,
        title,
        description:
          description ||
          (showTrimmer
            ? `Trimmed: ${finalStart.toFixed(1)}s - ${finalEnd.toFixed(1)}s`
            : ""),
        video_url: publicUrl,
        duration: 3,
        file_size: file.size,
        mime_type: file.type || inferMimeFromName(file.name),
        status: "active",
        trim_start: finalStart,
        trim_end: finalEnd,
      });
      if (dbError) throw dbError;

      setUploadProgress(100);
      toast({ title: "Upload successful!", description: "Your 3-second Splik is live." });

      // Reset
      setFile(null);
      setTitle("");
      setDescription("");
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
      setUploadProgress(0);
      setCurrentTime(0);
      setIsPlaying(false);
      setVideoReady(false);
      setVideoError(null);
      setShowTrimmer(false);
      setTrimRange([0, 3]);

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
      setUploadProgress(0);
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
          {/* Info Alert about 3-second limit */}
          <Alert className="border-primary/20 bg-primary/5">
            <Scissors className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              <strong>3-second clips only:</strong> Videos longer than 3 seconds can be trimmed to select the perfect moment.
            </AlertDescription>
          </Alert>

          {processingVideo ? (
            <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Processing your video...</h3>
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
                Supported: MP4, MOV, FLV, WebM, AVI (max {isMobile ? "150MB" : "500MB"})
              </p>
              <p className="text-xs text-primary font-medium">Videos will be trimmed to exactly 3 seconds</p>
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

              {/* NEW: MOV transcode progress */}
              {transcoding && (
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium">Converting MOV to MP4 for preview…</p>
                  <p className="text-xs text-muted-foreground mt-1">{transcodeProgress}%</p>
                </div>
              )}

              {/* Preview area */}
              <div className="flex justify-center">
                <div className="relative bg-black rounded-xl overflow-hidden" style={{ width: "360px", maxWidth: "100%" }}>
                  <div className="relative" style={{ paddingBottom: "177.78%" }}>
                    {/* If no preview yet and not transcoding, show placeholder */}
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
                                className={`${
                                  isPlaying ? "opacity-0" : "opacity-100"
                                } group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-4`}
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
                                <span>{formatTime(trimRange[1] - trimRange[0])}</span>
                              </div>

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
                    <span className="text-sm font-medium">Trim to 3 seconds</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Start: {trimRange[0].toFixed(1)}s</span>
                      <span className="font-bold text-primary">
                        Duration: {(trimRange[1] - trimRange[0]).toFixed(1)}s
                      </span>
                      <span>End: {trimRange[1].toFixed(1)}s</span>
                    </div>

                    <VideoRangeSlider
                      min={0}
                      max={originalDuration}
                      value={trimRange}
                      onChange={(newRange) => {
                        setTrimRange(newRange);
                        if (videoRef.current) {
                          videoRef.current.currentTime = newRange[0];
                          setCurrentTime(newRange[0]);
                        }
                      }}
                      maxRange={3}
                      step={0.1}
                      className="my-4"
                    />

                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTrimRange([0, 3]);
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
                            const midStart = (originalDuration - 3) / 2;
                            setTrimRange([midStart, midStart + 3]);
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
                            const lastStart = originalDuration - 3;
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

              {/* Title / Description */}
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
              </div>

              {/* Upload progress */}
              {uploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} className="w-full" />
                  <p className="text-sm text-center text-muted-foreground">
                    Uploading... {uploadProgress}%
                  </p>
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
                    setIsPlaying(false);
                    setVideoReady(false);
                    setVideoError(null);
                    setShowTrimmer(false);
                    setTrimRange([0, 3]);
                  }}
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
                    // allow upload even if preview had a soft error
                    false
                  }
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
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
