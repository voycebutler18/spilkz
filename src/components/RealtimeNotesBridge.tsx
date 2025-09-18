// src/components/system/RealtimeNotesBridge.tsx
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToIncomingNotes } from "@/lib/realtimeNotes";

export default function RealtimeNotesBridge() {
  useEffect(() => {
    let unsub: (() => void) | null = null;

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;

      // Ask once for browser notifications (optional)
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }

      unsub = subscribeToIncomingNotes(uid, (note) => {
        // push a DOM event so any page can react
        window.dispatchEvent(new CustomEvent("notes:new", { detail: note }));

        // optional native notification (won’t fire if denied)
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("New note", { body: note.body.slice(0, 120) });
          }
        } catch {}
      });
    });

    return () => unsub?.();
  }, []);

  return null;
}
