// src/components/layout/MobileMenu.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

const DASHBOARD_PATH = "/dashboard";

const MobileMenu = ({ open, onClose }: MobileMenuProps) => {
  const [isAuthed, setIsAuthed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthed(!!data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onClose();
    navigate("/");
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-[280px] sm:w-[350px]">
        <SheetHeader>
          <SheetTitle className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Splikz
            </span>
          </SheetTitle>
        </SheetHeader>

        {/* Browse */}
        <div className="mt-6 text-[11px] uppercase tracking-wide text-muted-foreground">
          Browse
        </div>
        <nav className="mt-2 flex flex-col space-y-2">
          <Link
            to="/explore"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            Discover
          </Link>

          <Link
            to="/food"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            Food
          </Link>

          {/* Splikz Dating (coming soon) – non-clickable row */}
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
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            For Brands
          </Link>
          <Link
            to="/help"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            Help
          </Link>
          <Link
            to="/about"
            onClick={onClose}
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
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
              >
                My Favorites
              </Link>
              <Link
                to="/messages"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
              >
                Messages
              </Link>
            </nav>
          </>
        )}

        {/* Auth / Dashboard actions */}
        <div className="mt-8 flex flex-col space-y-2">
          {isAuthed ? (
            <>
              <Button variant="outline" asChild onClick={onClose}>
                <Link to={DASHBOARD_PATH}>Creator Dashboard</Link>
              </Button>
              <Button variant="destructive" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" asChild onClick={onClose}>
                <Link to="/login">Log in</Link>
              </Button>
              <Button
                className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                asChild
                onClick={onClose}
              >
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileMenu;
