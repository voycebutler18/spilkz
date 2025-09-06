// src/components/layout/LeftSidebar.tsx
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Compass, Sandwich, Info, Store, HelpCircle, HeartPulse, Flame,
  MapPin, Users, Star, MessageSquare, Settings, Sparkles, Upload, PlaySquare
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  badge?: string;
};

export default function LeftSidebar() {
  const { pathname, search } = useLocation();
  const nav = useNavigate();
  const isActive = (to: string, exact = false) =>
    exact ? pathname === to : (pathname + search).startsWith(to);

  const browse: NavItem[] = [
    { to: "/explore", label: "Discover", icon: <Compass className="h-4 w-4" /> },
    { to: "/trending", label: "Trending", icon: <Flame className="h-4 w-4" />, badge: "Hot" },
    { to: "/moods", label: "Moods", icon: <HeartPulse className="h-4 w-4" /> },
    { to: "/nearby", label: "Nearby", icon: <MapPin className="h-4 w-4" /> },
    { to: "/food", label: "Food", icon: <Sandwich className="h-4 w-4" />, badge: "Fresh" },
  ];

  const community: NavItem[] = [
    { to: "/creators", label: "Creators", icon: <Users className="h-4 w-4" /> },
    { to: "/challenges", label: "Challenges", icon: <Sparkles className="h-4 w-4" /> },
    { to: "/events", label: "Events", icon: <PlaySquare className="h-4 w-4" /> },
    { to: "/brands", label: "For Brands", icon: <Store className="h-4 w-4" /> },
  ];

  const yours: NavItem[] = [
    { to: "/favorites", label: "My Favorites", icon: <Star className="h-4 w-4" /> },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
    { to: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
    { to: "/help", label: "Help", icon: <HelpCircle className="h-4 w-4" /> },
    { to: "/about", label: "About", icon: <Info className="h-4 w-4" /> },
  ];

  const MoodChip = ({
    to,
    label,
    hue,
  }: {
    to: string;
    label: string;
    hue: number; // 0..360
  }) => (
    <Link
      to={to}
      className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-foreground/80 hover:bg-white/10 hover:text-foreground transition"
      title={`${label} mood`}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: `hsl(${hue} 90% 55%)` }}
      />
      <span>{label}</span>
    </Link>
  );

  const Item = ({ item }: { item: NavItem }) => {
    const active = isActive(item.to, item.exact);
    return (
      <Link
        to={item.to}
        className={cn(
          "group relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition",
          "hover:bg-white/5",
          active ? "bg-white/7 text-foreground" : "text-foreground/80"
        )}
      >
        {/* active accent bar */}
        <span
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary/70 opacity-0 transition group-hover:opacity-100",
            active && "opacity-100"
          )}
        />
        <span className="flex items-center gap-2 pl-1">
          <span className={cn("text-muted-foreground group-hover:text-foreground", active && "text-foreground")}>
            {item.icon}
          </span>
          {item.label}
        </span>
        {item.badge && (
          <span className="rounded-full border border-primary/20 bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className="
        sticky top-14
        hidden md:block
        h-[calc(100dvh-56px)]
        w-64 flex-shrink-0
        overflow-y-auto
        border-r border-white/10
        bg-gradient-to-b from-background/60 to-background/30
        px-3 py-4
      "
    >
      {/* Create card */}
      <div className="mb-3 rounded-2xl border border-white/10 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(124,58,237,.15),rgba(56,189,248,.08)_45%,transparent_70%)] p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/20">
            <Upload className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Create a Splik</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Share a 3-second mood. Keep it crisp.
            </p>
            <button
              onClick={() => nav("/upload")}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition"
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
          </div>
        </div>
      </div>

      {/* Mood quick filters */}
      <div className="mb-3 flex flex-wrap gap-2 px-1">
        <MoodChip to="/moods/happy" label="Happy" hue={48} />
        <MoodChip to="/moods/chill" label="Chill" hue={190} />
        <MoodChip to="/moods/hype" label="Hype" hue={280} />
        <MoodChip to="/moods/romance" label="Romance" hue={340} />
        <MoodChip to="/moods/aww" label="Aww" hue={20} />
      </div>

      {/* Sections */}
      <Section title="Browse" />
      <nav className="flex flex-col gap-1">
        {browse.map((it) => (
          <Item key={it.to} item={it} />
        ))}
      </nav>

      <Divider />

      <Section title="Community" />
      <nav className="flex flex-col gap-1">
        {community.map((it) => (
          <Item key={it.to} item={it} />
        ))}
      </nav>

      <Divider />

      <Section title="You" />
      <nav className="flex flex-col gap-1">
        {yours.map((it) => (
          <Item key={it.to} item={it} />
        ))}
      </nav>

      {/* Tiny footer */}
      <div className="mt-4 px-1">
        <p className="text-[11px] text-muted-foreground">
          Built for moments, not minutes. <span className="text-foreground/70">#3Seconds</span>
        </p>
      </div>
    </aside>
  );
}

/* ========== helpers ========== */

function Section({ title }: { title: string }) {
  return (
    <div className="mb-1 mt-2 flex items-center gap-2 px-1">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-[11px] tracking-wide text-muted-foreground">{title}</span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function Divider() {
  return <div className="my-3 h-px w-full bg-white/10" />;
}
