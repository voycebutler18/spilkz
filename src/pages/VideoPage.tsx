// src/contexts/UploadModalContext.tsx
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, X, Video, Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UploadModalContextType {
  isOpen: boolean;
  openUploadModal: () => void;
  closeUploadModal: () => void;
}

const UploadModalContext = React.createContext<UploadModalContextType | null>(null);

export const useUploadModal = () => {
  const context = React.useContext(UploadModalContext);
  if (!context) {
    throw new Error("useUploadModal must be used within an UploadModalProvider");
  }
  return context;
};

interface VideoTrimmerProps {
  videoFile: File;
  onTrimChange: (startTime: number, endTime: number) => void;
  trimStart: number;
  trimEnd: number;
}

const VideoTrimmer: React.FC<VideoTrimmerProps> = ({ 
  videoFile, 
  onTrimChange, 
  trimStart, 
  trimEnd 
}) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const sliderRef = React.useRef<HTMLDivElement>(null);
  const [videoUrl, setVideoUrl] = React.useState<string>("");
  const [duration, setDuration] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(true);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState<'start' | 'end' | null>(null);

  React.useEffect(() => {
    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      // Set initial trim to first 3 seconds or full duration if shorter
      const maxEnd = Math.min(video.duration, 3);
      onTrimChange(0, maxEnd);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Keep playback within trimmed range
      if (video.currentTime < trimStart || video.currentTime > trimEnd) {
        video.currentTime = trimStart;
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [trimStart, trimEnd, onTrimChange]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      video.currentTime = trimStart;
      video.play();
      setPlaying(true);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !muted;
    setMuted(!muted);
  };

  const handleSliderMouseDown = (e: React.MouseEvent, thumb: 'start' | 'end') => {
    e.preventDefault();
    setIsDragging(thumb);
  };

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isDragging || !sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;

    if (isDragging === 'start') {
      const newStart = Math.max(0, Math.min(time, trimEnd - 0.1)); // Ensure 0.1s minimum duration
      onTrimChange(newStart, trimEnd);
    } else if (isDragging === 'end') {
      const newEnd = Math.min(duration, Math.max(time, trimStart + 0.1));
      const maxEnd = Math.min(duration, trimStart + 3); // Max 3 seconds
      onTrimChange(trimStart, Math.min(newEnd, maxEnd));
    }
  }, [isDragging, duration, trimStart, trimEnd, onTrimChange]);

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(null);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const decimals = Math.floor((time % 1) * 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${decimals}`;
  };

  if (!duration) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const startPercent = (trimStart / duration) * 100;
  const endPercent = (trimEnd / duration) * 100;
  const currentPercent = (currentTime / duration) * 100;

  return (
    <div className="space-y-4">
      {/* Video Preview */}
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          muted={muted}
          playsInline
        />
        
        {/* Video Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={togglePlayPause}
                className="text-white hover:bg-white/20 h-8 w-8"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <span className="text-xs">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleMute}
              className="text-white hover:bg-white/20 h-8 w-8"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Trim Controls */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          Select 3-second clip ({formatTime(trimEnd - trimStart)} selected)
        </Label>
        
        {/* Custom Range Slider */}
        <div className="relative">
          <div
            ref={sliderRef}
            className="relative h-6 bg-gray-200 rounded-full cursor-pointer"
          >
            {/* Track */}
            <div className="absolute top-0 h-full bg-gray-300 rounded-full" />
            
            {/* Selected Range */}
            <div
              className="absolute top-0 h-full bg-purple-500 rounded-full"
              style={{
                left: `${startPercent}%`,
                width: `${endPercent - startPercent}%`
              }}
            />
            
            {/* Current Time Indicator */}
            <div
              className="absolute top-0 h-full w-0.5 bg-white shadow-lg"
              style={{ left: `${currentPercent}%` }}
            />
            
            {/* Start Thumb */}
            <div
              className="absolute top-1/2 w-4 h-4 bg-white border-2 border-purple-500 rounded-full cursor-grab active:cursor-grabbing transform -translate-y-1/2 shadow-lg"
              style={{ left: `${startPercent}%`, marginLeft: '-8px' }}
              onMouseDown={(e) => handleSliderMouseDown(e, 'start')}
            />
            
            {/* End Thumb */}
            <div
              className="absolute top-1/2 w-4 h-4 bg-white border-2 border-purple-500 rounded-full cursor-grab active:cursor-grabbing transform -translate-y-1/2 shadow-lg"
              style={{ left: `${endPercent}%`, marginLeft: '-8px' }}
              onMouseDown={(e) => handleSliderMouseDown(e, 'end')}
            />
          </div>
          
          {/* Time Labels */}
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatTime(trimStart)}</span>
            <span>{formatTime(trimEnd)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const UploadModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [step, setStep] = React.useState<'upload' | 'edit' | 'details'>('upload');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [trimStart, setTrimStart] = React.useState(0);
  const [trimEnd, setTrimEnd] = React.useState(3);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const openUploadModal = () => setIsOpen(true);
  
  const closeUploadModal = () => {
    setIsOpen(false);
    setStep('upload');
    setSelectedFile(null);
    setUploading(false);
    setDragActive(false);
    setTrimStart(0);
    setTrimEnd(3);
    setTitle('');
    setDescription('');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (isValidFile(file)) {
        setSelectedFile(file);
        setStep('edit');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (isValidFile(file)) {
        setSelectedFile(file);
        setStep('edit');
      }
    }
  };

  const isValidFile = (file: File) => {
    const validTypes = ['video/mp4', 'video/webm', 'video/mov', 'video/avi', 'video/quicktime'];
    const maxSize = 100 * 1024 * 1024; // 100MB
    
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a valid video file (MP4, WebM, MOV, AVI)",
        variant: "destructive",
      });
      return false;
    }
    
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "File size must be less than 100MB",
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  const handleTrimChange = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
  };

  const handleNext = () => {
    if (step === 'edit') {
      setStep('details');
    }
  };

  const handleBack = () => {
    if (step === 'details') {
      setStep('edit');
    } else if (step === 'edit') {
      setStep('upload');
      setSelectedFile(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    try {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Please sign in to upload videos');
      }

      // Upload video file to Supabase storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `videos/${session.user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      // Create splik record
      const { error: insertError } = await supabase
        .from('spliks')
        .insert({
          title: title.trim() || 'Untitled Splik',
          description: description.trim() || null,
          video_url: publicUrl,
          user_id: session.user.id,
          duration: trimEnd - trimStart,
          trim_start: trimStart,
          trim_end: trimEnd,
          views: 0,
          likes_count: 0,
          comments_count: 0
        });

      if (insertError) throw insertError;

      toast({
        title: "Upload successful!",
        description: "Your Splik has been uploaded and is now live.",
      });

      closeUploadModal();
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <UploadModalContext.Provider value={{ isOpen, openUploadModal, closeUploadModal }}>
      {children}
      
      <Dialog open={isOpen} onOpenChange={closeUploadModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Your Splik
              {step === 'edit' && ' - Trim Video'}
              {step === 'details' && ' - Add Details'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {step === 'upload' && (
              <div
                className={cn(
                  "relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors cursor-pointer",
                  dragActive && "border-purple-500 bg-purple-50"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="video/*"
                  onChange={handleFileSelect}
                />
                
                <div className="space-y-3">
                  <Video className="mx-auto h-16 w-16 text-gray-400" />
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      Drop your video here, or click to browse
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      MP4, WebM, MOV, AVI up to 100MB
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      You'll be able to select which 3-second portion to use
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 'edit' && selectedFile && (
              <VideoTrimmer
                videoFile={selectedFile}
                onTrimChange={handleTrimChange}
                trimStart={trimStart}
                trimEnd={trimEnd}
              />
            )}

            {step === 'details' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Give your Splik a catchy title..."
                    maxLength={100}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell people what your Splik is about..."
                    maxLength={500}
                    rows={3}
                  />
                </div>
                
                {selectedFile && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Video className="h-8 w-8 text-purple-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(selectedFile.size)} • {((trimEnd - trimStart)).toFixed(1)}s clip
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              {step !== 'upload' && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={uploading}
                  className="flex-1"
                >
                  Back
                </Button>
              )}
              
              {step === 'upload' && (
                <Button
                  variant="outline"
                  onClick={closeUploadModal}
                  className="flex-1"
                >
                  Cancel
                </Button>
              )}
              
              {step === 'edit' && (
                <Button
                  onClick={handleNext}
                  className="flex-1"
                >
                  Next: Add Details
                </Button>
              )}
              
              {step === 'details' && (
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex-1"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Splik
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </UploadModalContext.Provider>
  );
};

export default VideoPage;
