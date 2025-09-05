import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Scissors, Play, Pause, RotateCcw } from 'lucide-react';

const VideoTrimmer = () => {
  const [videoDuration, setVideoDuration] = useState(15.0); // 15 second video
  const [startTime, setStartTime] = useState(0.0);
  const [endTime, setEndTime] = useState(3.0);
  const [isDraggingStart, setIsDraggingStart] = useState(false);
  const [isDraggingEnd, setIsDraggingEnd] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  const sliderRef = useRef(null);
  const videoRef = useRef(null);

  // Convert time to percentage position
  const timeToPercent = (time) => (time / videoDuration) * 100;

  // Convert pixel position to time
  const pixelToTime = useCallback((clientX) => {
    if (!sliderRef.current) return 0;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    return (percent / 100) * videoDuration;
  }, [videoDuration]);

  // Handle mouse down on thumbs
  const handleMouseDown = (thumb, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (thumb === 'start') {
      setIsDraggingStart(true);
    } else {
      setIsDraggingEnd(true);
    }
  };

  // Handle mouse move
  const handleMouseMove = useCallback((e) => {
    if (!isDraggingStart && !isDraggingEnd) return;

    const newTime = pixelToTime(e.clientX);

    if (isDraggingStart) {
      // Ensure start doesn't go past end minus minimum duration (0.5s)
      const maxStart = Math.max(0, endTime - 0.5);
      const clampedStart = Math.max(0, Math.min(maxStart, newTime));
      setStartTime(clampedStart);
    } else if (isDraggingEnd) {
      // Ensure end doesn't go before start plus minimum duration (0.5s)
      const minEnd = Math.min(videoDuration, startTime + 0.5);
      const clampedEnd = Math.max(minEnd, Math.min(videoDuration, newTime));
      setEndTime(clampedEnd);
    }
  }, [isDraggingStart, isDraggingEnd, startTime, endTime, pixelToTime, videoDuration]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDraggingStart(false);
    setIsDraggingEnd(false);
  }, []);

  // Set up global mouse events
  useEffect(() => {
    if (isDraggingStart || isDraggingEnd) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDraggingStart, isDraggingEnd, handleMouseMove, handleMouseUp]);

  // Format time display
  const formatTime = (time) => {
    return `${time.toFixed(1)}s`;
  };

  // Calculate selection duration
  const selectionDuration = endTime - startTime;

  // Handle quick select buttons
  const handleQuickSelect = (position) => {
    const duration = 3.0;
    let newStart, newEnd;
    
    switch (position) {
      case 'start':
        newStart = 0;
        newEnd = Math.min(duration, videoDuration);
        break;
      case 'middle':
        const midPoint = videoDuration / 2;
        newStart = Math.max(0, midPoint - duration / 2);
        newEnd = Math.min(videoDuration, midPoint + duration / 2);
        break;
      case 'end':
        newEnd = videoDuration;
        newStart = Math.max(0, videoDuration - duration);
        break;
      default:
        return;
    }
    
    setStartTime(newStart);
    setEndTime(newEnd);
  };

  // Reset to default
  const handleReset = () => {
    setStartTime(0);
    setEndTime(3.0);
  };

  // Handle track click (set nearest thumb)
  const handleTrackClick = (e) => {
    if (isDraggingStart || isDraggingEnd) return;
    
    const clickTime = pixelToTime(e.clientX);
    const distToStart = Math.abs(clickTime - startTime);
    const distToEnd = Math.abs(clickTime - endTime);
    
    if (distToStart < distToEnd) {
      const maxStart = Math.max(0, endTime - 0.5);
      setStartTime(Math.max(0, Math.min(maxStart, clickTime)));
    } else {
      const minEnd = Math.min(videoDuration, startTime + 0.5);
      setEndTime(Math.max(minEnd, Math.min(videoDuration, clickTime)));
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-gray-900 rounded-xl">
      {/* Video Preview */}
      <div className="relative mb-6 bg-black rounded-lg overflow-hidden aspect-video">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-blue-900/20 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-4 mx-auto backdrop-blur-sm">
              <Play className="w-10 h-10 text-white ml-1" />
            </div>
            <p className="text-lg font-medium">Video Preview</p>
            <p className="text-sm text-gray-300 mt-1">
              Selected: {formatTime(startTime)} - {formatTime(endTime)}
            </p>
          </div>
        </div>
      </div>

      {/* Trimming Controls */}
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-purple-400" />
            <span className="text-white font-medium">Trim Video</span>
            <span className="text-gray-400 text-sm">
              (Select {formatTime(selectionDuration)} from {formatTime(videoDuration)} video)
            </span>
          </div>
          
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>

        {/* Main Slider */}
        <div className="relative">
          {/* Time markers */}
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>0.0s</span>
            <span>{formatTime(videoDuration / 4)}</span>
            <span>{formatTime(videoDuration / 2)}</span>
            <span>{formatTime(3 * videoDuration / 4)}</span>
            <span>{formatTime(videoDuration)}</span>
          </div>

          {/* Slider Track */}
          <div 
            ref={sliderRef}
            className="relative h-12 bg-gray-700 rounded-lg cursor-pointer overflow-hidden"
            onClick={handleTrackClick}
          >
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-gray-600 to-gray-500" />
            
            {/* Time grid lines */}
            <div className="absolute inset-0 opacity-20">
              {[...Array(Math.floor(videoDuration))].map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-px bg-white"
                  style={{ left: `${(i / videoDuration) * 100}%` }}
                />
              ))}
            </div>

            {/* Selected Range */}
            <div
              className="absolute top-0 bottom-0 bg-gradient-to-r from-purple-500 to-blue-500 opacity-80 transition-all duration-150"
              style={{
                left: `${timeToPercent(startTime)}%`,
                width: `${timeToPercent(endTime) - timeToPercent(startTime)}%`,
              }}
            >
              <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />
            </div>

            {/* Start Thumb */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-6 h-8 bg-white rounded-md shadow-lg cursor-grab border-2 border-purple-400 transition-all duration-150 ${
                isDraggingStart ? 'scale-110 shadow-xl' : 'hover:scale-105'
              }`}
              style={{ left: `${timeToPercent(startTime)}%`, transform: 'translate(-50%, -50%)' }}
              onMouseDown={(e) => handleMouseDown('start', e)}
            >
              <div className="absolute inset-1 bg-purple-400 rounded-sm" />
            </div>

            {/* End Thumb */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-6 h-8 bg-white rounded-md shadow-lg cursor-grab border-2 border-blue-400 transition-all duration-150 ${
                isDraggingEnd ? 'scale-110 shadow-xl' : 'hover:scale-105'
              }`}
              style={{ left: `${timeToPercent(endTime)}%`, transform: 'translate(-50%, -50%)' }}
              onMouseDown={(e) => handleMouseDown('end', e)}
            >
              <div className="absolute inset-1 bg-blue-400 rounded-sm" />
            </div>
          </div>

          {/* Time Labels */}
          <div className="flex justify-between mt-2">
            <div className="text-sm text-purple-400 font-medium">
              Start: {formatTime(startTime)}
            </div>
            <div className="text-sm text-gray-400">
              Duration: {formatTime(selectionDuration)}
            </div>
            <div className="text-sm text-blue-400 font-medium">
              End: {formatTime(endTime)}
            </div>
          </div>
        </div>

        {/* Quick Select Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleQuickSelect('start')}
            className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            First 3s
          </button>
          <button
            onClick={() => handleQuickSelect('middle')}
            className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            Middle 3s
          </button>
          <button
            onClick={() => handleQuickSelect('end')}
            className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            Last 3s
          </button>
        </div>

        {/* Title Input */}
        <div className="space-y-2">
          <label className="block text-white text-sm font-medium">
            Title
          </label>
          <input
            type="text"
            placeholder="Enter video title..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
          />
        </div>

        {/* Description Input */}
        <div className="space-y-2">
          <label className="block text-white text-sm font-medium">
            Description <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            placeholder="Add a description..."
            rows={3}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 resize-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-200 transform hover:scale-105">
            Save Changes
          </button>
          <button className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoTrimmer;
