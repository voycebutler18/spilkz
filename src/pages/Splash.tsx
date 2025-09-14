// src/pages/Splash.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeedStore } from "@/store/feedStore";

/* --- optional tiny warmers (don’t fetch twice) --- */
function preconnect(url?: string | null) {
  if (!url) return;
  try {
    const u = new URL(url);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = `${u.protocol}//${u.host}`;
    link.crossOrigin = "";
    document.head.appendChild(link);
  } catch {}
}
function warmPosters(urls: (string | null | undefined)[], limit = 6) {
  urls.filter(Boolean).slice(0, limit).forEach((u) => {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = u as string;
  });
}

export default function Splash() {
  const navigate = useNavigate();
  const ensureFeed = useFeedStore((s) => s.ensureFeed);

  const [progress, setProgress] = useState(8);
  const navigatedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Never sit on Splash more than 3.5s (e.g., slow network)
    const failSafe = setTimeout(() => {
      if (!navigatedRef.current) {
        navigatedRef.current = true;
        navigate("/home", { replace: true });
      }
    }, 3500);

    (async () => {
      setProgress(20);

      // Loads from memory/TTL cache/session cache or network (deduped)
      const rows = await ensureFeed().catch(() => []);

      if (!mounted) return;

      // Small warm-up only AFTER store has data
      if (rows.length) {
        preconnect(rows[0]?.video_url);
        warmPosters(rows.map((r: any) => r.thumbnail_url));
      }

      setProgress(100);

      if (!navigatedRef.current) {
        navigatedRef.current = true;
        navigate("/home", { replace: true });
      }
    })();

    return () => {
      mounted = false;
      clearTimeout(failSafe);
    };
  }, [ensureFeed, navigate]);

  return (
    <div className="min-h-[100svh] w-full bg-gradient-to-b from-background to-muted flex items-center justify-center">
      <div className="max-w-sm w-[90%] text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm mb-4 animate-pulse">
          <span className="text-2xl font-black text-primary">S</span>
        </div>

        <h1 className="text-xl font-semibold mb-2">Splikz</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Warming up your personalized feed…
        </p>

        <div className="w-full h-2 rounded-full bg-muted-foreground/10 overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        <p className="text-[11px] text-muted-foreground mt-3">
          Preloading videos & posters for an instant feed ✨
        </p>
      </div>
    </div>
  );
}
