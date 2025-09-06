import { Link, useNavigate } from "react-router-dom";
import { Upload, Compass, Heart, Settings, HelpCircle, Store, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const MOOD_CHIPS = [
  { key: "happy", label: "Happy", dot: "bg-yellow-400" },
  { key: "chill", label: "Chill", dot: "bg-sky-400" },
  { key: "hype", label: "Hype", dot: "bg-fuchsia-400" },
  { key: "romance", label: "Romance", dot: "bg-rose-400" },
  { key: "aww", label: "Aww", dot: "bg-orange-400" },
];

export default function LeftSidebar() {
  const navigate = useNavigate();
  return (
    <aside className="sticky top-[56px] hidden h-[calc(100vh-56px)] w-72 flex-shrink-0 overflow-y-auto border-r bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40 md:block">
      <div className="p-3 space-y-4">

        {/* Create a Splik card */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-purple-500/30 to-cyan-500/30 flex items-center justify-center">
              <Upload className="h-4 w-4 text-purple-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Create a Splik</h3>
              <p className="text-xs text-muted-foreground">Share a 3-second mood. Keep it crisp.</p>
              <Button
                size="sm"
                className="mt-3 w-full"
                onClick={() => navigate("/upload")}
              >
                <Upload className="h-4 w-4 mr-2" /> Upload
              </Button>
            </div>
          </div>
        </Card>

        {/* Mood chips -> link to /mood/:mood */}
        <div className="flex flex-wrap gap-2">
          {MOOD_CHIPS.map((m) => (
            <Button
              key={m.key}
              asChild
              size="sm"
              variant="outline"
              className="rounded-full"
            >
              <Link to={`/mood/${m.key}`}>
                <span className={`inline-block h-2 w-2 rounded-full mr-2 ${m.dot}`} />
                {m.label}
              </Link>
            </Button>
          ))}
        </div>

        {/* Browse section */}
        <div className="pt-4 border-t">
          <p className="px-1 pb-2 text-xs uppercase tracking-wide text-muted-foreground">Browse</p>
          <nav className="space-y-1">
            <Button variant="ghost" asChild className="w-full justify-start">
              <Link to="/explore"><Compass className="h-4 w-4 mr-2" /> Discover</Link>
            </Button>
            <Button variant="ghost" asChild className="w-full justify-start">
              <Link to="/food"><Sparkles className="h-4 w-4 mr-2" /> Food</Link>
            </Button>
            <Button variant="ghost" asChild className="w-full justify-start">
              <Link to="/brands"><Store className="h-4 w-4 mr-2" /> For Brands</Link>
            </Button>
            <Button variant="ghost" asChild className="w-full justify-start">
              <Link to="/help"><HelpCircle className="h-4 w-4 mr-2" /> Help</Link>
            </Button>
            <Button variant="ghost" asChild className="w-full justify-start">
              <Link to="/dashboard/favorites"><Heart className="h-4 w-4 mr-2" /> My Favorites</Link>
            </Button>
            <Button variant="ghost" asChild className="w-full justify-start">
              <Link to="/settings"><Settings className="h-4 w-4 mr-2" /> Settings</Link>
            </Button>
          </nav>
        </div>
      </div>
    </aside>
  );
}
