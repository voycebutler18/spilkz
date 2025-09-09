import * as React from "react";
import { Outlet } from "react-router-dom";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import LeftSidebar from "@/components/layout/LeftSidebar";

import { supabase } from "@/integrations/supabase/client";
import MobileTabBar from "@/components/layout/MobileTabBar"; // ✅ already in your project

const AppLayout: React.FC = () => {
  // only for mobile tabbar profile link
  const [profileHref, setProfileHref] = React.useState<string>("/login");

  React.useEffect(() => {
    let unsub: (() => void) | undefined;

    const hydrate = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user) {
        setProfileHref("/login");
        return;
      }

      // read the username from profiles (don’t trust user_metadata here)
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("id", user.id)
        .maybeSingle();

      if (prof?.username) {
        setProfileHref(`/creator/${prof.username}`); // username route
      } else {
        setProfileHref(`/profile/${user.id}`); // fallback by id
      }
    };

    hydrate();

    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      const user = session?.user;
      if (!user) {
        setProfileHref("/login");
        return;
      }
      // re-run the same logic when auth changes
      supabase
        .from("profiles")
        .select("id, username")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data: prof }) => {
          if (prof?.username) setProfileHref(`/creator/${prof.username}`);
          else setProfileHref(`/profile/${user.id}`);
        });
    });

    unsub = () => data.subscription?.unsubscribe();
    return () => unsub?.();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Global top bar */}
      <Header />

      {/* 3-column shell: Left rail (fixed), Main content, optional Right rail */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[260px_1fr_320px]">
        {/* Fixed left rail (desktop only) */}
        <LeftSidebar />

        {/* Main content area */}
        <main id="main" className="min-h-[calc(100vh-56px)] px-3 sm:px-4 py-4" role="main">
          <Outlet />
        </main>

        {/* (Optional) right rail placeholder */}
        <aside className="hidden border-l border-border/60 p-3 lg:block" />
      </div>

      {/* Global footer */}
      <Footer />

      {/* Mobile bottom tabs — desktop unaffected */}
      <MobileTabBar
        // upload button still opens your global modal from context
        onUploadClick={() => {
          const ev = new CustomEvent("open-upload");
          window.dispatchEvent(ev);
        }}
        isAuthedLink="/messages" // used only for visual active state, keep as-is
        profilePath={profileHref} // ✅ now always valid
      />
    </div>
  );
};

export default AppLayout;
