import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadDMCount() {
  const [count, setCount] = useState<number>(0);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const refresh = async (id: string) => {
    const { data, error } = await supabase
      .from("unread_dm_counts")
      .select("unread_count")
      .eq("recipient_id", id)
      .maybeSingle();
    if (!error) setCount(data?.unread_count ?? 0);
  };

  useEffect(() => {
    if (!me) return;
    refresh(me);

    // Listen for any new messages to me (INSERT) or read updates (UPDATE)
    const channel = supabase
      .channel(`dm-unread-${me}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` },
        () => refresh(me)
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` },
        () => refresh(me)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [me]);

  return count;
}
