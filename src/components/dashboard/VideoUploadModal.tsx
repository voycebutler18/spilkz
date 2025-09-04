import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, X, Loader2, Scissors, Play, Pause, Volume2, VolumeX, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { VideoRangeSlider } from "./VideoRangeSlider";
import { Slider } from "@/components/ui/slider";

interface VideoUploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

const MAX_VIDEO_DURATION = 3; // 3 seconds max

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
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 3]); // [start, end] in seconds
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number>();
  const { toast } = useToast();

  const acceptedFormats = ".mp4,.mov,.flv,.webm,.avi";
  const maxFileSize = 500 * 1024 * 1024; // 500MB

  // Get current user on component mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getUser();
  }, []);

  // Cleanup function for video preview
  useEffect(() => {
    return () => {
      if (videoPreview) {
        URL.revokeObjectURL(videoPreview);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [videoPreview]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const fileType = selectedFile.type;
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-flv', 'video/webm', 'video/x-msvideo'];
    
    if (!validTypes.includes(fileType)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file (MP4, MOV, FLV, WebM, AVI)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size
    if (selectedFile.size > maxFileSize) {
      toast({
        title: "File too large",
        description: "Please upload a video smaller than 500MB",
        variant: "destructive",
      });
      return;
    }

    setProcessingVideo(true);
    setVideoReady(false);
    
    try {
      setFile(selectedFile);
      
      // Create video preview
      const url = URL.createObjectURL(selectedFile);
      setVideoPreview(url);
      
      // Load video to get duration
      const video = document.createElement('video');
      video.src = url;
      
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          const duration = video.duration;
          setOriginalDuration(duration);
          
          // Show trimmer if video is longer than 3 seconds
          if (duration > MAX_VIDEO_DURATION) {
            setShowTrimmer(true);
            // Initialize trim range to first 3 seconds
            setTrimRange([0, 3]);
            toast({
              title: "Select your 3-second clip",
              description: `Your video is ${duration.toFixed(1)}s long. Use the trimmer below to select any 3-second segment.`,
            });
          } else {
            setShowTrimmer(false);
            setTrimRange([0, duration]);
          }
          
          resolve(null);
        };
        
        video.onerror = () => {
          reject(new Error("Failed to load video"));
        };
      });
      
      // Extract title from filename
      const fileName = selectedFile.name.replace(/\.[^/.]+$/, "");
      setTitle(fileName);
      
    } catch (error) {
      console.error('Error processing video:', error);
      toast({
        title: "Error processing video",
        description: "Failed to process your video. Please try again.",
        variant: "destructive",
      });
      setFile(null);
      setVideoPreview(null);
    } finally {
      setProcessingVideo(false);
    }
  }, [toast]);

  // Setup video element when preview is ready
  useEffect(() => {
    if (!videoRef.current || !videoPreview) return;

    const video = videoRef.current;
    
    const handleLoadedMetadata = () => {
      console.log("Video metadata loaded");
      video.currentTime = trimRange[0];
      setVideoReady(true);
    };
    
    const handleError = (e: Event) => {
      console.error("Video error:", e);
      setVideoReady(false);
    };
    
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, [videoPreview, trimRange]);

  // Handle playback loop within trim range
  useEffect(() => {
    if (!videoRef.current || !isPlaying) return;

    const video = videoRef.current;
    const updateTime = () => {
      if (video.currentTime >= trimRange[1] || video.currentTime < trimRange[0]) {
        video.currentTime = trimRange[0];
      }
      setCurrentTime(video.currentTime);
      
      if (isPlaying) {
        animationRef.current = requestAnimationFrame(updateTime);
      }
    };

    animationRef.current = requestAnimationFrame(updateTime);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, trimRange]);

  const togglePlayPause = () => {
    if (!videoRef.current || !videoReady) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      // Set to start of trim range if outside
      if (videoRef.current.currentTime < trimRange[0] || videoRef.current.currentTime >= trimRange[1]) {
        videoRef.current.currentTime = trimRange[0];
      }
      
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error("Playback failed:", err);
        // Try muted playback
        videoRef.current!.muted = true;
        setIsMuted(true);
        videoRef.current!.play().then(() => {
          setIsPlaying(true);
        }).catch(console.error);
      });
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
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
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
      
      setUploadProgress(30);

      // Upload video to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('spliks')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setUploadProgress(70);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('spliks')
        .getPublicUrl(fileName);

      setUploadProgress(85);

      // ALWAYS limit to 3 seconds maximum
      const actualDuration = Math.min(3, showTrimmer ? 3 : originalDuration);

      // Save video metadata to database with trimming info
      const { error: dbError } = await supabase
        .from('spliks')
        .insert({
          user_id: currentUser.id,
          title,
          description: description || (showTrimmer ? `Trimmed: ${trimRange[0].toFixed(1)}s - ${trimRange[1].toFixed(1)}s` : ''),
          video_url: publicUrl,
          duration: 3, // ALWAYS 3 seconds max, no exceptions
          file_size: file.size,
          mime_type: file.type,
          status: 'active',
          trim_start: showTrimmer ? trimRange[0] : 0,
          trim_end: showTrimmer ? trimRange[1] : Math.min(3, originalDuration),
        });

      if (dbError) throw dbError;

      setUploadProgress(100);

      toast({
        title: "Upload successful!",
        description: "Your 3-second Splik has been uploaded",
      });

      // Reset form
      setFile(null);
      setTitle("");
      setDescription("");
      setVideoPreview(null);
      setUploadProgress(0);
      setCurrentTime(0);
      setIsPlaying(false);
      setVideoReady(false);
      
      onUploadComplete();
      onClose();
    } catch (error: any) {
      console.error('Upload error:', error);
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const fakeEvent = {
        target: { files: [droppedFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  }, [handleFileSelect]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
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
              <p className="text-sm text-muted-foreground">
                Preparing for 3-second clip
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
              <p className="text-sm text-muted-foreground mb-4">
                or click to browse files
              </p>
              <p className="text-xs text-muted-foreground mb-2">
                Supported formats: MP4, MOV, FLV, WebM, AVI (max 500MB)
              </p>
              <p className="text-xs text-primary font-medium">
                Videos will be trimmed to exactly 3 seconds
              </p>
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
              {/* Instagram-style vertical video preview */}
              <div className="flex justify-center">
                <div className="relative bg-black rounded-xl overflow-hidden" style={{ width: '360px', maxWidth: '100%' }}>
                  {/* 9:16 aspect ratio container for Instagram-style */}
                  <div className="relative" style={{ paddingBottom: '177.78%' }}>
                    <video
                      ref={videoRef}
                      src={videoPreview || undefined}
                      className="absolute inset-0 w-full h-full object-cover"
                      loop={false}
                      muted={isMuted}
                      playsInline
                      preload="auto"
                      controls={false}
                    />
                    
                    {/* Loading overlay if video not ready */}
                    {!videoReady && (
                      <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      </div>
                    )}
                    
                    {/* Video controls overlay */}
                    {videoReady && (
                      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40">
                        {/* Play/Pause button */}
                        <button
                          onClick={togglePlayPause}
                          className="absolute inset-0 w-full h-full flex items-center justify-center group"
                        >
                          <div className={`${isPlaying ? 'opacity-0' : 'opacity-100'} group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-4`}>
                            {isPlaying ? (
                              <Pause className="h-12 w-12 text-white" />
                            ) : (
                              <Play className="h-12 w-12 text-white ml-1" />
                            )}
                          </div>
                        </button>

                        {/* Bottom controls */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
                          {/* Time display */}
                          <div className="flex justify-between text-white text-xs font-medium">
                            <span>{formatTime(currentTime - trimRange[0])}</span>
                            <span>{formatTime(trimRange[1] - trimRange[0])}</span>
                          </div>

                          {/* Progress bar for trimmed section */}
                          <Slider
                            value={[currentTime]}
                            min={trimRange[0]}
                            max={trimRange[1]}
                            step={0.01}
                            onValueChange={handleSeek}
                            className="w-full"
                          />

                          {/* Mute button */}
                          <button
                            onClick={toggleMute}
                            className="text-white hover:text-primary transition-colors"
                          >
                            {isMuted ? (
                              <VolumeX className="h-5 w-5" />
                            ) : (
                              <Volume2 className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Format warning for non-MP4 files */}
              {file && file.type !== 'video/mp4' && (
                <Alert className="border-orange-500/20 bg-orange-500/5">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <AlertDescription className="text-sm">
                    <strong>Format Notice:</strong> {file.type === 'video/quicktime' ? 'MOV' : file.type.split('/')[1].toUpperCase()} files may have playback issues. For best compatibility, use MP4 format.
                  </AlertDescription>
                </Alert>
              )}

              {/* Video Trimmer for videos longer than 3 seconds */}
              {showTrimmer && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Trim to 3 seconds</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Start: {trimRange[0].toFixed(1)}s</span>
                      <span className="font-bold text-primary">Duration: {(trimRange[1] - trimRange[0]).toFixed(1)}s</span>
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
                    
                    {/* Quick select buttons */}
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

              {/* Title and Description inputs */}
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

              {/* Action buttons */}
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setVideoPreview(null);
                    setTitle("");
                    setDescription("");
                    setIsPlaying(false);
                    setVideoReady(false);
                  }}
                  disabled={uploading}
                >
                  <X className="h-4 w-4 mr-2" />
                  Remove
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={uploading || !title || !videoReady}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Upload Splik'
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