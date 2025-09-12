// src/components/layout/LeftSidebar.tsx
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Home,
  Compass,
  Utensils,
  Clapperboard,
  User,
  HelpCircle,
  Info,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  exact?: boolean;
};

const NAV_MAIN: NavItem[] = [
  { to: "/home", label: "Home", icon: Home, exact: true },
  { to: "/food", label: "Food", icon: Utensils },
  // (Search removed)
  // (Pulse removed to avoid broken link)
];

const NAV_EXPLORE: NavItem[] = [
  { to: "/splik/featured", label: "Featured", icon: Clapperboard },
  { to: "/profile/me", label: "My Profile", icon: User },
];

const NAV_SUPPORT: NavItem[] = [
  { to: "/help", label: "Help Center", icon: HelpCircle },
  { to: "/about", label: "About", icon: Info },
];

function useIsActive() {
  const { pathname } = useLocation();
  return React.useCallback(
    (to: string, exact?: boolean) =>
      exact ? pathname === to : pathname === to || pathname.startsWith(to),
    [pathname]
  );
}

function Section({
  title,
  items,
}: {
  title?: string;
  items: NavItem[];
}) {
  const isActive = useIsActive();
  return (
    <div className="space-y-1">
      {title ? (
        <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
      ) : null}
      <nav className="px-2">
        {items.map(({ to, label, icon: Icon, exact }) => {
          const active = isActive(to, exact);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                active && "bg-accent text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function LeftSidebar() {
  return (
    <aside
      className={cn(
        "hidden lg:flex lg:flex-col",
        "w-64 shrink-0 border-r border-border/60 bg-background/80 backdrop-blur"
      )}
    >
      {/* App brand / logo area */}
      <div className="px-4 py-4 border-b border-border/60">
        <Link to="/home" className="inline-flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold">Splikz</span>
        </Link>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        <Section items={NAV_MAIN} />
        <Section title="Explore" items={NAV_EXPLORE} />
        <Section title="Support" items={NAV_SUPPORT} />
      </div>

      {/* Footer note or version */}
      <div className="px-4 py-3 border-t border-border/60 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Splikz
      </div>
    </aside>
  );
}
