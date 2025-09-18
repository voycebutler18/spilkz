// src/components/RealtimeNotesBridge.tsx
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToIncomingNotes } from "@/lib/realtimeNotes";

/**
 * Mount this once (e.g., in App.tsx) so the app can react to incoming notes globally.
 * It dispatches a DOM event "notes:new" with the note in `event.detail`.
 * Any component (e.g., a header badge) can listen for that event.
 */
export default function RealtimeNotesBridge() {
  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("RealtimeNotesBridge: getUser error", error);
        return;
      }
      const uid = data.user?.id;
      if (!uid) return;

      // Optional: ask for browser notification permission once
      if ("Notification" in window && Notification.permission === "default") {
        try {
          Notification.requestPermission().catch(() => {});
        } catch {}
      }

      unsub = subscribeToIncomingNotes(uid, (note) => {
        // Global custom event for your UI
        window.dispatchEvent(new CustomEvent("notes:new", { detail: note }));

        // Optional: very simple Web Notification
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("New note", { body: note.body });
          }
        } catch {
          // ignore notification errors
        }
      });
    })();

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, []);

  return null;
}
