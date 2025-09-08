// src/components/layout/AppLayout.tsx
import { Outlet, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import MobileMenu from "@/components/layout/MobileMenu";
import MobileTabBar from "@/components/layout/MobileTabBar";
import { useUploadModal } from "@/contexts/UploadModalContext";
import { supabase } from "@/integrations/supabase/client";

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { openUpload } = useUploadModal();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const profilePath = user
    ? `/creator/${user.user_metadata?.username || user.id}`
    : "/dashboard";

  return (
    <div className="min-h-[100svh] bg-background">
      {/* Mobile top bar (desktop keeps your existing header/sidebar) */}
      <div className="md:hidden sticky top-0 z-40 h-12 border-b bg-background/95 backdrop-blur px-3 flex items-center justify-between">
        <button
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
          className="p-2 -ml-2"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Link to="/" className="font-bold text-lg">
          Splikz
        </Link>
        <div className="w-8" />
      </div>

      {/* Main content; bottom padding so tab bar doesn’t overlap on mobile */}
      <main className="pb-24 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile-only bottom tabs */}
      <MobileTabBar
        onUploadClick={() => openUpload({ onCompleteNavigateTo: "/dashboard" })}
        isAuthed={!!user}
        profilePath={profilePath}
      />

      {/* Slide-out menu (left sheet) */}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
