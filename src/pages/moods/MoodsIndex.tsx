// src/pages/moods/MoodsIndex.tsx
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Card } from "@/components/ui/card";

type Mood = { key: string; label: string; dot: string; desc?: string };

const MOODS: Mood[] = [
  { key: "happy",    label: "Happy",    dot: "bg-yellow-400",  desc: "feel-good, upbeat" },
  { key: "chill",    label: "Chill",    dot: "bg-sky-400",     desc: "calm, mellow" },
  { key: "hype",     label: "Hype",     dot: "bg-fuchsia-400", desc: "energy, flex" },
  { key: "romance",  label: "Romance",  dot: "bg-rose-400",    desc: "love, vibes" },
  { key: "aww",      label: "Aww",      dot: "bg-orange-400",  desc: "cute, wholesome" },
  { key: "funny",    label: "Funny",    dot: "bg-amber-300",   desc: "lol, comedy" },
  { key: "excited",  label: "Excited",  dot: "bg-pink-400",    desc: "hype-up feels" },
  { key: "relaxed",  label: "Relaxed",  dot: "bg-teal-300",    desc: "laid back" },
  { key: "inspired", label: "Inspired", dot: "bg-emerald-300", desc: "wow moments" },
  { key: "nostalgic",label: "Nostalgic",dot: "bg-indigo-300",  desc: "throwbacks" },
  { key: "motivated",label: "Motivated",dot: "bg-lime-300",    desc: "get after it" },
  { key: "neutral",  label: "Neutral",  dot: "bg-slate-300",   desc: "all vibes" },
];

export default function MoodsIndex() {
  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-4 py-6">
      <Helmet>
        <title>Vibe Feed — Browse by Mood • Splikz</title>
        <meta name="description" content="Pick a mood and watch matching 3-second videos on Splikz." />
      </Helmet>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Vibe Feed</h1>
        <p className="text-sm text-muted-foreground">Watch 3-second videos by how you feel.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {MOODS.map((m) => (
          <Link key={m.key} to={`/moods/${m.key}`} className="group">
            <Card className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:border-white/20">
              <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium group-hover:underline">{m.label}</div>
                {m.desc && <div className="truncate text-[11px] text-muted-foreground">{m.desc}</div>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
