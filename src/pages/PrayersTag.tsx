import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPrayers, Prayer } from "@/lib/prayers";
import PrayerCard from "@/components/prayers/PrayerCard";

export default function PrayersTagPage() {
  const { tag } = useParams();
  const [items, setItems] = useState<Prayer[]>([]);

  useEffect(() => {
    if (!tag) return;
    fetchPrayers({ tag }).then(setItems).catch(()=>{});
  }, [tag]);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-3">
      <h1 className="text-xl font-semibold">#{tag}</h1>
      {items.map((p)=> <PrayerCard key={p.id} item={p} />)}
      {!items.length && <div className="text-sm text-muted-foreground">No posts for this tag yet.</div>}
    </div>
  );
}
