// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import AppLayout from "@/components/layout/AppLayout";

// Pages (site)
import Index from "./pages/Index";
import About from "./pages/About";
import Explore from "./pages/Explore";
import Food from "./pages/Food";
import ForBrands from "./pages/business/ForBrands";
import ForCreators from "./pages/business/ForCreators";
import Press from "./pages/business/Press";
import HelpCenter from "./pages/support/HelpCenter";
import Contact from "./pages/support/Contact";

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
import AdminDashboard from "./pages/admin/AdminDashboard";


// Dashboard
import CreatorDashboard from "./pages/Dashboard/CreatorDashboard";
import Favorites from "./pages/Dashboard/Favorites";

// Profiles & videos
import Profile from "./pages/Profile";
import CreatorProfile from "./pages/CreatorProfile";
import VideoPage from "./pages/VideoPage";
import Search from "./pages/Search";

// Messaging
import MessagesInbox from "./pages/MessagesInbox";
import MessageThread from "./pages/MessageThread";

// 404
import NotFound from "./pages/NotFound";

// Upload modal context
import { UploadModalProvider, useUploadModal } from "@/contexts/UploadModalContext";

const queryClient = new QueryClient();

/**
 * Back-compat route: visiting /upload just opens the global upload modal.
 * When the modal closes, we navigate home.
 */
function UploadRoute() {
  const { openUpload, isOpen } = useUploadModal();
  const navigate = useNavigate();

  useEffect(() => {
    // Open the modal and, after success, route to dashboard (matches your header button)
    openUpload({ onCompleteNavigateTo: "/dashboard" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // If the user closes the modal while on /upload, send them home
    if (!isOpen) {
      const t = setTimeout(() => navigate("/", { replace: true }), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen, navigate]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* IMPORTANT: Provider must be INSIDE BrowserRouter because it uses useNavigate/useLocation */}
        <UploadModalProvider>
          <Routes>
            {/* Auth screens (no layout) */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin" element={<AdminDashboard />} />

            {/* Back-compat upload route (opens modal) */}
            <Route path="/upload" element={<UploadRoute />} />

            {/* Site wrapped with global layout (Header + LeftSidebar + Footer) */}
            <Route element={<AppLayout />}>
              {/* Core */}
              <Route path="/" element={<Index />} />
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
              {/* (You had a duplicate /creator/:username; it's redundant so removed) */}
              <Route path="/video/:id" element={<VideoPage />} />
              <Route path="/search" element={<Search />} />

              {/* Messaging */}
              <Route path="/messages" element={<MessagesInbox />} />
              <Route path="/messages/:otherId" element={<MessageThread />} />

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
