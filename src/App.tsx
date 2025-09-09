// src/App.tsx
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

// Pages
import Index from "./pages/Index";
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

// 404
import NotFound from "./pages/NotFound";

// Upload modal context
import { UploadModalProvider, useUploadModal } from "@/contexts/UploadModalContext";

const queryClient = new QueryClient();

/** Minimal error boundary to avoid blank screens */
function RootErrorBoundary({ children }: { children: React.ReactNode }) {
  const [err, setErr] = useState<Error | null>(null);
  if (err) {
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="max-w-xl w-full rounded-lg border p-6">
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-4">
            A runtime error occurred while rendering the app. Use the button below to go home.
          </p>
          <pre className="text-xs overflow-auto p-3 bg-muted rounded mb-4">
            {err.message}
          </pre>
          <a
            href="/home"
            className="inline-flex items-center px-3 py-2 rounded bg-primary text-primary-foreground"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  // Wrap a try/catch around rendering children
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <ErrorCatcher onError={setErr as any}>{children}</ErrorCatcher>;
}

/** Internal component that throws to our stateful boundary */
function ErrorCatcher({
  children,
  onError,
}: {
  children: React.ReactNode;
  onError: (e: Error) => void;
}) {
  try {
    return <>{children}</>;
  } catch (e) {
    onError(e as Error);
    return null;
  }
}

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
      const t = setTimeout(() => navigate("/home", { replace: true }), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen, navigate]);

  return null;
}

/** Force the window to the top on route changes */
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

/** Desktop vs mobile messaging chooser */
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
        <RootErrorBoundary>
          <UploadModalProvider>
            <Routes>
              {/* Auth */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Admin */}
              <Route path="/admin" element={<Admin />} />

              {/* Back-compat upload */}
              <Route path="/upload" element={<UploadRoute />} />

              {/* Redirect root → home (bypass Splash to avoid crashes) */}
              <Route path="/" element={<Navigate to="/home" replace />} />

              {/* Site with layout */}
              <Route element={<AppLayout />}>
                <Route path="/home" element={<Index />} />

                {/* Core */}
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
                <Route path="/splik/:id" element={<SplikPage />} />
                <Route path="/search" element={<Search />} />

                {/* Messaging */}
                <Route path="/messages" element={<MessagesIndexRoute />} />
                <Route path="/messages/:otherId" element={<MessagesThreadRoute />} />

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </UploadModalProvider>
        </RootErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
