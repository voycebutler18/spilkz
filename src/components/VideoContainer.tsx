import { useRef, useEffect, useState } from 'react';

interface VideoContainerProps {
  src: string;
  poster?: string;
  className?: string;
  onClick?: () => void;
}

const VideoContainer = ({ src, poster, className = '', onClick }: VideoContainerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset error state when src changes
    setHasError(false);
    setIsLoading(true);

    const handleLoadedData = () => {
      setIsLoading(false);
    };

    const handleError = (e: Event) => {
      console.error('Video error:', e);
      setHasError(true);
      setIsLoading(false);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);

    // Set up intersection observer for autoplay with 45% threshold
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Check if video is at least 45% visible
          if (entry.intersectionRatio >= 0.45 && !hasError) {
            video.play().catch((err) => {
              console.log('Autoplay prevented:', err);
            });
          } else {
            video.pause();
          }
        });
      },
      { 
        threshold: [0, 0.25, 0.45, 0.5, 0.75, 1.0] // Multiple thresholds to catch the 45% mark
      }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
    };
  }, [src, hasError]);

  if (hasError) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center flex-col gap-2">
        <p className="text-muted-foreground">Unable to load video</p>
        <button 
          onClick={() => {
            setHasError(false);
            setIsLoading(true);
          }}
          className="text-primary hover:underline text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
        loop
        muted
        playsInline
        preload="metadata"
        onClick={onClick}
      />
    </>
  );
};

export default VideoContainer;
