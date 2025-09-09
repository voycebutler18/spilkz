// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import AppLayout from "@/components/layout/AppLayout";

// Pages (site)
import Index from "./pages/Index";              // ← feed is now mounted at /home
import Splash from "./pages/Splash";            // ← NEW: instant-loading splash at /
import About from "./pages/About";
import Explore from "./pages/Explore";
import Food from "./pages/Food";
import ForBrands from "./pages/business/ForBrands";
import ForCreators from "./pages/business/ForCreators";
import Press from "./pages/business/Press";
import HelpCenter from "./pages/support/HelpCenter";
import Contact from "./pages/support/Contact";
import SplikPage from "@/pages/SplikPage";

// Legal / Community
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import DMCA from "./pages/legal/DMCA";
import Guidelines from "./pages/community/Guidelines";
import Safety from "./pages/community/Safety";
import Accessibility from "./pages/community/Accessibility";

// Auth
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import AuthCallback from "./pages/Auth/AuthCallback";
import ResetPassword from "./pages/Auth/ResetPassword";

// Admin
import Admin from "./pages/admin/admin";

// Dashboard
import CreatorDashboard from "./pages/Dashboard/CreatorDashboard";
import Favorites from "./pages/Dashboard/Favorites";

// Profiles & videos
import Profile from "./pages/Profile";
import CreatorProfile from "./pages/CreatorProfile";
import VideoPage from "./pages/VideoPage";
import Search from "./pages/Search";

// Messaging - NEW COMBINED COMPONENT
import CombinedMessages from "./pages/CombinedMessages";

// Mobile fallback messaging (keep for mobile responsiveness)
import MessagesInbox from "./pages/MessagesInbox";
import MessageThread from "./pages/MessageThread";

// 404
import NotFound from "./pages/NotFound";

// Upload modal context
import { UploadModalProvider, useUploadModal } from "@/contexts/UploadModalContext";

const queryClient = new QueryClient();

/** Back-compat: /upload opens the global upload modal and then routes home */
function UploadRoute() {
  const { openUpload, isOpen } = useUploadModal();
  const navigate = useNavigate();

  useEffect(() => {
    openUpload({ onCompleteNavigateTo: "/dashboard" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => navigate("/home", { replace: true }), 150); // ← go to /home now
      return () => clearTimeout(t);
    }
  }, [isOpen, navigate]);

  return null;
}

/** Force the window to the top on route changes (fixes "pages start at bottom") */
function ScrollToTop() {
  const { pathname, hash } = useLocation();

  // Set manual restoration once
  useEffect(() => {
    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {}
  }, []);

  useEffect(() => {
    // Keep anchor links (/#section) working
    if (hash) return;

    // Reset window + doc scroll
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname, hash]);

  return null;
}

/** Hook to detect desktop for routing the messages experience */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

/** Route element that picks desktop (combined) vs mobile (separate pages) */
function MessagesIndexRoute() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <CombinedMessages /> : <MessagesInbox />;
}

function MessagesThreadRoute() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <CombinedMessages /> : <MessageThread />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* 🔝 ensure new routes start at the top */}
        <ScrollToTop />

        <UploadModalProvider>
          <Routes>
            {/* Auth screens (no layout) */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Admin (no public layout) */}
            <Route path="/admin" element={<Admin />} />

            {/* Back-compat upload route (opens modal) */}
            <Route path="/upload" element={<UploadRoute />} />

            {/* Splash (no layout) — loads instantly and preloads the feed */}
            <Route path="/" element={<Splash />} />

            {/* Site with global layout */}
            <Route element={<AppLayout />}>
              {/* Core */}
              <Route path="/home" element={<Index />} /> {/* ← feed now lives here */}
              <Route path="/about" element={<About />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/food" element={<Food />} />
              <Route path="/brands" element={<ForBrands />} />
              <Route path="/creators" element={<ForCreators />} />
              <Route path="/press" element={<Press />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/contact" element={<Contact />} />

              {/* Redirects */}
              <Route path="/prompts" element={<Navigate to="/food" replace />} />

              {/* Dashboard */}
              <Route path="/dashboard" element={<CreatorDashboard />} />
              <Route path="/dashboard/favorites" element={<Favorites />} />

              {/* Profiles & videos */}
              <Route path="/profile/:id" element={<Profile />} />
              <Route path="/creator/:slug" element={<CreatorProfile />} />
              <Route path="/video/:id" element={<VideoPage />} />
              <Route path="/search" element={<Search />} />
              <Route path="/splik/:id" element={<SplikPage />} />

              {/* Messaging - Responsive Layout */}
              <Route path="/messages" element={<MessagesIndexRoute />} />
              <Route path="/messages/:otherId" element={<MessagesThreadRoute />} />

              {/* Legal / community */}
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/dmca" element={<DMCA />} />
              <Route path="/guidelines" element={<Guidelines />} />
              <Route path="/safety" element={<Safety />} />
              <Route path="/accessibility" element={<Accessibility />} />

              {/* 404 (with layout) */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </UploadModalProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
