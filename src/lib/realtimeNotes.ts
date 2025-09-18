// src/lib/realtimeNotes.ts
import { supabase } from "@/integrations/supabase/client";

export type NoteRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string; // timestamptz
  read_at: string | null; // timestamptz
  in_reply_to?: string | null;
};

export function subscribeToIncomingNotes(
  myUserId: string,
  onInsert: (note: NoteRow) => void
) {
  const channel = supabase
    .channel("notes:incoming")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notes", filter: `recipient_id=eq.${myUserId}` },
      (payload) => onInsert(payload.new as NoteRow)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
