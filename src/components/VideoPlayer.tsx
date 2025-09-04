import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

type VideoKind = "main" | "trailer";

export type VideoPlayerProps = {
  // Media sources
  videoUrl?: string;
  trailerUrl?: string;
  playbackId?: string;

  // Visuals
  coverUrl?: string;
  streamThumbnailUrl?: string;
  title: string;
  description?: string;

  // Metadata / UX
  genre?: string;
  contentType: string;

  // Optional stream meta
  streamStatus?: string;
  streamId?: string;

  // Ads / meta (kept for compat)
  monetizationEnabled?: boolean;
  durationSeconds?: number;
  adBreaks?: number[];
  vastTagUrl?: string;
  contentId?: string;

  /** If true, render the player inline (no Dialog). */
  inline?: boolean;

  /** Hide the overlay header (prevents duplicate title lines on pages that show their own title). */
  hideOverlayHeader?: boolean;

  /** Show a delete button for the owner. */
  canDelete?: boolean;
  onDelete?: () => void;
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  trailerUrl,
  playbackId,

  coverUrl,
  streamThumbnailUrl,

  title,
  description,
  genre,
  contentType,

  streamStatus,

  monetizationEnabled,
  durationSeconds,
  adBreaks,
  vastTagUrl,
  contentId,

  inline = false,
  hideOverlayHeader = false,

  canDelete = false,
  onDelete,
}) => {
  const [currentVideo, setCurrentVideo] = useState<VideoKind>("main");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  const hasStreamPlayback = !!playbackId;
  const autoPoster = playbackId
    ? `https://videodelivery.net/${playbackId}/thumbnails/thumbnail.jpg?time=1s&height=720`
    : undefined;
  const displayThumbnail = streamThumbnailUrl || coverUrl || autoPoster;
  const canPlaySomething = hasStreamPlayback || !!videoUrl;

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!inline) return;
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying) setShowControls(false);
      }, 2000);
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [inline, isPlaying]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current
        .play()
        .catch(() => {
          videoRef.current!.muted = true;
          setIsMuted(true);
          videoRef.current!.play().catch(() => {});
        });
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    videoRef.current.muted = next;
    setIsMuted(next);
  };

  const handleVolumeChange = (v: number[]) => {
    const next = v[0];
    setVolume(next);
    if (videoRef.current) {
      videoRef.current.volume = next;
      setIsMuted(next === 0);
    }
  };

  const handleSeek = (v: number[]) => {
    const next = v[0];
    if (!videoRef.current) return;
    if (!isNaN(next) && isFinite(next)) {
      videoRef.current.currentTime = next;
      setCurrentTime(next);
    }
  };

  const skipTime = (sec: number) => {
    if (!videoRef.current) return;
    const next = Math.max(0, Math.min(duration, currentTime + sec));
    videoRef.current.currentTime = next;
    setCurrentTime(next);
  };

  const toggleFullscreen = async () => {
    if (!playerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await playerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (videoRef.current.buffered.length > 0) {
      const end = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
      const dur = videoRef.current.duration;
      if (!isNaN(dur) && dur > 0) setBuffered((end / dur) * 100);
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (!videoRef.current) return;
    if (!isNaN(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
      setCurrentTime(0);
      setVideoError(null);
    }
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const err = e.currentTarget.error;
    let msg = "Video playback failed";
    if (err) {
      switch (err.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          msg = "Video loading was aborted";
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          msg = "Network error occurred while loading video";
          break;
        case MediaError.MEDIA_ERR_DECODE:
          msg = "Video codec not supported. Use H.264 + AAC (yuv420p).";
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          msg = "Video format not supported (use MP4/H.264 + AAC).";
          break;
      }
    }
    setVideoError(msg);
    setIsPlaying(false);
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (t: number) => {
    if (isNaN(t) || !isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const PlayerSurface = (
    <div ref={playerRef} className={`relative w-full h-full bg-black ${isFullscreen ? "video-player-fullscreen" : ""}`}>
      {/* Cloudflare Stream */}
      {hasStreamPlayback && currentVideo === "main" ? (
        <div className="relative w-full h-full">
          <iframe
            key={playbackId}
            title={`${title} player`}
            src={`https://iframe.cloudflarestream.com/${playbackId}?controls=true&autoplay=false`}
            className="absolute inset-0 w-full h-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            style={{ backgroundColor: "black", pointerEvents: "auto", zIndex: 0 }}
            loading="eager"
          />
        </div>
      ) : (
        // Direct <video>
        <div className="relative w-full h-full">
          <video
            ref={videoRef}
            className="w-full h-full object-contain bg-black"
            autoPlay={inline ? false : true}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleVideoTimeUpdate}
            onLoadedMetadata={handleVideoLoadedMetadata}
            onError={handleVideoError}
            onEnded={handleVideoEnd}
            playsInline
            preload="metadata"
            controls={false}
            muted={isMuted}
            crossOrigin="anonymous"
            style={{ width: "100%", height: "100%", backgroundColor: "black" }}
          >
            {currentVideo === "trailer" && trailerUrl ? (
              <>
                <source src={trailerUrl} type="video/mp4" />
                <source src={trailerUrl} type="video/webm" />
              </>
            ) : videoUrl ? (
              <>
                <source src={videoUrl} type="video/mp4" />
                <source src={videoUrl} type="video/webm" />
              </>
            ) : null}
            <p className="text-white text-center p-4">Your browser does not support the video tag.</p>
          </video>

          {/* Error overlay */}
          {videoError && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center">
              <div className="max-w-md">
                <X className="h-16 w-16 text-red-500 mx-auto mb-4" />
                <h3 className="text-white text-xl font-semibold mb-2">Video Playback Error</h3>
                <p className="text-white/80 text-sm mb-4">{videoError}</p>
              </div>
            </div>
          )}

          {/* Controls overlay */}
          <div
            className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 ${
              showControls ? "opacity-100" : "opacity-0"
            }`}
            onMouseEnter={() => setShowControls(true)}
          >
            {/* top bar (can be hidden) */}
            {!hideOverlayHeader && (
              <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center">
                <h2 className="text-white text-lg font-semibold">
                  {title}
                  {currentVideo === "trailer" && " (Trailer)"}
                </h2>
                {videoUrl && trailerUrl && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={currentVideo === "main" ? "default" : "secondary"}
                      onClick={() => setCurrentVideo("main")}
                      className="bg-black/50 backdrop-blur-sm text-white border-white/20"
                    >
                      Full {contentType}
                    </Button>
                    <Button
                      size="sm"
                      variant={currentVideo === "trailer" ? "default" : "secondary"}
                      onClick={() => setCurrentVideo("trailer")}
                      className="bg-black/50 backdrop-blur-sm text-white border-white/20"
                    >
                      Trailer
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* center play */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={togglePlay}
                  className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 border border-white/20"
                >
                  <Play className="h-8 w-8 ml-1" />
                </Button>
              </div>
            )}

            {/* bottom controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 pb-16 md:pb-6 space-y-2">
              {/* progress */}
              <div className="relative">
                <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 bg-white/20 rounded-full">
                  <div
                    className="h-full bg-white/40 rounded-full transition-all duration-300"
                    style={{ width: `${buffered}%` }}
                  />
                </div>
                <Slider
                  value={[currentTime || 0]}
                  max={duration || 100}
                  step={0.1}
                  onValueChange={handleSeek}
                  className="w-full cursor-pointer"
                  disabled={!duration || isNaN(duration)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="sm" onClick={togglePlay} className="text-white hover:bg-white/20">
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => skipTime(-10)} className="text-white hover:bg-white/20">
                    <SkipBack className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => skipTime(10)} className="text-white hover:bg-white/20">
                    <SkipForward className="h-5 w-5" />
                  </Button>

                  {/* volume */}
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={toggleMute} className="text-white hover:bg-white/20">
                      {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </Button>
                    <div className="w-20 hidden md:block">
                      <Slider value={[isMuted ? 0 : volume]} max={1} step={0.1} onValueChange={handleVolumeChange} className="cursor-pointer" />
                    </div>
                  </div>

                  <span className="text-white text-sm font-mono whitespace-nowrap">
                    {formatTime(currentTime || 0)} / {formatTime(duration || 0)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
                    <Settings className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={toggleFullscreen} className="text-white hover:bg-white/20">
                    {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              {description && (
                <div className="pt-2">
                  <p className="text-white/80 text-sm max-w-2xl">{description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (inline) {
    return (
      <Card className="cinema-card overflow-hidden">
        <div className="relative aspect-video bg-black">{PlayerSurface}</div>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="secondary">{contentType}</Badge>
            {genre && <Badge variant="outline">{genre}</Badge>}
          </div>
          {/* Title intentionally omitted here; pages can render their own */}
          {description && <p className="text-muted-foreground text-sm mb-4 line-clamp-3">{description}</p>}
          {canDelete && (
            <div className="flex justify-end">
              <Button size="sm" variant="destructive" onClick={onDelete}>
                <X className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Dialog version
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const open = () => setShowFullPlayer(true);

  return (
    <Card className="cinema-card overflow-hidden">
      <div className="relative">
        <div className="aspect-video bg-secondary/20 rounded-t-lg relative overflow-hidden group cursor-pointer" onClick={open}>
          {displayThumbnail ? (
            <img src={displayThumbnail} alt={`${title} cover`} className="w-full h-full object-cover" loading="lazy" />
          ) : canPlaySomething ? (
            <div className="w-full h-full bg-black" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Play className="h-12 w-12 text-primary" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            {canPlaySomething && (
              <Button size="lg" variant="secondary" className="bg-white/10 backdrop-blur-sm border-white/20">
                <Play className="h-5 w-5 mr-2" />
                Play {contentType}
              </Button>
            )}
          </div>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="secondary">{contentType}</Badge>
          {genre && <Badge variant="outline">{genre}</Badge>}
        </div>
        <h3 className="text-lg font-semibold mb-2 line-clamp-1">{title}</h3>
        {description && <p className="text-muted-foreground text-sm mb-4 line-clamp-3">{description}</p>}
        {canDelete && (
          <div className="flex justify-end">
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <X className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={showFullPlayer} onOpenChange={setShowFullPlayer}>
        <DialogContent className="max-w-full w-screen h-screen p-0 bg-black border-none video-player-dialog">
          <VisuallyHidden>
            <h2>Video Player - {title}</h2>
          </VisuallyHidden>
          {PlayerSurface}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// Export both ways so existing imports keep working
export default VideoPlayer;
