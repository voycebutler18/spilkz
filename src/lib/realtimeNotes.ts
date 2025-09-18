// lib/realtimeNotes.ts
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

type Unsubscribe = () => void;

export function subscribeToIncomingNotes(userId: string, onNew?: (note: any) => void): Unsubscribe {
  // channel name is arbitrary; keeping it scoped is nice for debugging
  const channel = supabase
    .channel(`notes:recipient:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notes",
        // only notes targeted to me
        filter: `recipient_id=eq.${userId}`,
      },
      (payload) => {
        const note = payload.new as any;
        // fire callback (update badge, append to list, etc.)
        onNew?.(note);

        // lightweight UI nudge
        toast({
          title: "New message",
          description: (note.body || "").slice(0, 120),
        });

        // optional: Browser notification (ask once somewhere central)
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification("New message", { body: (note.body || "").slice(0, 120) });
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // console.log("Subscribed to notes realtime");
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
