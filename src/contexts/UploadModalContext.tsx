import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";

type Ctx = {
  openUpload: (opts?: { onCompleteNavigateTo?: string }) => void;
  closeUpload: () => void;
  isOpen: boolean;
};

const UploadModalContext = createContext<Ctx | null>(null);

export const UploadModalProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [onCompleteNavigateTo, setOnCompleteNavigateTo] = useState<string>("/dashboard");
  const [authed, setAuthed] = useState<boolean | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  // track auth
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => mounted && setAuthed(!!user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session?.user);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const openUpload = useCallback((opts?: { onCompleteNavigateTo?: string }) => {
    if (opts?.onCompleteNavigateTo) setOnCompleteNavigateTo(opts.onCompleteNavigateTo);

    // gate with auth
    if (authed === false) {
      const next = location.pathname + location.search;
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setIsOpen(true);
  }, [authed, location.pathname, location.search, navigate]);

  const closeUpload = useCallback(() => setIsOpen(false), []);

  return (
    <UploadModalContext.Provider value={{ openUpload, closeUpload, isOpen }}>
      {children}

      {/* Mount the modal once, globally */}
      <VideoUploadModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onUploadComplete={() => {
          setIsOpen(false);
          navigate(onCompleteNavigateTo);
        }}
      />
    </UploadModalContext.Provider>
  );
};

export const useUploadModal = () => {
  const ctx = useContext(UploadModalContext);
  if (!ctx) throw new Error("useUploadModal must be used within UploadModalProvider");
  return ctx;
};
