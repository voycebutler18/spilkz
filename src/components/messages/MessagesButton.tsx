import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function MessagesButton({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link";
}) {
  const [me, setMe] = useState<string | null>(null);
  const [unread, setUnread] = useState<number>(0);

  // 1) who am I
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMe(data.user?.id ?? null);
    });
  }, []);

  // 2) load count
  const loadCount = async (userId: string) => {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);
    setUnread(count || 0);
  };

  // 3) initial + realtime
  useEffect(() => {
    if (!me) return;
    let unsub: (() => void) | null = null;

    loadCount(me);

    const ch = supabase
      .channel(`inbox-indicator-${me}`)
      // new incoming DM to me
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${me}`,
        },
        () => loadCount(me)
      )
      // updates (e.g. marking read)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${me}`,
        },
        () => loadCount(me)
      )
      // if you also mark your own sent messages as read in other clients,
      // reflect all updates for threads you're in.
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${me}`,
        },
        () => loadCount(me)
      )
      .subscribe();

    unsub = () => supabase.removeChannel(ch);
    return () => {
      if (unsub) unsub();
    };
  }, [me]);

  return (
    <Link to="/messages" className={cn("relative", className)}>
      <Button variant={variant} className="relative">
        <MessageSquare className="mr-2 h-4 w-4" />
        Messages
        {unread > 0 && (
          <Badge
            variant="default"
            className="ml-2 px-2 py-0 h-5 text-[11px] leading-5 rounded-full"
          >
            {unread > 99 ? "99+" : unread}
          </Badge>
        )}
      </Button>
    </Link>
  );
}
