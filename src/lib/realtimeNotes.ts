// src/lib/realtimeNotes.ts
import { supabase } from "@/integrations/supabase/client";

export type NoteRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  in_reply_to: string | null;
  deleted_at?: string | null;
};

/**
 * Subscribe to live INSERTs in public.notes for a specific recipient.
 * Returns an unsubscribe function you should call on unmount.
 */
export function subscribeToIncomingNotes(
  recipientId: string,
  onInsert: (note: NoteRow) => void
): () => void {
  const channel = supabase
    .channel(`notes-incoming-${recipientId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notes",
        filter: `recipient_id=eq.${recipientId}`,
      },
      (payload) => {
        const note = payload.new as NoteRow;
        try {
          onInsert(note);
        } catch (e) {
          console.error("subscribeToIncomingNotes handler error:", e);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Utility to fetch current unread count for a recipient.
 * Useful for a badge in your header.
 */
export async function fetchUnreadNotesCount(recipientId: string) {
  const { count, error } = await supabase
    .from("notes")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .is("read_at", null)
    .is("deleted_at", null);

  if (error) throw error;
  return count ?? 0;
}
