// src/components/layout/AppLayout.tsx
import * as React from "react";
import { Outlet, Link } from "react-router-dom";
import { Menu } from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import LeftSidebar from "@/components/layout/LeftSidebar";

/* ✅ mobile-only UI */
import MobileMenu from "@/components/layout/MobileMenu";
import MobileTabBar from "@/components/layout/MobileTabBar";
import { useUploadModal } from "@/contexts/UploadModalContext";
import { supabase } from "@/integrations/supabase/client";

const AppLayout: React.FC = () => {
  /* mobile state only */
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [user, setUser] = React.useState<any>(null);
  const { openUpload } = useUploadModal();

  React.useEffect(() => {
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
    <div className="min-h-screen bg-background text-foreground">
      {/* ───────────────── DESKTOP (unchanged) ───────────────── */}
      <div className="hidden md:block">
        {/* Global top bar */}
        <Header />

        {/* 3-column shell: Left rail (fixed), Main content, optional Right rail */}
        <div className="mx-auto grid max-w-7xl grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[260px_1fr_320px]">
          {/* Fixed left rail (desktop only) */}
          <LeftSidebar />

          {/* Main content area */}
          <main
            id="main"
            className="min-h-[calc(100vh-56px)] px-3 sm:px-4 py-4"
            role="main"
          >
            <Outlet />
          </main>

          {/* (Optional) right rail placeholder; keep empty for now */}
          <aside className="hidden border-l border-border/60 p-3 lg:block">
            {/* Right rail content can go here later (Trending, etc.) */}
          </aside>
        </div>

        {/* Global footer */}
        <Footer />
      </div>

      {/* ───────────────── MOBILE-ONLY SHELL ───────────────── */}
      <div className="md:hidden">
        {/* Top bar for mobile */}
        <div className="sticky top-0 z-40 h-12 border-b bg-background/95 backdrop-blur px-3 flex items-center justify-between">
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

        {/* Content with padding so bottom bar doesn’t overlap */}
        <main className="px-3 sm:px-4 py-3 pb-24">
          <Outlet />
        </main>

        {/* Bottom tab bar (Home • Discover • Upload • Messages • Profile) */}
        <MobileTabBar
          onUploadClick={() => openUpload({ onCompleteNavigateTo: "/dashboard" })}
          isAuthed={!!user}
          profilePath={profilePath}
        />

        {/* Slide-out left menu */}
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
    </div>
  );
};

export default AppLayout;
