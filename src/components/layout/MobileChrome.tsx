// src/components/layout/MobileChrome.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import MobileMenu from "@/components/layout/MobileMenu";
import MobileTabBar from "@/components/layout/MobileTabBar";
import { useUploadModal } from "@/contexts/UploadModalContext";
import { supabase } from "@/integrations/supabase/client";

export default function MobileChrome() {
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
    <div className="md:hidden">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 h-12 border-b bg-background/95 backdrop-blur px-3 flex items-center justify-between">
        <button
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
          className="p-2 -ml-2"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Link to="/" className="font-bold text-lg">Splikz</Link>
        <div className="w-8" />
      </div>

      {/* Bottom tabs (fixed) */}
      <MobileTabBar
        onUploadClick={() => openUpload({ onCompleteNavigateTo: "/dashboard" })}
        isAuthed={!!user}
        profilePath={profilePath}
      />

      {/* Slide-out left menu */}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
