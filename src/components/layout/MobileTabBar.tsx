// src/components/layout/MobileTabBar.tsx
import { useLocation, useNavigate, NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { Home, PlusCircle, User, Heart, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MobileTabBarProps {
  onUploadClick: () => void;    // opens your existing Upload modal
  isAuthed?: boolean;
  profilePath?: string;         // e.g. `/creator/:slug` or `/dashboard`
}

const item =
  "flex flex-col items-center justify-center flex-1 py-3 text-xs transition-all duration-200 hover:scale-105 active:scale-95";

const icon = (active: boolean) =>
  `h-6 w-6 transition-colors duration-200 ${active ? "text-primary" : "text-muted-foreground"}`;

const label = (active: boolean) =>
  `mt-1 font-medium transition-colors duration-200 ${active ? "text-primary" : "text-muted-foreground"}`;

export default function MobileTabBar({
  onUploadClick,
  isAuthed = false,
  profilePath = "/dashboard",
}: MobileTabBarProps) {
  const nav = useNavigate();
  const { pathname } = useLocation();

  // (kept tiny auth state only if you need it later; safe to remove)
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => mounted && setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const isProfile =
    pathname.startsWith("/creator") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/dashboard");

  const isPrayers = pathname === "/prayers";
  const isNotes = pathname === "/notes";

  return (
    <nav
      className="
        md:hidden fixed bottom-0 left-0 right-0 z-40
        border-t border-border/50 bg-background/95 backdrop-blur-xl 
        supports-[backdrop-filter]:bg-background/80
        pb-[env(safe-area-inset-bottom)]
        shadow-2xl shadow-black/20
      "
      aria-label="Primary"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* 5 tabs: Home, NoteBox, Prayers, Upload, Profile */}
      <div className="mx-auto max-w-[520px] grid grid-cols-5 px-2">
        {/* Home */}
        <NavLink to="/" className={item}>
          {({ isActive }) => (
            <div className="relative">
              {isActive && <div className="absolute -inset-2 bg-primary/10 rounded-2xl blur-sm" />}
              <div className="relative flex flex-col items-center">
                <Home className={icon(isActive || pathname === "/")} />
                <span className={label(isActive || pathname === "/")}>Home</span>
              </div>
            </div>
          )}
        </NavLink>

        {/* NoteBox */}
        <NavLink to="/notes" className={item}>
          {({ isActive }) => (
            <div className="relative">
              {(isActive || isNotes) && (
                <div className="absolute -inset-2 bg-primary/10 rounded-2xl blur-sm" />
              )}
              <div className="relative flex flex-col items-center">
                <Inbox className={`${icon(isActive || isNotes)} ${(isActive || isNotes) ? "fill-current" : ""}`} />
                <span className={label(isActive || isNotes)}>NoteBox</span>
              </div>
            </div>
          )}
        </NavLink>

        {/* Daily Prayers */}
        <NavLink to="/prayers" className={item}>
          {({ isActive }) => (
            <div className="relative">
              {isActive && <div className="absolute -inset-2 bg-primary/10 rounded-2xl blur-sm" />}
              <div className="relative flex flex-col items-center">
                <div className="relative">
                  <Heart className={`${icon(isActive || isPrayers)} ${(isActive || isPrayers) ? "fill-current" : ""}`} />
                  {(isActive || isPrayers) && (
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg animate-pulse" />
                  )}
                </div>
                <span className={label(isActive || isPrayers)}>Prayers</span>
              </div>
            </div>
          )}
        </NavLink>

        {/* Upload */}
        <button
          className={`${item} text-primary relative group`}
          onClick={onUploadClick}
          aria-label="Upload"
        >
          <div className="relative">
            <div className="absolute -inset-3 bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 group-active:opacity-75 transition-all duration-300" />
            <div className="relative bg-gradient-to-r from-primary via-primary to-primary rounded-2xl p-2 shadow-lg group-hover:shadow-xl group-hover:shadow-primary/25 transition-all duration-200">
              <PlusCircle className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <span className="mt-1 font-semibold text-primary">Upload</span>
        </button>

        {/* Profile / Login */}
        <button
          className={item}
          onClick={() => nav(isAuthed ? profilePath : "/login")}
          aria-label="Profile"
        >
          <div className="relative">
            {isProfile && <div className="absolute -inset-2 bg-primary/10 rounded-2xl blur-sm" />}
            <div className="relative flex flex-col items-center">
              <div className="relative">
                <User className={icon(isProfile)} />
                {isProfile && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
                )}
              </div>
              <span className={label(isProfile)}>{isAuthed ? "Profile" : "Login"}</span>
            </div>
          </div>
        </button>
      </div>
    </nav>
  );
}
