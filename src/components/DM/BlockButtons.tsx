import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function BlockButton({ otherUserId }: { otherUserId: string }) {
  const [loading, setLoading] = useState(false);

  const block = async () => {
    try {
      setLoading(true);
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user?.id) return;
      await supabase.from("blocked_users").insert({ user_id: me.user.id, blocked_user_id: otherUserId });
    } finally {
      setLoading(false);
    }
  };

  return <Button variant="destructive" onClick={block} disabled={loading}>Block</Button>;
}

export function UnblockButton({ otherUserId }: { otherUserId: string }) {
  const [loading, setLoading] = useState(false);

  const unblock = async () => {
    try {
      setLoading(true);
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user?.id) return;
      await supabase.from("blocked_users").delete().eq("user_id", me.user.id).eq("blocked_user_id", otherUserId);
    } finally {
      setLoading(false);
    }
  };

  return <Button variant="outline" onClick={unblock} disabled={loading}>Unblock</Button>;
}
