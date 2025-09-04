import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadDMCount() {
  const [count, setCount] = useState(0);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMe(data.user?.id ?? null);
    });
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

    // initial fetch
    refresh(me);

    // refresh on any message change
    const ch = supabase
      .channel(`dm-unread-${me}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => refresh(me)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [me]);

  return count;
}
