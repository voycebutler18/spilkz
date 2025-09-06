import * as React from "react";
import { Outlet } from "react-router-dom";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import LeftSidebar from "@/components/layout/LeftSidebar";

const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
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
  );
};

export default AppLayout;
