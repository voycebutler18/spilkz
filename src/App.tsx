import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Index from "./pages/Index";
import About from "./pages/About";
import Explore from "./pages/Explore";

import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import AuthCallback from "./pages/Auth/AuthCallback";
import ResetPassword from "./pages/Auth/ResetPassword";

import CreatorDashboard from "./pages/Dashboard/CreatorDashboard";
import Favorites from "./pages/Dashboard/Favorites";

import Profile from "./pages/Profile";
import VideoPage from "./pages/VideoPage";

// ✅ Make sure this is the default export from pages/CreatorProfile
import CreatorProfile from "./pages/CreatorProfile";

import NotFound from "./pages/NotFound";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import DMCA from "./pages/legal/DMCA";
import Guidelines from "./pages/community/Guidelines";
import Safety from "./pages/community/Safety";
import Accessibility from "./pages/community/Accessibility";
import HelpCenter from "./pages/support/HelpCenter";
import Contact from "./pages/support/Contact";
import ForBrands from "./pages/business/ForBrands";
import ForCreators from "./pages/business/ForCreators";
import Press from "./pages/business/Press";
import MoodsIndex from "@/pages/moods/MoodsIndex";
import MoodPage from "@/pages/moods/MoodPage";

// NEW: Food page
import Food from "./pages/Food";

// Messaging pages
import MessagesInbox from "./pages/MessagesInbox";
import MessageThread from "./pages/MessageThread";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/about" element={<About />} />
          <Route path="/explore" element={<Explore />} />

          {/* Prompts removed. If someone hits it, redirect to /food */}
          <Route path="/prompts" element={<Navigate to="/food" replace />} />

          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Dashboard */}
          <Route path="/dashboard" element={<CreatorDashboard />} />
          <Route path="/dashboard/favorites" element={<Favorites />} />

          {/* Profiles & videos */}
          <Route path="/profile/:id" element={<Profile />} />
          {/* ✅ Primary, resilient route (username or UUID handled inside the page) */}
          <Route path="/creator/:slug" element={<CreatorProfile />} />
          {/* ✅ Back-compat for any links that still use :username */}
          <Route path="/creator/:username" element={<CreatorProfile />} />
          <Route path="/video/:id" element={<VideoPage />} />

          {/* NEW: Food route */}
          <Route path="/food" element={<Food />} />

          {/* Legal / community / business / support */}
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/dmca" element={<DMCA />} />
          <Route path="/guidelines" element={<Guidelines />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/accessibility" element={<Accessibility />} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/brands" element={<ForBrands />} />
          <Route path="/creators" element={<ForCreators />} />
          <Route path="/press" element={<Press />} />
          <Route path="/moods/:mood" element={<MoodPage />} />

          {/* Messaging */}
          <Route path="/messages" element={<MessagesInbox />} />
          <Route path="/messages/:otherId" element={<MessageThread />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
