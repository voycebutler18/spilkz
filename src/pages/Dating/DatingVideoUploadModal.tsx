// src/pages/Dating/DatingVideoUploadModal.tsx
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, X, Loader2, Camera, Video as VideoIcon, Play, Pause,
  Volume2, VolumeX, ArrowRight, AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  onUploadComplete?: (publicUrl: string) => void;
};

const MAX_VIDEO_DURATION = 3; // seconds
const MAX_FILE_SIZE = 1024 * 1024 * 500; // 500MB
const BUCKET = "dating_videos"; // <- change if needed

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const DatingVideoUploadModal: React.FC<Props> = ({ open, onClose, onUploadComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ————————— ffmpeg (lazy load) —————————
  const ffmpegRef = useRef<any>(null);
  const fetchFileRef = useRef<any>(null);

  const ensureFFmpeg = useCallback(async () => {
    if (ffmpegRef.current && fetchFileRef.current) {
      return { ffmpeg: ffmpegRef.current, fetchFile: fetchFileRef.current };
    }
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { fetchFile } = await import("@ffmpeg/util");
    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }: { progress: number }) => {
      // cap at 90% while transcoding so we can show "uploading" after
      setProgress(Math.min(90, Math.round(progress * 100)));
    });
    await ffmpeg.load();
    ffmpegRef.current = ffmpeg;
    fetchFileRef.current = fetchFile;
    return { ffmpeg, fetchFile };
  }, []);

  const resetState = () => {
    setFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setTrimStart(0);
    setProcessing(false);
    setUploading(false);
    setProgress(0);
    setError(null);
  };

  // ————————— file handling —————————
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setError(null);

    if (!selectedFile.type.startsWith("video/")) {
      setError("Please select a video file (MP4, MOV, WebM).");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File too large. Max size is ${formatBytes(MAX_FILE_SIZE)}.`);
      return;
    }

    setFile(selectedFile);
    const url = URL.createObjectURL(selectedFile);
    setVideoPreview(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  // ————————— video controls —————————
  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      v.currentTime = trimStart;
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          v.muted = true;
          setIsMuted(true);
          v.play().then(() => setIsPlaying(true));
        });
      } else {
        setIsPlaying(true);
      }
    }
  };

  // Loop inside the 3s window
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (v.currentTime >= trimStart + MAX_VIDEO_DURATION) {
        v.currentTime = trimStart;
        if (!isPlaying) v.pause();
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [trimStart, isPlaying]);

  // Fetch metadata when video element loads
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setTrimStart(0);
  };

  // ————————— trim to 3s and upload —————————
  const trimVideoTo3s = useCallback(
    async (sourceFile: File, startTime: number) => {
      const { ffmpeg, fetchFile } = await ensureFFmpeg();
      const input = "in.mp4";
      const output = "out.mp4";

      await ffmpeg.writeFile(input, await fetchFile(sourceFile));
      await ffmpeg.exec([
        "-y",
        "-i",
        input,
        "-ss",
        startTime.toString(),
        "-t",
        "3",
        "-vf",
        "scale='min(1280,iw)':-2",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-ac",
        "1",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        output,
      ]);
      const data = await ffmpeg.readFile(output);
      return new Blob([data], { type: "video/mp4" });
    },
    [ensureFFmpeg]
  );

  const uploadVideo = async () => {
    if (!file) return;
    try {
      setError(null);
      setUploading(true);
      setProgress(5);

      // auth
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw new Error("Please sign in to upload.");

      // transcode/trim
      setProcessing(true);
      const trimmed = await trimVideoTo3s(file, trimStart);
      setProcessing(false);
      setProgress(92);

      // upload to Storage
      const path = `dating_intros/${userRes.user.id}/${Date.now()}.mp4`;
      const { error: upErr } = await supabase
        .storage
        .from(BUCKET)
        .upload(path, trimmed, { contentType: "video/mp4", upsert: false });

      if (upErr) throw upErr;
      setProgress(97);

      // public URL
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      // save on profile
      const { error: dbErr } = await supabase
        .from("dating_profiles")
        .upsert({
          user_id: userRes.user.id,
          video_intro_url: publicUrl,
          video_duration: MAX_VIDEO_DURATION,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (dbErr) throw dbErr;

      setProgress(100);

      // done
      setTimeout(() => {
        onUploadComplete?.(publicUrl);
        resetState();
        onClose();
      }, 400);
    } catch (e: any) {
      console.error("Upload error:", e);
      setError(e?.message || "Upload failed. Please try again.");
      setUploading(false);
      setProcessing(false);
      setProgress(0);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <Card className="w-full max-w-lg bg-zinc-900/95 backdrop-blur-sm border-zinc-700 shadow-2xl">
        <CardHeader className="border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl text-white flex items-center gap-2">
                <Camera className="h-5 w-5 text-fuchsia-500" />
                Add your 3-second intro
              </CardTitle>
              <p className="text-zinc-400 mt-1">Show your personality in 3 seconds</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetState();
                onClose();
              }}
              className="text-zinc-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="space-y-6">
            {error && (
              <Alert className="border-red-500/20 bg-red-500/5">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-300">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {!file ? (
              // ——— Drop/choose area ———
              <div
                className="border-2 border-dashed border-fuchsia-500/50 rounded-xl p-8 text-center bg-gradient-to-br from-fuchsia-500/5 to-purple-500/5 cursor-pointer hover:border-fuchsia-500/70 transition-colors"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-white font-medium mb-2">Upload your video</h3>
                <p className="text-zinc-400 text-sm mb-4">
                  MP4, MOV, WebM supported. We’ll trim to exactly 3 seconds.
                </p>
                <p className="text-xs text-zinc-500">Max file size: {formatBytes(MAX_FILE_SIZE)}</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                  className="hidden"
                />
              </div>
            ) : (
              // ——— Preview + controls ———
              <div className="space-y-4">
                <div className="relative bg-black rounded-xl overflow-hidden">
                  <video
                    ref={videoRef}
                    src={videoPreview ?? undefined}
                    className="w-full h-64 object-cover"
                    muted={isMuted}
                    onLoadedMetadata={onLoadedMetadata}
                    onClick={togglePlayPause}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30">
                    <div className="absolute top-4 right-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-black/50 backdrop-blur-sm border-white/20"
                        onClick={() => {
                          const v = videoRef.current;
                          if (!v) return;
                          v.muted = !isMuted;
                          setIsMuted(!isMuted);
                        }}
                      >
                        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </Button>
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center">
                      <Button
                        size="lg"
                        variant="secondary"
                        className="bg-black/50 backdrop-blur-sm border-white/20 rounded-full w-16 h-16"
                        onClick={togglePlayPause}
                      >
                        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
                      </Button>
                    </div>

                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="flex items-center justify-between text-white text-sm">
                        <span>{Math.max(0, currentTime - trimStart).toFixed(1)}s / 3.0s</span>
                        <span className="bg-fuchsia-500/80 px-2 py-1 rounded-full text-xs font-medium">
                          Dating Intro
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Trim control (only if longer than 3s) */}
                {duration > MAX_VIDEO_DURATION && (
                  <div className="bg-zinc-800/50 rounded-lg p-4">
                    <Label className="text-white font-medium mb-3 block">
                      Choose 3-second segment (video is {duration.toFixed(1)}s)
                    </Label>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, duration - MAX_VIDEO_DURATION)}
                        step={0.1}
                        value={trimStart}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTrimStart(val);
                          const v = videoRef.current;
                          if (v) v.currentTime = val;
                        }}
                        className="w-full h-2 bg-zinc-700 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Start: {trimStart.toFixed(1)}s</span>
                        <span>End: {(trimStart + MAX_VIDEO_DURATION).toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(processing || uploading) && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {processing ? "Processing video…" : `Uploading… ${progress}%`}
                  </span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {file && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    if (videoPreview) URL.revokeObjectURL(videoPreview);
                    setVideoPreview(null);
                    setError(null);
                  }}
                  disabled={processing || uploading}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Choose different video
                </Button>
              )}

              <Button
                className="flex-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
                onClick={file ? uploadVideo : () => fileInputRef.current?.click()}
                disabled={processing || uploading}
              >
                {processing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : file ? (
                  <>
                    Save 3-second intro
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Choose video file
                  </>
                )}
              </Button>
            </div>

            {/* Tips */}
            {!file && (
              <div className="bg-zinc-800/30 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2 text-sm">Tips for a great intro</h4>
                <ul className="space-y-1 text-xs text-zinc-400">
                  <li>• Smile and be yourself — authenticity wins</li>
                  <li>• Good lighting makes a big difference</li>
                  <li>• Keep it natural and conversational</li>
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DatingVideoUploadModal;
