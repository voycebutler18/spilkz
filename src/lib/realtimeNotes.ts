// lightweight helpers for unread count + note stream

import { supabase } from "@/integrations/supabase/client";

export type Unsub = () => void;

/** Subscribe to unread count for the signed-in user. */
export function subscribeUnreadCount(
  userId: string,
  onCount: (n: number) => void
): Unsub {
  let closed = false;

  // initial fetch
  const load = async () => {
    const { data, error } = await supabase
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("deleted_at", null)
      .is("read_at", null);
    if (!error && typeof data?.length !== "undefined") {
      // head: true -> data is [], count is in 'count' field on the response
      // supabase-js v2: count is returned separately on the response as well
    }
  };
  // supabase-js returns {count} on the response object:
  // do a standard select to get it reliably
  const loadReliable = async () => {
    const { count } = await supabase
      .from("notes")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("deleted_at", null)
      .is("read_at", null);
    if (!closed && typeof count === "number") onCount(count);
  };

  loadReliable();

  // realtime: any INSERT (new note for me) or UPDATE read_at/deleted_at affecting me
  const channel = supabase
    .channel("notes-unread")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notes", filter: `recipient_id=eq.${userId}` },
      loadReliable
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "notes", filter: `recipient_id=eq.${userId}` },
      loadReliable
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "notes", filter: `recipient_id=eq.${userId}` },
      loadReliable
    )
    .subscribe();

  return () => {
    closed = true;
    supabase.removeChannel(channel);
  };
}
