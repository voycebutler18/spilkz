// src/components/layout/MobileMenu.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void; // parent should set open = false
}

const DASHBOARD_PATH = "/dashboard";

const MobileMenu = ({ open, onClose }: MobileMenuProps) => {
  const [isAuthed, setIsAuthed] = useState(false);
  const navigate = useNavigate();

  // Close sheet then navigate — avoids iOS tap being swallowed by the dialog focus trap
  const go = (path: string) => {
    onClose();
    setTimeout(() => navigate(path), 0);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthed(!!data.session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => setIsAuthed(!!session)
    );

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // ⬇️ FIX: use hard reload after signOut so Chrome mobile doesn't keep the sheet overlay
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/"; // hard reload clears any stale session state
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <SheetContent side="left" className="w-[280px] sm:w-[350px]">
        <SheetHeader>
          <SheetTitle className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Splikz
            </span>
          </SheetTitle>
        </SheetHeader>

        {/* Top links */}
        <nav className="mt-6 flex flex-col space-y-3">
          <Link
            to="/"
            onClick={(e) => {
              e.preventDefault();
              go("/");
            }}
            className="text-sm font-medium hover:text-primary"
          >
            Home
          </Link>

          {isAuthed && (
            <Link
              to={DASHBOARD_PATH}
              onClick={(e) => {
                e.preventDefault();
                go(DASHBOARD_PATH);
              }}
              className="text-sm font-medium hover:text-primary"
            >
              Creator Dashboard
            </Link>
          )}

          {/* Optional upload CTA */}
          {isAuthed && (
            <Button className="mt-1" onClick={() => go("/upload")}>
              Upload
            </Button>
          )}
        </nav>

        {/* Browse */}
        <div className="mt-6 text-[11px] uppercase tracking-wide text-muted-foreground">
          Browse
        </div>
        <nav className="mt-2 flex flex-col space-y-2">
          <Link
            to="/explore"
            onClick={(e) => {
              e.preventDefault();
              go("/explore");
            }}
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            Discover
          </Link>

          <Link
            to="/food"
            onClick={(e) => {
              e.preventDefault();
              go("/food");
            }}
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            Food
          </Link>

          <div
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/90 bg-white/5 cursor-not-allowed select-none"
            aria-disabled="true"
            title="Splikz Dating is coming soon"
          >
            <span>Splikz Dating</span>
            <Badge variant="secondary" className="text-[10px]">
              Coming soon
            </Badge>
          </div>

          <Link
            to="/brands"
            onClick={(e) => {
              e.preventDefault();
              go("/brands");
            }}
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            For Brands
          </Link>
          <Link
            to="/help"
            onClick={(e) => {
              e.preventDefault();
              go("/help");
            }}
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            Help
          </Link>
          <Link
            to="/about"
            onClick={(e) => {
              e.preventDefault();
              go("/about");
            }}
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            About
          </Link>
        </nav>

        {/* Me */}
        {isAuthed && (
          <>
            <div className="mt-6 text-[11px] uppercase tracking-wide text-muted-foreground">
              Me
            </div>
            <nav className="mt-2 flex flex-col space-y-2">
              <Link
                to="/dashboard/favorites"
                onClick={(e) => {
                  e.preventDefault();
                  go("/dashboard/favorites");
                }}
                className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
              >
                My Favorites
              </Link>
              <Link
                to="/messages"
                onClick={(e) => {
                  e.preventDefault();
                  go("/messages");
                }}
                className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
              >
                Messages
              </Link>
            </nav>
          </>
        )}

        {/* Auth actions */}
        <div className="mt-8 flex flex-col space-y-2">
          {isAuthed ? (
            <Button variant="outline" onClick={handleSignOut}>
              Sign out
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => go("/login")}>
                Log in
              </Button>
              <Button
                className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                onClick={() => go("/signup")}
              >
                Sign up
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileMenu;
