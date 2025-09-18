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
import {
  Sparkles,
  LogOut,
  Home,
  Upload,
  Utensils,
  Heart,
  Building2,
  HelpCircle,
  Info,
  Bookmark,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

const SHOW_MESSAGES = false;

const MobileMenu = ({ open, onClose }: MobileMenuProps) => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [unread, setUnread] = useState<number>(0);
  const navigate = useNavigate();

  // Close the sheet, then navigate (avoids focus-trap issues on iOS)
  const go = (path: string) => {
    onClose();
    setTimeout(() => navigate(path), 0);
  };

  /* ---------------- auth ---------------- */
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthed(!!data.session);
      setUserId(data.session?.user?.id ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsAuthed(!!session);
        setUserId(session?.user?.id ?? null);
      }
    );

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  /* ---------------- unread recount helper ---------------- */
  const recountUnread = async (uid: string) => {
    try {
      const { count } = await supabase
        .from("notes")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", uid)
        .is("deleted_at", null)
        .is("read_at", null);
      setUnread(count ?? 0);
    } catch {
      // ignore
    }
  };

  /* ---------------- live badge sync ---------------- */
  useEffect(() => {
    if (!userId) return;

    // initial count
    recountUnread(userId);

    // realtime: new notes for me
    const ch = supabase
      .channel("mobilemenu-notes-badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notes", filter: `recipient_id=eq.${userId}` },
        () => recountUnread(userId)
      )
      .subscribe();

    // custom event from Notes page when it marks/deletes
    const onPing = () => recountUnread(userId);
    window.addEventListener("notes:inboxChanged", onPing);

    // recount when the app becomes visible
    const onVisible = () => {
      if (document.visibilityState === "visible") recountUnread(userId);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("notes:inboxChanged", onPing);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [userId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    go("/");
  };

  const unreadLabel = unread > 99 ? "99+" : String(unread);

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      {/* NOTE: fixed Tailwind typo sm-[350px] -> sm:w-[350px] */}
      <SheetContent side="left" className="w-[280px] sm:w-[350px] pb-24 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Splikz
            </span>
          </SheetTitle>
        </SheetHeader>

        {/* Top Quick Actions */}
        <div className="mt-6 space-y-2">
          <Link
            to="/home"
            onClick={(e) => {
              e.preventDefault();
              go("/home");
            }}
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] bg-white/5"
          >
            <Home className="h-4 w-4 text-primary" />
            <span>Home</span>
          </Link>

          {isAuthed && (
            <Link
              to="/dashboard"
              onClick={(e) => {
                e.preventDefault();
                go("/dashboard");
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] bg-primary/10 border border-primary/20"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Creator Dashboard</span>
            </Link>
          )}

          {isAuthed && (
            <Button
              className="w-full rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => go("/upload")}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Content
            </Button>
          )}
        </div>

        {/* Browse Section */}
        <div className="mt-8">
          <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold px-4">
            Browse
          </div>
          <nav className="flex flex-col space-y-1">
            {/* Food */}
            <Link
              to="/food"
              onClick={(e) => {
                e.preventDefault();
                go("/food");
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
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
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
              aria-label="Daily Prayers"
              title="Daily Prayers"
            >
              <div className="text-amber-400 group-hover:text-amber-300 transition-colors text-sm">
                🙏
              </div>
              <span>Daily Prayers</span>
            </Link>

            {/* ✅ Splikz Dating */}
            <Link
              to="/dating"
              onClick={(e) => {
                e.preventDefault();
                go("/dating");
              }}
              className="flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
              aria-label="Splikz Dating"
              title="Splikz Dating"
            >
              <div className="flex items-center gap-3">
                <Heart className="h-4 w-4 text-pink-400 group-hover:text-pink-300 transition-colors" />
                <span>Splikz Dating</span>
              </div>
              <Badge
                variant="secondary"
                className="text-[9px] bg-pink-500/20 text-pink-200 px-2 py-0.5"
              >
                New
              </Badge>
            </Link>

            {/* For Brands */}
            <Link
              to="/brands"
              onClick={(e) => {
                e.preventDefault();
                go("/brands");
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
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
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
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
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Info className="h-4 w-4 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
              <span>About</span>
            </Link>
          </nav>
        </div>

        {/* Me Section */}
        {isAuthed && (
          <div className="mt-8">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold px-4">
              Me
            </div>
            <nav className="flex flex-col space-y-1">
              {/* My Bookmarks */}
              <Link
                to="/dashboard/bookmarks"
                onClick={(e) => {
                  e.preventDefault();
                  go("/dashboard/bookmarks");
                }}
                className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
              >
                <Bookmark className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
                <span>My Bookmarks</span>
              </Link>

              {/* My Boosts */}
              <Link
                to="/dashboard/boosts"
                onClick={(e) => {
                  e.preventDefault();
                  go("/dashboard/boosts");
                }}
                className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
              >
                <Heart className="h-4 w-4 text-red-400 group-hover:text-red-300 transition-colors" />
                <span>My Boosts</span>
              </Link>

              {/* NoteBox (with unread badge) */}
              <Link
                to="/notes"
                onClick={(e) => {
                  e.preventDefault();
                  go("/notes");
                }}
                className="flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
              >
                <div className="flex items-center gap-3">
                  <div className="text-yellow-400 group-hover:text-yellow-300 transition-colors text-sm">
                    📝
                  </div>
                  <span>NoteBox</span>
                </div>

                {userId && unread > 0 && (
                  <span
                    className="
                      inline-flex min-w-[18px] h-[18px] items-center justify-center
                      px-1 rounded-full text-[10px] leading-[18px]
                      bg-red-600 text-white font-semibold
                    "
                    aria-label={`${unread} unread notes`}
                  >
                    {unreadLabel}
                  </span>
                )}
              </Link>

              {/* Messages (hidden while SHOW_MESSAGES is false) */}
              {SHOW_MESSAGES && (
                <Link
                  to="/messages"
                  onClick={(e) => {
                    e.preventDefault();
                    go("/messages");
                  }}
                  className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Messages
                </Link>
              )}
            </nav>
          </div>
        )}

        {/* Sign Out */}
        {isAuthed && (
          <div className="mt-6 px-4">
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-medium hover:bg-red-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-red-400 hover:text-red-300 border border-red-500/30"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        )}

        {/* Auth CTA (sticky) */}
        {!isAuthed && (
          <div className="fixed left-0 right-0 bottom-0 p-4 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 border-t border-white/10">
            <div className="px-2">
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
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default MobileMenu;
