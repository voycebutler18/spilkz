
// src/App.tsx
import NotesPage from "@/pages/Notes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useEffect, useState } from "react";

import AppLayout from "@/components/layout/AppLayout";
<Route path="/notes" element={<NotesPage />} />

// Pages
import Splash from "./pages/Splash";
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

// Messaging
import CombinedMessages from "./pages/CombinedMessages";
import MessagesInbox from "./pages/MessagesInbox";
import MessageThread from "./pages/MessageThread";

// Daily Prayers
import PrayersPage from "./pages/Prayers";
import PrayerDetailPage from "./pages/PrayerDetail";
import PrayersTagPage from "./pages/PrayersTag";
import PrayersSearchPage from "./pages/PrayersSearch";

import NotFound from "./pages/NotFound";
import { UploadModalProvider, useUploadModal } from "@/contexts/UploadModalContext";

// ✅ Promote page (use alias so the path resolves on Linux builds)
import Promote from "@/pages/Promote";

const queryClient = new QueryClient();

function UploadRoute() {
  const { openUpload, isOpen } = useUploadModal();
  const navigate = useNavigate();
  useEffect(() => {
    openUpload({ onCompleteNavigateTo: "/dashboard" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => navigate("/", { replace: true }), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen, navigate]);
  return null;
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname, hash]);
  return null;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true
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
        <ScrollToTop />
        <UploadModalProvider>
          <Routes>
            {/* Auth (no layout) */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Admin (no public layout) */}
            <Route path="/admin" element={<Admin />} />

            {/* Back-compat upload (no layout) */}
            <Route path="/upload" element={<UploadRoute />} />

            {/* Splash OUTSIDE layout */}
            <Route path="/" element={<Splash />} />

            {/* Everything else uses the global layout */}
            <Route element={<AppLayout />}>
              {/* Home */}
              <Route path="/home" element={<Explore />} />
              <Route path="/explore" element={<Navigate to="/home" replace />} />

              {/* Old links */}
              <Route path="/thoughts/*" element={<Navigate to="/home" replace />} />

              {/* Static */}
              <Route path="/about" element={<About />} />
              <Route path="/food" element={<Food />} />
              <Route path="/brands" element={<ForBrands />} />
              <Route path="/creators" element={<ForCreators />} />
              <Route path="/press" element={<Press />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/contact" element={<Contact />} />

              {/* Legal / Community */}
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/dmca" element={<DMCA />} />
              <Route path="/guidelines" element={<Guidelines />} />
              <Route path="/safety" element={<Safety />} />
              <Route path="/accessibility" element={<Accessibility />} />

              {/* Dashboard */}
              <Route path="/dashboard" element={<CreatorDashboard />} />
              <Route path="/dashboard/favorites" element={<Favorites />} />

              {/* Profiles & videos */}
              <Route path="/profile/:id" element={<Profile />} />
              <Route path="/creator/:slug" element={<CreatorProfile />} />
              <Route path="/video/:id" element={<VideoPage />} />
              <Route path="/splik/:id" element={<SplikPage />} />
              <Route path="/search" element={<Search />} />

              {/* ✅ Promote */}
              <Route path="/promote/:splikId" element={<Promote />} />

              {/* Messaging */}
              <Route path="/messages" element={<MessagesIndexRoute />} />
              <Route path="/messages/:otherId" element={<MessagesThreadRoute />} />

              {/* Prayers */}
              <Route path="/prayers" element={<PrayersPage />} />
              <Route path="/prayers/search" element={<PrayersSearchPage />} />
              <Route path="/prayers/tag/:tag" element={<PrayersTagPage />} />
              <Route path="/prayers/:id" element={<PrayerDetailPage />} />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </UploadModalProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
