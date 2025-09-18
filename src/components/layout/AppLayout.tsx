// src/components/layout/AppLayout.tsx
import * as React from "react";
import { Outlet, Link } from "react-router-dom";
import { Menu } from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import LeftSidebar from "@/components/layout/LeftSidebar";

/* Mobile UI */
import MobileMenu from "@/components/layout/MobileMenu";
import MobileTabBar from "@/components/layout/MobileTabBar";
import { useUploadModal } from "@/contexts/UploadModalContext";
import { supabase } from "@/integrations/supabase/client";

/* Activity rails */
import RightActivityRail from "@/components/highlights/RightActivityRail";
import MobileActivity from "@/components/highlights/MobileActivity";

/* ✅ NoteBox unread badge/link */
import NoteBoxLink from "@/components/NoteBoxLink";

const AppLayout: React.FC = () => {
  // mobile state only
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [user, setUser] = React.useState<any>(null);
  const { openUpload } = useUploadModal();

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
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
      {/* ─────────────── DESKTOP / TABLET ─────────────── */}
      <div className="hidden md:block">
        {/* Global top bar */}
        <Header />

        {/* ✅ Slim utility row under header (right-aligned) */}
        <div className="border-b border-border/60">
          <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 py-2">
            <NoteBoxLink />
          </div>
        </div>

        {/* 3-column shell: Left rail (fixed), Main content, Right rail */}
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

          {/* Right activity rail (videos + Daily Prayers, last 24h) */}
          <aside className="hidden lg:block border-l border-border/60 p-3">
            <RightActivityRail
              includeKinds={["video_post", "prayer_post"]}
              limit={60}
            />
          </aside>
        </div>

        {/* Global footer */}
        <Footer />
      </div>

      {/* ─────────────── MOBILE ─────────────── */}
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

          {/* ✅ Mobile: NoteBox unread badge on the right */}
          <div className="flex items-center">
            <NoteBoxLink />
          </div>
        </div>

        {/* ✅ Mobile activity bar (last 24h) */}
        <MobileActivity />

        {/* Content with bottom padding so tab bar doesn’t overlap */}
        <main className="px-3 sm:px-4 py-3 pb-24">
          <Outlet />
        </main>

        {/* Bottom tab bar */}
        <MobileTabBar
          onUploadClick={() =>
            openUpload({ onCompleteNavigateTo: "/dashboard" })
          }
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
