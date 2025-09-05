import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface VideoRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  /** Maximum allowed range length (seconds). Default 3 */
  maxRange?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Mobile-friendly two-thumb range slider.
 * - Uses Pointer Events so drag works on iOS/Android/desktop.
 * - Sets touch-action: none to prevent page scrolling while dragging.
 * - Enforces a MAX range length (end - start <= maxRange).
 */
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
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);

  const percent = (v: number) => ((v - min) / (max - min)) * 100;
  const percentageStart = percent(value[0]);
  const percentageEnd = percent(value[1]);

  const roundToStep = (v: number) => Math.round(v / step) * step;

  const calcValueFromClientX = useCallback((clientX: number) => {
    const rect = sliderRef.current?.getBoundingClientRect();
    if (!rect) return min;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const raw = min + (x / rect.width) * (max - min);
    return roundToStep(Math.max(min, Math.min(max, raw)));
  }, [min, max, step]);

  // Clamp so that (end - start) <= maxRange
  const clampByMaxRange = useCallback((start: number, end: number, handle: "start" | "end"): [number, number] => {
    let s = start;
    let e = end;

    if (handle === "start") {
      // Start can’t be after end, and cannot make the window > maxRange
      s = Math.min(s, e);                // not past end
      s = Math.max(min, s);              // not before min
      if (e - s > maxRange) s = e - maxRange;
      s = Math.max(min, s);
    } else {
      // End can’t be before start, and cannot make the window > maxRange
      e = Math.max(e, s);                // not before start
      e = Math.min(max, e);              // not after max
      if (e - s > maxRange) e = s + maxRange;
      e = Math.min(max, e);
    }
    // final guard
    if (e < s) e = s;
    return [Number(s.toFixed(3)), Number(e.toFixed(3))];
  }, [min, max, maxRange]);

  // Pointer handlers
  const startDrag = (handle: "start" | "end") => (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    pointerIdRef.current = e.pointerId;
    setDragging(handle);
  };

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      if (disabled) return;
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      // Prevent page scroll while dragging on mobile
      e.preventDefault();

      const newPos = calcValueFromClientX(e.clientX);
      if (dragging === "start") {
        const [s, e2] = clampByMaxRange(newPos, value[1], "start");
        onChange([s, e2]);
      } else {
        const [s2, e3] = clampByMaxRange(value[0], newPos, "end");
        onChange([s2, e3]);
      }
    };

    const endDrag = () => {
      pointerIdRef.current = null;
      setDragging(null);
    };

    // Listen at document level so drags don’t get “lost”
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", endDrag, { passive: true });
    document.addEventListener("pointercancel", endDrag, { passive: true });

    return () => {
      document.removeEventListener("pointermove", onMove as any);
      document.removeEventListener("pointerup", endDrag as any);
      document.removeEventListener("pointercancel", endDrag as any);
    };
  }, [dragging, value, onChange, disabled, calcValueFromClientX, clampByMaxRange]);

  return (
    <div
      ref={sliderRef}
      className={cn(
        // key mobile bits: prevent scroll/selection while dragging
        "relative h-2 w-full rounded-full bg-muted cursor-pointer touch-none select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      role="group"
      aria-label="Trim range"
    >
      {/* Track fill */}
      <div
        className="absolute h-full rounded-full bg-primary"
        style={{
          left: `${percentageStart}%`,
          width: `${Math.max(0, percentageEnd - percentageStart)}%`,
        }}
      />

      {/* Start handle */}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-background bg-primary shadow-lg",
          "h-6 w-6 md:h-5 md:w-5 touch-none", // large touch target + prevent default touch behavior
          dragging === "start" ? "cursor-grabbing scale-110" : "cursor-grab",
          disabled && "cursor-not-allowed"
        )}
        style={{ left: `${percentageStart}%` }}
        role="slider"
        aria-label="Start time"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value[0]}
        aria-disabled={disabled}
        onPointerDown={startDrag("start")}
      />

      {/* End handle */}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-background bg-primary shadow-lg",
          "h-6 w-6 md:h-5 md:w-5 touch-none",
          dragging === "end" ? "cursor-grabbing scale-110" : "cursor-grab",
          disabled && "cursor-not-allowed"
        )}
        style={{ left: `${percentageEnd}%` }}
        role="slider"
        aria-label="End time"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value[1]}
        aria-disabled={disabled}
        onPointerDown={startDrag("end")}
      />
    </div>
  );
}

export default VideoRangeSlider;
