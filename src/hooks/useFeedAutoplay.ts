import { useEffect, useMemo, useRef, useState } from "react";

export function useFeedAutoplay(count: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // helper so you can attach refs in a map()
  const setVideoRef = (i: number) => (el: HTMLVideoElement | null) => {
    videoRefs.current[i] = el;
  };

  const thresholds = useMemo(
    () => Array.from({ length: 21 }, (_, i) => i / 20), // 0, .05, .10 ... 1
    []
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const visibility: Record<number, number> = {};
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const idx = Number((e.target as HTMLElement).dataset.index);
          visibility[idx] = e.intersectionRatio;
        });

        // pick the most visible; require >= 0.55 so we switch “halfway”
        let bestIdx = activeIndex;
        let bestRatio = visibility[bestIdx] ?? 0;
        for (const [k, v] of Object.entries(visibility)) {
          const i = Number(k);
          if (v > bestRatio) {
            bestRatio = v;
            bestIdx = i;
          }
        }
        if (bestRatio >= 0.55 && bestIdx !== activeIndex) {
          setActiveIndex(bestIdx);
        }
      },
      { root, threshold: thresholds }
    );

    // observe wrappers around each video (not the video itself)
    const children = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));
    children.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, [thresholds, activeIndex]);

  // play/pause only the active
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === activeIndex) {
        // iOS & Chrome require muted + playsInline for autoplay
        v.muted = true;
        v.playsInline = true;
        v
          .play()
          .catch(() => {/* ignore autoplay errors */});
      } else {
        if (!v.paused) v.pause();
      }
    });
  }, [activeIndex, count]);

  const scrollTo = (index: number) => {
    const root = containerRef.current;
    if (!root) return;
    const child = root.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (child) child.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return { containerRef, setVideoRef, activeIndex, scrollTo };
}
