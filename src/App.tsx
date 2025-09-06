
// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Auth screens (no layout) */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />

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
            {/* Back-compat if anything still links to :username */}
            <Route path="/creator/:username" element={<CreatorProfile />} />
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
