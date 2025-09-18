// src/components/RealtimeNotesBridge.tsx
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToIncomingNotes } from "@/lib/realtimeNotes";

export default function RealtimeNotesBridge() {
  useEffect(() => {
    let unsub: (() => void) | null = null;

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;

      // Optional: browser notifications
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }

      // Start listening for new notes for me
      unsub = subscribeToIncomingNotes(uid, (note) => {
        // Example: update global badge / trigger UI refresh
        window.dispatchEvent(new CustomEvent("notes:new", { detail: note }));
      });
    });

    return () => { unsub?.(); };
  }, []);

  return null;
}
