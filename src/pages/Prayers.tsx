import { useEffect, useMemo, useState } from "react";
import { fetchPrayers, Prayer } from "@/lib/prayers";
import PrayerComposer from "@/components/prayers/PrayerComposer";
import PrayerCard from "@/components/prayers/PrayerCard";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function PrayersPage() {
  const [items, setItems] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();

  const load = async (append = false) => {
    try {
      setLoading(true);
      const data = await fetchPrayers({
        cursor: append ? items[items.length - 1]?.created_at : undefined,
      });
      const next = append ? [...items, ...(data || [])] : (data || []);
      setItems(next);
      setCursor(next.length ? next[next.length - 1].created_at : undefined);
    } catch (err) {
      console.error("fetchPrayers failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, []);

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
      <h1 className="text-2xl font-semibold">Daily Prayers and Testimonies</h1>

      {/* Prepend the created post instantly */}
      <PrayerComposer onPosted={(p) => setItems((cur) => [p as Prayer, ...cur])} />

      {grouped.map(([day, list]) => (
        <div key={day} className="space-y-3">
          <div className="sticky top-14 z-10 bg-background/80 backdrop-blur py-2">
            <h2 className="text-sm font-medium text-muted-foreground">{day}</h2>
          </div>
          {list.map((p) => <PrayerCard key={p.id} item={p} />)}
        </div>
      ))}

      <div className="flex justify-center py-4">
        <Button variant="outline" onClick={() => load(true)} disabled={loading || !cursor}>
          {cursor ? (loading ? "Loading…" : "Load more") : "No more"}
        </Button>
      </div>
    </div>
  );
}
