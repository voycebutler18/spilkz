// src/components/notifications/NotificationBell.tsx
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Props = { user?: any };

export default function NotificationBell({ user }: Props) {
  const navigate = useNavigate();
  const [count, setCount] = useState<number>(0);

  // Fetch initial unread count (requires a `notifications` table with recipient_id, read)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.id) {
        setCount(0);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("notifications")
          .select("id, read")
          .eq("recipient_id", user.id)
          .eq("read", false);
        if (!mounted) return;
        if (!error) setCount((data || []).length);
      } catch {
        // table might not exist yet; ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Realtime: increment when a new notification row arrives
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-recipient-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => setCount((c) => c + 1)
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          // if a row changed read:false -> read:true, decrement
          const newRead = (payload.new as any)?.read;
          const oldRead = (payload.old as any)?.read;
          if (oldRead === false && newRead === true) {
            setCount((c) => Math.max(0, c - 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const goToNotifications = async () => {
    if (!user?.id) {
      navigate("/login");
      return;
    }
    navigate("/notifications");
    // (Optional) Mark as read in background
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("recipient_id", user.id)
        .eq("read", false);
      setCount(0);
    } catch {
      /* ignore */
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
      onClick={goToNotifications}
      title="Notifications"
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-[10px] leading-none px-1.5 py-0.5 min-w-[1.1rem] text-center"
          aria-hidden="true"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Button>
  );
}
