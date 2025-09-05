// src/components/dashboard/VideoRangeSlider.tsx
import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface VideoRangeSliderProps {
  min?: number;
  max?: number;
  value: [number, number];           // [start, end]
  onChange: (v: [number, number]) => void;
  step?: number;                      // default 0.1s
  /** 
   * Maximum allowed window (end - start). 
   * - number -> enforce
   * - null/undefined -> NO restriction (unlimited while editing)
   */
  maxRange?: number | null;
  className?: string;
  disabled?: boolean;
}

type Handle = "start" | "end";

export default function VideoRangeSlider({
  min = 0,
  max = 3,
  value,
  onChange,
  step = 0.1,
  maxRange = null,
  className,
  disabled = false,
}: VideoRangeSliderProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const round = (v: number) => Number((Math.round(v / step) * step).toFixed(3));
  const toPct = (v: number) => ((v - min) / (max - min)) * 100;

  const startPct = toPct(value[0]);
  const endPct = toPct(value[1]);

  const applyMaxRange = (start: number, end: number, dragged: Handle): [number, number] => {
    if (maxRange == null) {
      // Unlimited while editing
      if (dragged === "start") start = Math.min(start, end);
      else end = Math.max(end, start);
      return [clamp(start), clamp(end)];
    }
    // Enforce window limit
    let s = clamp(start);
    let e = clamp(end);
    if (dragged === "start") {
      s = Math.min(s, e);
      if (e - s > maxRange) s = e - maxRange;
    } else {
      e = Math.max(e, s);
      if (e - s > maxRange) e = s + maxRange;
    }
    if (e < s) e = s;
    return [round(s), round(e)];
  };

  const clientXToValue = useCallback((clientX: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return min;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const raw = min + (x / rect.width) * (max - min);
    return round(clamp(raw));
  }, [min, max, step]);

  // --- Dragging with pointer events
  const beginDrag = (h: Handle) => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    pointerIdRef.current = e.pointerId;
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    setDragging(h);
  };

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      if (disabled) return;
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      e.preventDefault(); // stop page scroll
      const v = clientXToValue(e.clientX);
      if (dragging === "start") {
        const [s, en] = applyMaxRange(v, value[1], "start");
        onChange([s, en]);
      } else {
        const [s, en] = applyMaxRange(value[0], v, "end");
        onChange([s, en]);
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
  }, [dragging, value, disabled, clientXToValue]);

  // Click rail → move nearest handle
  const onRailPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    // Ignore if directly on a handle (its own handler will run)
    const target = e.target as HTMLElement;
    if (target.dataset.handle) return;

    const clicked = clientXToValue(e.clientX);
    const distStart = Math.abs(clicked - value[0]);
    const distEnd = Math.abs(clicked - value[1]);
    const handle: Handle = distStart <= distEnd ? "start" : "end";
    const [s, en] =
      handle === "start"
        ? applyMaxRange(clicked, value[1], "start")
        : applyMaxRange(value[0], clicked, "end");
    onChange([s, en]);
    // begin drag right away for nice UX
    pointerIdRef.current = e.pointerId;
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    setDragging(handle);
  };

  // Keyboard support on handles
  const onKeyDown = (h: Handle) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    let delta = 0;
    if (e.key === "ArrowLeft") delta = -step;
    else if (e.key === "ArrowRight") delta = step;
    else if (e.key === "PageDown") delta = -(10 * step);
    else if (e.key === "PageUp") delta = 10 * step;
    else return;

    e.preventDefault();
    const next = h === "start"
      ? applyMaxRange(round(value[0] + delta), value[1], "start")
      : applyMaxRange(value[0], round(value[1] + delta), "end");
    onChange(next);
  };

  return (
    <div
      ref={railRef}
      className={cn(
        "relative h-2 w-full rounded-full bg-muted cursor-pointer touch-none select-none",
        "outline-none",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onPointerDown={onRailPointerDown}
      role="group"
      aria-label="Trim range"
    >
      {/* Full rail highlight (cyan) */}
      <div className="absolute inset-0 rounded-full bg-teal-400/70" />

      {/* Selected segment (purple) */}
      <div
        className="absolute h-full rounded-full bg-purple-500"
        style={{
          left: `${startPct}%`,
          width: `${Math.max(0, endPct - startPct)}%`,
        }}
      />

      {/* Start thumb */}
      <button
        data-handle="start"
        type="button"
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2",
          "h-6 w-6 md:h-5 md:w-5 rounded-full border-2 border-white/80 bg-purple-500 shadow-lg",
          "focus:outline-none focus:ring-2 focus:ring-purple-400",
          dragging === "start" ? "scale-110" : ""
        )}
        style={{ left: `${startPct}%`, zIndex: dragging === "start" ? 2 : 1 }}
        role="slider"
        aria-label="Trim start"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value[0]}
        aria-disabled={disabled}
        onPointerDown={beginDrag("start")}
        onKeyDown={onKeyDown("start")}
      />

      {/* End thumb */}
      <button
        data-handle="end"
        type="button"
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2",
          "h-6 w-6 md:h-5 md:w-5 rounded-full border-2 border-white/80 bg-purple-500 shadow-lg",
          "focus:outline-none focus:ring-2 focus:ring-purple-400",
          dragging === "end" ? "scale-110" : ""
        )}
        style={{ left: `${endPct}%`, zIndex: dragging === "end" ? 2 : 1 }}
        role="slider"
        aria-label="Trim end"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value[1]}
        aria-disabled={disabled}
        onPointerDown={beginDrag("end")}
        onKeyDown={onKeyDown("end")}
      />
    </div>
  );
}
