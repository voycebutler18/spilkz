// src/components/layout/LeftSidebar.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

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
    <>
      {/* Mobile-only teaser row (since the sidebar is hidden on small screens) */}
      <div className="md:hidden px-3 pt-2">
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/90 bg-white/5"
          aria-disabled="true"
          title="Splikz Dating is coming soon"
        >
          <span>Splikz Dating</span>
          <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
        </div>
      </div>

      {/* Desktop / tablet sidebar */}
      <aside
        className="
          hidden md:flex
          sticky top-14
          h-[calc(100svh-56px)] w-[260px]
          flex-shrink-0
          border-r border-border/60
          bg-background/40 backdrop-blur-sm
          overflow-y-auto overscroll-contain
        "
        aria-label="Left navigation"
      >
        <div className="w-full px-3 py-3">
          {/* Browse */}
          <div className="border-b border-border/60 pb-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            Browse
          </div>

          <nav className="mt-3 space-y-1">
            <Link
              to="/explore"
              className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5"
            >
              Discover
            </Link>

            <Link
              to="/food"
              className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5"
            >
              Food
            </Link>

            {/* Splikz Dating (coming soon) */}
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/90 hover:bg-white/5 cursor-not-allowed select-none"
              aria-disabled="true"
              title="Splikz Dating is coming soon"
            >
              <span>Splikz Dating</span>
              <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
            </div>

            <Link
              to="/brands"
              className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5"
            >
              For Brands
            </Link>
            <Link
              to="/help"
              className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5"
            >
              Help
            </Link>
            <Link
              to="/about"
              className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5"
            >
              About
            </Link>
          </nav>

          {/* Me */}
          {user && (
            <>
              <div className="mt-5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Me
              </div>
              <nav className="mt-1 space-y-1">
                <Link
                  to="/dashboard/favorites"
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5"
                >
                  My Favorites
                </Link>
                <Link
                  to="/messages"
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5"
                >
                  Messages
                </Link>
              </nav>
            </>
          )}

          <div className="pb-6" />
        </div>
      </aside>
    </>
  );
};

export default LeftSidebar;
