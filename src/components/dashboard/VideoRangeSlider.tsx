// src/components/dashboard/VideoRangeSlider.tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface VideoRangeSliderProps {
  /** Start/end in seconds */
  value: [number, number];
  onChange: (v: [number, number]) => void;

  /** Timeline bounds in seconds */
  min?: number;      // default 0
  max?: number;      // default 100
  step?: number;     // default 0.1

  /** Disable interaction */
  disabled?: boolean;

  /** Extra classes for outer wrapper */
  className?: string;

  /**
   * When a thumb crosses the other, swap which thumb is being dragged.
   * This makes dragging feel natural instead of “sticking”.
   * Default: true
   */
  swapOnCross?: boolean;
}

export default function VideoRangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 0.1,
  disabled = false,
  className,
  swapOnCross = true,
}: VideoRangeSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<null | "start" | "end">(null);
  const pointerIdRef = useRef<number | null>(null);

  // helpers
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const round = (v: number) => Math.round(v / step) * step;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  const toValue = useCallback(
    (clientX: number) => {
      const rect = sliderRef.current?.getBoundingClientRect();
      if (!rect) return min;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const raw = min + (x / rect.width) * (max - min);
      return clamp(round(raw));
    },
    [min, max, step]
  );

  const startDrag = (which: "start" | "end") => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointerIdRef.current = e.pointerId;
    setDragging(which);
  };

  // keep UI stable when props change
  useEffect(() => {
    if (value[0] > value[1]) {
      onChange([value[1], value[0]]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value[0], value[1]]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      if (disabled) return;
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      e.preventDefault(); // avoid page scroll on mobile while dragging

      const p = toValue(e.clientX);
      const [start, end] = value;

      if (dragging === "start") {
        if (p <= end) {
          onChange([p, end]);
        } else if (swapOnCross) {
          // crossed -> swap roles so it keeps dragging smoothly
          setDragging("end");
          onChange([end, p]);
        } else {
          onChange([end, end]);
        }
      } else if (dragging === "end") {
        if (p >= start) {
          onChange([start, p]);
        } else if (swapOnCross) {
          setDragging("start");
          onChange([p, start]);
        } else {
          onChange([start, start]);
        }
      }
    };

    const endDrag = () => {
      pointerIdRef.current = null;
      setDragging(null);
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", endDrag, { passive: true });
    document.addEventListener("pointercancel", endDrag, { passive: true });

    return () => {
      document.removeEventListener("pointermove", onMove as any);
      document.removeEventListener("pointerup", endDrag as any);
      document.removeEventListener("pointercancel", endDrag as any);
    };
  }, [dragging, disabled, toValue, value, onChange, swapOnCross]);

  const startPct = pct(value[0]);
  const endPct = pct(value[1]);

  return (
    <div className="w-full">
      <div
        ref={sliderRef}
        className={cn(
          "relative h-2 w-full rounded-full bg-muted cursor-pointer select-none touch-none",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        role="group"
        aria-label="Trim range"
      >
        {/* track fill */}
        <div
          className="absolute h-full rounded-full bg-primary"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
          }}
        />

        {/* left thumb */}
        <div
          role="slider"
          aria-label="Start time"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value[0]}
          aria-disabled={disabled}
          onPointerDown={startDrag("start")}
          style={{ left: `${startPct}%` }}
          className={cn(
            thumbBase,
            dragging === "start" && "scale-[1.08]"
          )}
        />

        {/* right thumb */}
        <div
          role="slider"
          aria-label="End time"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value[1]}
          aria-disabled={disabled}
          onPointerDown={startDrag("end")}
          style={{ left: `${endPct}%` }}
          className={cn(
            thumbBase,
            dragging === "end" && "scale-[1.08]"
          )}
        />
      </div>

      {/* helper labels (optional, keep/remove as you like) */}
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Start: {value[0].toFixed(1)}s</span>
        <span className="font-medium text-primary">
          Range: {(value[1] - value[0]).toFixed(1)}s
        </span>
        <span>End: {value[1].toFixed(1)}s</span>
      </div>
    </div>
  );
}

const thumbBase =
  "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-6 w-6 md:h-5 md:w-5 " +
  "rounded-full border-2 border-background bg-primary shadow-lg transition " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 " +
  // large invisible halo to make touch easier
  "after:absolute after:inset-[-10px] after:content-['']";
