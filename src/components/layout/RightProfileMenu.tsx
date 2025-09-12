import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  className?: string;
};

/** Minimal, dependency-free profile menu used by Header.
 *  - Shows Login/Signup when signed out
 *  - Shows a tiny avatar + dropdown when signed in
 */
const RightProfileMenu: React.FC<Props> = ({ className }) => {
  const [user, setUser] = React.useState<any>(null);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  React.useEffect(() => {
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

  // close when clicking outside
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    setOpen(false);
    navigate("/");
  };

  if (!user) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="rounded-lg px-3 py-1.5 text-sm border border-border/70 hover:bg-white/5"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="rounded-lg px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:opacity-90"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  const initial =
    (user.user_metadata?.full_name?.[0] ||
      user.user_metadata?.username?.[0] ||
      user.email?.[0] ||
      "U").toUpperCase();

  const profilePath = `/creator/${user.user_metadata?.username || user.id}`;

  return (
    <div className={className} ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-full border border-border/70 px-2 py-1 hover:bg-white/5"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-white grid place-items-center text-sm font-semibold">
          {initial}
        </div>
        <svg
          className="h-4 w-4 opacity-70"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-3 mt-2 w-56 rounded-xl border border-border/70 bg-background shadow-lg overflow-hidden z-50"
        >
          <Link
            to={profilePath}
            className="block px-4 py-2.5 text-sm hover:bg-white/5"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            Profile
          </Link>
          <Link
            to="/dashboard"
            className="block px-4 py-2.5 text-sm hover:bg-white/5"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            Dashboard
          </Link>
          <Link
            to="/thoughts"
            className="block px-4 py-2.5 text-sm hover:bg-white/5"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            Thoughts
          </Link>
          <div className="h-px bg-border/70 my-1" />
          <Link
            to="/settings"
            className="block px-4 py-2.5 text-sm hover:bg-white/5"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            Settings
          </Link>
          <button
            onClick={onLogout}
            className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10"
            role="menuitem"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
};

export default RightProfileMenu;
