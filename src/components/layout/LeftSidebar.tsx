import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Compass,
  Utensils,
  HeartHandshake,
  HelpCircle,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const Item: React.FC<
  React.PropsWithChildren<{ to: string; icon?: React.ReactNode; className?: string }>
> = ({ to, icon, children, className }) => {
  const { pathname } = useLocation();
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
        active ? "bg-white/5 text-foreground" : "text-foreground/80 hover:bg-white/5",
        className
      )}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
};

export default function LeftSidebar() {
  return (
    <aside className="sticky top-[56px] hidden h-[calc(100vh-56px)] w-[260px] shrink-0 overflow-y-auto border-r border-white/10 px-3 pb-6 pt-4 md:block">
      {/* Create card */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-4 shadow-soft">
        <div className="mb-3 text-sm font-semibold">Create a Splik</div>
        <p className="mb-3 text-xs text-muted-foreground">
          Share a 3-second mood. Keep it crisp.
        </p>
        <Button asChild size="sm" className="w-full gap-2">
          <Link to="/upload">
            <Upload className="h-4 w-4" />
            Upload
          </Link>
        </Button>
      </div>

      {/* NEW: one-click moods entry */}
      <Link
        to="/moods"
        className="mt-4 block rounded-2xl border border-white/10 bg-[radial-gradient(120%_80%_at_10%_0%,rgba(124,58,237,.18),rgba(6,182,212,.12)_50%,transparent_75%)] p-3 transition hover:border-white/20"
      >
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-9">
            {/* little colorful “vibe” dots */}
            <span className="absolute left-0 top-1 h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="absolute right-0 top-0.5 h-2.5 w-2.5 rounded-full bg-sky-400" />
            <span className="absolute left-1 bottom-0 h-2.5 w-2.5 rounded-full bg-fuchsia-400" />
            <span className="absolute right-1 bottom-0.5 h-2.5 w-2.5 rounded-full bg-rose-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 opacity-90" />
              <span className="truncate text-sm font-semibold">Vibe Feed</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Watch videos by mood
            </p>
          </div>
        </div>
      </Link>

      {/* Browse section */}
      <div className="mt-5 border-t border-white/10 pt-3 text-xs uppercase tracking-wide text-muted-foreground">
        Browse
      </div>
      <nav className="mt-1 flex flex-col gap-1">
        <Item to="/explore" icon={<Compass className="h-4 w-4" />}>
          Discover
        </Item>
        <Item to="/food" icon={<Utensils className="h-4 w-4" />}>
          Food
        </Item>
        <Item to="/brands" icon={<HeartHandshake className="h-4 w-4" />}>
          For Brands
        </Item>
        <Item to="/help" icon={<HelpCircle className="h-4 w-4" />}>
          Help
        </Item>
      </nav>
    </aside>
  );
}
