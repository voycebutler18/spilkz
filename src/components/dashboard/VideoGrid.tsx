import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, MoreVertical, Edit, Trash2, Eye, Pause, Volume2, VolumeX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Splik {
  id: string;
  title: string;
  description?: string;
  video_url: string;
  thumbnail_url?: string;
  duration?: number;
  created_at: string;
  status: string;
  views?: number;
}

interface VideoGridProps {
  spliks: Splik[];
  onEdit?: (splik: Splik) => void;
  onDelete?: (id: string) => void;
  hideActions?: boolean;
}

const VideoGrid = ({ spliks, onEdit, onDelete, hideActions = false }: VideoGridProps) => {
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [mutedVideos, setMutedVideos] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState<{ [key: string]: number }>({});
  const [videoStats, setVideoStats] = useState<{ [key: string]: number }>({});
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});

  useEffect(() => {
    // Initialize stats
    const stats: any = {};
    spliks.forEach(splik => {
      stats[splik.id] = splik.views || 0;
    });
    setVideoStats(stats);

    // Subscribe to realtime updates for view counts
    const channel = supabase
      .channel('dashboard-video-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'spliks'
        },
        (payload) => {
          if (payload.new) {
            const newData = payload.new as any;
            setVideoStats(prev => ({
              ...prev,
              [newData.id]: newData.views || 0
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [spliks]);

  const formatDuration = () => {
    // Always show 3 seconds
    return "0:03";
  };

  const formatTime = (seconds: number) => {
    const secs = Math.floor(seconds);
    return `0:0${Math.min(secs, 3)}`;
  };

  const handlePlayToggle = (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;

    if (playingVideo === splikId) {
      video.pause();
      setPlayingVideo(null);
    } else {
      // Pause any other playing video
      if (playingVideo && videoRefs.current[playingVideo]) {
        videoRefs.current[playingVideo].pause();
      }
      
      // Set up time limit
      const handleTimeUpdate = () => {
        const trimStart = 0;
        const maxDuration = 3;
        
        if (video.currentTime - trimStart >= maxDuration) {
          video.currentTime = trimStart;
        }
        setCurrentTime(prev => ({ ...prev, [splikId]: Math.min(video.currentTime, 3) }));
      };
      
      video.addEventListener('timeupdate', handleTimeUpdate);
      
      video.play().catch(() => {
        video.muted = true;
        setMutedVideos(prev => new Set([...prev, splikId]));
        video.play();
      });
      
      setPlayingVideo(splikId);
      
      // Store cleanup
      (video as any).cleanup = () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }
  };

  const toggleMute = (splikId: string) => {
    const video = videoRefs.current[splikId];
    if (!video) return;
    
    const isMuted = mutedVideos.has(splikId);
    video.muted = !isMuted;
    if (isMuted) {
      setMutedVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(splikId);
        return newSet;
      });
    } else {
      setMutedVideos(prev => new Set([...prev, splikId]));
    }
  };

  if (spliks.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {spliks.map((splik) => (
        <Card key={splik.id} className="overflow-hidden group">
          <div className="relative aspect-video bg-black">
            {/* Live View Counter */}
            <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/70 backdrop-blur px-2 py-1 rounded-full z-10">
              <Eye className="h-3.5 w-3.5 text-white" />
              <span className="text-white font-medium text-xs">
                {(videoStats[splik.id] || 0).toLocaleString()} views
              </span>
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            </div>
            
            {/* Video element */}
            <video
              ref={(el) => {
                if (el) videoRefs.current[splik.id] = el;
              }}
              src={splik.video_url}
              className="w-full h-full object-contain"
              loop
              playsInline
              muted={mutedVideos.has(splik.id)}
              onClick={() => handlePlayToggle(splik.id)}
            />
            
            {/* Play/Pause overlay */}
            {playingVideo !== splik.id && (
              <div 
                className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={() => handlePlayToggle(splik.id)}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  className="bg-white/90 hover:bg-white text-black"
                >
                  <Play className="h-6 w-6" />
                </Button>
              </div>
            )}
            
            {/* Custom controls overlay */}
            {playingVideo === splik.id && (
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                <div className="flex items-center justify-between text-white text-xs">
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handlePlayToggle(splik.id)}
                      className="h-6 w-6 text-white hover:bg-white/20"
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
                    <span>{formatTime(currentTime[splik.id] || 0)} / {formatDuration()}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleMute(splik.id)}
                    className="h-6 w-6 text-white hover:bg-white/20"
                  >
                    {mutedVideos.has(splik.id) ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
            
            {/* Duration badge when not playing */}
            {playingVideo !== splik.id && (
              <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                {formatDuration()}
              </span>
            )}
          </div>
          
          <div className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold line-clamp-1">{splik.title}</h3>
                {splik.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {splik.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(splik.created_at), { addSuffix: true })}
                </p>
              </div>
              
              {!hideActions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => window.open(splik.video_url, '_blank')}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Full
                    </DropdownMenuItem>
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(splik)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem 
                        onClick={() => onDelete(splik.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default VideoGrid;
