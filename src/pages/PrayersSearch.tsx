import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchPrayers, Prayer } from "@/lib/prayers";
import PrayerCard from "@/components/prayers/PrayerCard";
import { Input } from "@/components/ui/input";

export default function PrayersSearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const [term, setTerm] = useState(q);
  const [items, setItems] = useState<Prayer[]>([]);

  const search = async (query: string) => {
    const res = await fetchPrayers({ q: query });
    setItems(res);
  };

  useEffect(() => { if (q) search(q); }, [q]);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-3">
      <h1 className="text-xl font-semibold">Search Prayers</h1>
      <div className="flex gap-2">
        <Input value={term} onChange={(e)=>setTerm(e.target.value)} placeholder="Search text…" />
        <button
          className="rounded-md border px-3"
          onClick={()=>{ setParams({ q: term }); }}
        >Search</button>
      </div>
      <div className="space-y-3">
        {items.map((p)=> <PrayerCard key={p.id} item={p} />)}
      </div>
    </div>
  );
}
