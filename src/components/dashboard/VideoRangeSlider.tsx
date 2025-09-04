import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface VideoRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  maxRange?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

export function VideoRangeSlider({
  min = 0,
  max = 100,
  value,
  onChange,
  maxRange = 3,
  step = 0.1,
  disabled = false,
  className,
}: VideoRangeSliderProps) {
  const [isDragging, setIsDragging] = useState<"start" | "end" | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  const percentageStart = ((value[0] - min) / (max - min)) * 100;
  const percentageEnd = ((value[1] - min) / (max - min)) * 100;

  const handleMouseDown = (handle: "start" | "end") => (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(handle);
  };

  const calculateValue = (clientX: number): number => {
    if (!sliderRef.current) return 0;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const rawValue = (percentage / 100) * (max - min) + min;
    
    // Round to step
    return Math.round(rawValue / step) * step;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newValue = calculateValue(e.clientX);
      
      if (isDragging === "start") {
        // Ensure start doesn't go past end - maxRange
        const maxStart = value[1] - maxRange;
        const clampedValue = Math.min(newValue, maxStart);
        onChange([Math.max(min, clampedValue), value[1]]);
      } else {
        // Ensure end doesn't go before start + maxRange
        const minEnd = value[0] + maxRange;
        const clampedValue = Math.max(newValue, minEnd);
        onChange([value[0], Math.min(max, clampedValue)]);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, value, onChange, min, max, maxRange, step]);

  return (
    <div
      ref={sliderRef}
      className={cn(
        "relative h-2 w-full rounded-full bg-muted cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {/* Track */}
      <div
        className="absolute h-full rounded-full bg-primary"
        style={{
          left: `${percentageStart}%`,
          width: `${percentageEnd - percentageStart}%`,
        }}
      />
      
      {/* Start handle */}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary border-2 border-background shadow-lg cursor-grab",
          isDragging === "start" && "cursor-grabbing scale-110",
          disabled && "cursor-not-allowed"
        )}
        style={{ left: `${percentageStart}%` }}
        onMouseDown={handleMouseDown("start")}
      />
      
      {/* End handle */}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary border-2 border-background shadow-lg cursor-grab",
          isDragging === "end" && "cursor-grabbing scale-110",
          disabled && "cursor-not-allowed"
        )}
        style={{ left: `${percentageEnd}%` }}
        onMouseDown={handleMouseDown("end")}
      />
    </div>
  );
}