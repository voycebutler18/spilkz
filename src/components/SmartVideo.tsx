import { useEffect, useRef } from "react";

type Props = {
  src: string;
  poster?: string | null;
  startAt?: number;           // loop start in seconds
  active: boolean;            // parent decides which card is active
  muted?: boolean;            // parent controls mute state
  onActiveChange?: (isPlaying: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
};

export default function SmartVideo({
  src,
  poster,
  startAt = 0,
  active,
  muted = true,
  onActiveChange,
  className,
  style,
}: Props) {
  const vRef = useRef<HTMLVideoElement | null>(null);
  const rafId = useRef<number | null>(null);
  const tappedOnce = useRef(false);

  // one-time setup for mobile-friendly playback
  useEffect(() => {
    const v = vRef.current;
    if (!v) return;

    // inline playback on mobile engines
    v.playsInline = true;
    v.setAttribute("playsinline", "true");
    v.setAttribute("webkit-playsinline", "true");
    v.setAttribute("x5-playsinline", "true");
    v.setAttribute("x5-video-player-type", "h5");

    // minimal UI for feeds
    v.controls = false;
    v.disablePictureInPicture = true;
    v.disableRemotePlayback = true;
    v.setAttribute("controlsList", "nodownload noplaybackrate noremoteplayback");

    // light preload for quick first frame
    v.preload = "metadata";
    if (poster) v.poster = poster;

    // attach source and load
    v.src = src;
    v.load();

    // show a frame even if autoplay is blocked
    const onLoadedData = () => {
      try {
        if (v.currentTime === 0) v.currentTime = Math.max(0.1, startAt);
      } catch {}
    };
    v.addEventListener("loadeddata", onLoadedData);
    return () => v.removeEventListener("loadeddata", onLoadedData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, poster]);

  // keep mute in sync
  useEffect(() => {
    const v = vRef.current;
    if (v) v.muted = !!muted;
  }, [muted]);

  // enforce 3s loop from startAt
  useEffect(() => {
    const v = vRef.current;
    if (!v) return;

    const loopEnd = startAt + 3;

    const tick = () => {
      if (!v) return;
      if (v.currentTime >= loopEnd) {
        try { v.currentTime = startAt; } catch {}
      }
      const rVFC = (v as any).requestVideoFrameCallback as
        | ((cb: (now: number, meta: any) => void) => number)
        | undefined;
      if (rVFC) rVFC(tick);
      else rafId.current = requestAnimationFrame(tick);
    };

    const onTimeUpdate = () => {
      if (v.currentTime >= loopEnd) {
        try { v.currentTime = startAt; } catch {}
      }
    };

    const rVFC = (v as any).requestVideoFrameCallback as
      | ((cb: (now: number, meta: any) => void) => void)
      | undefined;

    if (rVFC) rVFC(tick);
    else {
      rafId.current = requestAnimationFrame(tick);
      v.addEventListener("timeupdate", onTimeUpdate);
    }

    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      v.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [startAt]);

  // play/pause based on active state with robust autoplay handling
  useEffect(() => {
    const v = vRef.current;
    if (!v) return;

    const tryPlay = async () => {
      try {
        await v.play();
        onActiveChange?.(true);
        return true;
      } catch {
        return false;
      }
    };

    const onFirstGesture = async () => {
      if (tappedOnce.current) return;
      tappedOnce.current = true;
      if (!v.muted) v.muted = true;
      const ok = await tryPlay();
      if (!ok && !v.paused) v.pause();
      v.removeEventListener("pointerdown", onFirstGesture);
      v.removeEventListener("touchstart", onFirstGesture);
    };

    if (active) {
      try {
        if (v.currentTime < startAt || v.currentTime > startAt + 3) v.currentTime = startAt;
      } catch {}
      tryPlay().then(async (ok) => {
        if (ok) return;
        if (!v.muted) {
          v.muted = true;
          if (await tryPlay()) return;
        }
        v.addEventListener("pointerdown", onFirstGesture, { once: true });
        v.addEventListener("touchstart", onFirstGesture, { once: true, passive: true });
      });
    } else {
      try { v.pause(); } catch {}
      onActiveChange?.(false);
    }

    const onVis = () => {
      if (document.hidden) {
        try { v.pause(); } catch {}
        onActiveChange?.(false);
      } else if (active) {
        void tryPlay();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      v.removeEventListener("pointerdown", onFirstGesture);
      v.removeEventListener("touchstart", onFirstGesture);
    };
  }, [active, onActiveChange, startAt]);

  return (
    <video
      ref={vRef}
      className={className}
      style={style}
      controls={false}
      playsInline
    />
  );
}
