// src/pages/Prayers.tsx
import { useEffect, useMemo, useState } from "react";
import { fetchPrayers, Prayer } from "@/lib/prayers";
import PrayerComposer from "@/components/prayers/PrayerComposer";
import PrayerCard from "@/components/prayers/PrayerCard";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { MapPin } from "lucide-react";

// ✅ use the separate modal component (handles mirrors, timeouts, etc.)
import NearbyChurchesModal from "@/components/churches/NearbyChurchesModal";

export default function PrayersPage() {
  const [items, setItems] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  // controls the churches modal
  const [finderOpen, setFinderOpen] = useState(false);

  const load = async (append = false) => {
    try {
      setError(null);
      setLoading(true);
      const currentCursor = append ? items[items.length - 1]?.created_at : undefined;
      const list = (await fetchPrayers({ cursor: currentCursor })) || [];
      setItems(prev => {
        const newList = append ? [...prev, ...list] : list;
        setCursor(newList.length ? newList[newList.length - 1].created_at : undefined);
        return newList;
      });
    } catch (e: any) {
      console.error("fetchPrayers failed", e);
      setError(e?.message || "Failed to load prayers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Prayer[]>();
    for (const p of items) {
      const key = format(new Date(p.created_at), "MMM d, yyyy");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Daily Prayers and Testimonies</h1>

        {/* 🔗 This button opens the NearbyChurchesModal */}
        <Button
          onClick={() => setFinderOpen(true)}
          className="group relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 hover:from-purple-700 hover:via-pink-700 hover:to-red-700 border-0 text-white font-semibold px-4 py-2 rounded-xl shadow-2xl"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>Find local churches near you</span>
          </div>
        </Button>
      </div>

      {/* Post composer */}
      <PrayerComposer onPosted={(p) => setItems((cur) => [p as Prayer, ...cur])} />

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!error && !loading && items.length === 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          No posts yet. If you’ve added some and don’t see them, check env vars and RLS.
        </div>
      )}

      {grouped.map(([day, list]) => (
        <div key={day} className="space-y-3">
          <div className="sticky top-14 z-10 bg-background/80 backdrop-blur py-2">
            <h2 className="text-sm font-medium text-muted-foreground">{day}</h2>
          </div>
          {list.map((p) => (
            <PrayerCard
              key={p.id}
              item={p}
              onDeleted={(id) => setItems((cur) => cur.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      ))}

      <div className="flex justify-center py-4">
        <Button variant="outline" onClick={() => load(true)} disabled={loading || !cursor}>
          {cursor ? (loading ? "Loading…" : "Load more") : "No more"}
        </Button>
      </div>

      {/* 🎯 Reusable modal for nearby churches */}
      <NearbyChurchesModal open={finderOpen} onOpenChange={setFinderOpen} />
    </div>
  );
}
