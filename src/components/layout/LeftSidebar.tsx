// src/components/layout/LeftSidebar.tsx
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Heart, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

const LeftSidebar: React.FC = () => {
  const [user, setUser] = React.useState<any>(null);
  const location = useLocation();

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

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
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
            to="/home"
            className={cn(
              "block rounded-lg px-3 py-2 text-sm hover:bg-white/5",
              isActive("/home") && "bg-white/10 font-medium"
            )}
          >
            Home
          </Link>

          <Link
            to="/food"
            className={cn(
              "block rounded-lg px-3 py-2 text-sm hover:bg-white/5",
              isActive("/food") && "bg-white/10 font-medium"
            )}
          >
            Food
          </Link>

          <Link
            to="/prayers"
            className={cn(
              "block rounded-lg px-3 py-2 text-sm hover:bg-white/5",
              isActive("/prayers") && "bg-white/10 font-medium"
            )}
          >
            🙏 Daily Prayers
          </Link>

          {/* ✅ Splikz Dating (active link) */}
          <Link
            to={user ? "/dating" : "/login?next=/dating"}
            className={cn(
              "block rounded-lg px-3 py-2 text-sm hover:bg-white/5",
              isActive("/dating") && "bg-white/10 font-medium"
            )}
            title={user ? "Splikz Dating" : "Sign in to use Splikz Dating"}
          >
            Splikz Dating
          </Link>

          <Link
            to="/brands"
            className={cn(
              "block rounded-lg px-3 py-2 text-sm hover:bg-white/5",
              isActive("/brands") && "bg-white/10 font-medium"
            )}
          >
            For Brands
          </Link>
          <Link
            to="/help"
            className={cn(
              "block rounded-lg px-3 py-2 text-sm hover:bg-white/5",
              isActive("/help") && "bg-white/10 font-medium"
            )}
          >
            Help
          </Link>
          <Link
            to="/about"
            className={cn(
              "block rounded-lg px-3 py-2 text-sm hover:bg-white/5",
              isActive("/about") && "bg-white/10 font-medium"
            )}
          >
            About
          </Link>
        </nav>

        {/* Me Section - Only show if user is logged in */}
        {user && (
          <>
            <div className="mt-5 border-b border-border/60 pb-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              Me
            </div>
            <nav className="mt-3 space-y-1">
              {/* ✅ New Reactions System Links */}
              <Link
                to="/dashboard/bookmarks"
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5",
                  isActive("/dashboard/bookmarks") && "bg-white/10 font-medium"
                )}
              >
                <Bookmark className="h-4 w-4" />
                My Bookmarks
              </Link>

              <Link
                to="/dashboard/boosts"
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5",
                  isActive("/dashboard/boosts") && "bg-white/10 font-medium"
                )}
              >
                <Heart className="h-4 w-4" />
                My Boosts
              </Link>

              {/* Notes link */}
              <Link
                to="/notes"
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm hover:bg-white/5",
                  isActive("/notes") && "bg-white/10 font-medium"
                )}
              >
                📝 NoteBox
              </Link>
            </nav>
          </>
        )}

        <div className="pb-6" />
      </div>
    </aside>
  );
};

export default LeftSidebar;
