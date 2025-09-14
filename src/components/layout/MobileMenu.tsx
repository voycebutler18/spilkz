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
import { Sparkles, LogOut, Home, Upload, Brain, Utensils, Heart, Building2, HelpCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void; // parent should set open = false
}

const DASHBOARD_PATH = "/dashboard";

// 🔒 Hide Messages link in the mobile menu for now.
// Set to true later to re-enable.
const SHOW_MESSAGES = false;

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    go("/");
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      {/* give the content bottom padding so the sticky CTA never overlaps list */}
      <SheetContent side="left" className="w-[280px] sm:w-[350px] pb-24">
        <SheetHeader>
          <SheetTitle className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Splikz
            </span>
          </SheetTitle>
        </SheetHeader>

        {/* Top links */}
        <nav className="mt-8 flex flex-col space-y-2">
          <Link
            to="/"
            onClick={(e) => {
              e.preventDefault();
              go("/");
            }}
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Home className="h-4 w-4 text-primary" />
            <span>Home</span>
          </Link>

          {isAuthed && (
            <Link
              to={DASHBOARD_PATH}
              onClick={(e) => {
                e.preventDefault();
                go(DASHBOARD_PATH);
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Creator Dashboard</span>
            </Link>
          )}

          {isAuthed && (
            <Button 
              className="mt-2 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]" 
              onClick={() => go("/upload")}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          )}
        </nav>

        {/* Browse Section */}
        <div className="mt-8">
          <div className="mb-4 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold px-4">
            Browse
          </div>
          <nav className="flex flex-col space-y-1">
            {/* Thoughts */}
            <Link
              to="/thoughts"
              onClick={(e) => {
                e.preventDefault();
                go("/thoughts");
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Brain className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
              <span>Thoughts</span>
            </Link>

            {/* Food */}
            <Link
              to="/food"
              onClick={(e) => {
                e.preventDefault();
                go("/food");
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Utensils className="h-4 w-4 text-orange-400 group-hover:text-orange-300 transition-colors" />
              <span>Food</span>
            </Link>

            {/* Daily Prayers */}
            <Link
              to="/prayers"
              onClick={(e) => {
                e.preventDefault();
                go("/prayers");
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
              aria-label="Daily Prayers"
              title="Daily Prayers"
            >
              <div className="text-amber-400 group-hover:text-amber-300 transition-colors text-base">🙏</div>
              <span>Daily Prayers</span>
            </Link>

            {/* Dating - Coming Soon */}
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground/70 bg-white/5 cursor-not-allowed select-none border border-dashed border-white/20"
              aria-disabled="true"
              title="Splikz Dating is coming soon"
            >
              <div className="flex items-center gap-3">
                <Heart className="h-4 w-4 text-pink-400/50" />
                <span>Splikz Dating</span>
              </div>
              <Badge variant="secondary" className="text-[10px] bg-white/10 text-white/60">
                Soon
              </Badge>
            </div>

            {/* For Brands */}
            <Link
              to="/brands"
              onClick={(e) => {
                e.preventDefault();
                go("/brands");
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Building2 className="h-4 w-4 text-purple-400 group-hover:text-purple-300 transition-colors" />
              <span>For Brands</span>
            </Link>

            {/* Help */}
            <Link
              to="/help"
              onClick={(e) => {
                e.preventDefault();
                go("/help");
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <HelpCircle className="h-4 w-4 text-green-400 group-hover:text-green-300 transition-colors" />
              <span>Help</span>
            </Link>

            {/* About */}
            <Link
              to="/about"
              onClick={(e) => {
                e.preventDefault();
                go("/about");
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Info className="h-4 w-4 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
              <span>About</span>
            </Link>
          </nav>
        </div>

        {/* Me Section */}
        {isAuthed && (
          <div className="mt-8">
            <div className="mb-4 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold px-4">
              Me
            </div>
            <nav className="flex flex-col space-y-1">
              <Link
                to="/dashboard/favorites"
                onClick={(e) => {
                  e.preventDefault();
                  go("/dashboard/favorites");
                }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
              >
                <Heart className="h-4 w-4 text-red-400 group-hover:text-red-300 transition-colors" />
                <span>My Favorites</span>
              </Link>

              {/* Messages is hidden while SHOW_MESSAGES is false */}
              {SHOW_MESSAGES && (
                <Link
                  to="/messages"
                  onClick={(e) => {
                    e.preventDefault();
                    go("/messages");
                  }}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Messages
                </Link>
              )}

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-red-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-red-400 hover:text-red-300"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </button>
            </nav>
          </div>
        )}

        {/* Auth actions / sticky bottom CTA  */}
        <div className="fixed left-0 right-0 bottom-0 p-4 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 border-t border-white/10">
          <div className="px-2">
            {isAuthed ? (
              <Button 
                variant="outline" 
                className="w-full rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all duration-200" 
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1 rounded-xl border-white/20 hover:bg-white/10 transition-all duration-200" 
                  onClick={() => go("/login")}
                >
                  Log in
                </Button>
                <Button
                  className="flex-1 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => go("/signup")}
                >
                  Sign up
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileMenu;
