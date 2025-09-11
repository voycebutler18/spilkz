import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPrayer } from "@/lib/prayers";
import PrayerCard from "@/components/prayers/PrayerCard";

export default function PrayerDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    fetchPrayer(id).then(setItem).catch(()=>{});
  }, [id]);

  if (!item) return <div className="mx-auto max-w-3xl p-4">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <PrayerCard item={item} />
    </div>
  );
}
