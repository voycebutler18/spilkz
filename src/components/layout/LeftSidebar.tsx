// src/components/layout/LeftSidebar.tsx
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Home,
  Compass,
  Utensils,
  Megaphone,
  LifeBuoy,
  Info,
  Heart,
  MessageSquare,
  Cog,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarLinkProps = {
  to: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  className?: string;
};

function SidebarLink({ to, label, icon, exact = false, className }: SidebarLinkProps) {
  const { pathname } = useLocation();
  const isActive = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <Link
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
        "hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        isActive ? "bg-white/5 text-foreground" : "text-foreground/80",
        className
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-md",
          isActive ? "text-primary" : "text-foreground/70 group-hover:text-foreground"
        )}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {isActive && <ChevronRight className="h-4 w-4 text-primary/80" />}
    </Link>
  );
}

const LeftSidebar: React.FC = () => {
  const [user, setUser] = React.useState<any>(null);

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(data.user ?? null);
    };
    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-56px)] w-[260px] flex-shrink-0 border-r border-border/60 p-3 md:flex">
      <div className="flex w-full flex-col gap-3">
        {/* Upload CTA */}
        <Card className="border-white/10 bg-gradient-to-b from-white/5 to-transparent shadow-soft">
          <CardContent className="p-4">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-cyan-400">
                <Sparkles className="h-4 w-4 text-white" />
              </span>
              Create a Splik
            </div>
            <p className="text-xs text-muted-foreground">
              Share a crisp 3-second moment.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link to="/upload">Upload</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Section title */}
        <div className="mt-1 border-t border-border/60 pt-3 text-xs uppercase tracking-wide text-muted-foreground">
          Browse
        </div>

        {/* Core nav (no new features added) */}
        <SidebarLink to="/" exact label="Home" icon={<Home className="h-4 w-4" />} />
        <SidebarLink to="/explore" label="Discover" icon={<Compass className="h-4 w-4" />} />
        <SidebarLink to="/food" label="Food" icon={<Utensils className="h-4 w-4" />} />
        <SidebarLink to="/brands" label="For Brands" icon={<Megaphone className="h-4 w-4" />} />
        <SidebarLink to="/help" label="Help" icon={<LifeBuoy className="h-4 w-4" />} />
        <SidebarLink to="/about" label="About" icon={<Info className="h-4 w-4" />} />

        <div className="my-2 h-px bg-border/60" />

        {/* Signed-in only */}
        {user && (
          <>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Me</div>
            <SidebarLink
              to="/dashboard/favorites"
              label="My Favorites"
              icon={<Heart className="h-4 w-4" />}
            />
            <SidebarLink
              to="/messages"
              label="Messages"
              icon={<MessageSquare className="h-4 w-4" />}
            />
            {/* Keep Settings only if your route exists; otherwise remove to avoid 404 */}
            <SidebarLink to="/settings" label="Settings" icon={<Cog className="h-4 w-4" />} />
          </>
        )}
      </div>
    </aside>
  );
};

export default LeftSidebar;
