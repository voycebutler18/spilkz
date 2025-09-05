import { supabase } from "@/integrations/supabase/client";

export async function listConversations() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Select conversations visible to me (policy enforces visibility)
  // Join basic participant info if you want to show the other user
  const { data, error } = await supabase
    .from("conversations")
    .select(`
      id, updated_at, last_message_text,
      conversation_participants!inner (
        user_id, deleted_at
      )
    `)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  // Filter out my own participant meta from the UI if you wish
  return data ?? [];
}

export async function deleteConversationForMe(conversationId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.rpc("delete_conversation_for_me", {
    p_conversation: conversationId,
  });

  if (error) throw error;
}
