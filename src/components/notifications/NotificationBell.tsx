// src/components/notifications/NotificationBell.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

type NotificationItem = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: "like" | "follow" | "new_post";
  entity_id: string | null;       // video id or post id
  entity_type: string | null;     // "splik" | "profile" etc
  metadata: any | null;
  created_at: string;
  read_at: string | null;
  // joined
  actor?: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

export default function NotificationBell({ user, className = "" }: { user: any; className?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState<number>(0);
  const mountedRef = useRef(true);

  const userId = user?.id ?? null;

  const loadInitial = async () => {
    if (!userId) return;
    // recent items
    const { data: rows } = await supabase
      .from("notifications")
      .select("id,recipient_id,actor_id,type,entity_id,entity_type,metadata,created_at,read_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    // unread count
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);

    const list = (rows || []) as NotificationItem[];

    // join actor profiles (best-effort)
    const actorIds = [...new Set(list.map((n) => n.actor_id).filter(Boolean))] as string[];
    let byId: Record<string, any> = {};
    if (actorIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,username,display_name,first_name,avatar_url")
        .in("id", actorIds);
      (profs || []).forEach((p: any) => (byId[p.id] = p));
    }
    const withActors = list.map((n) => ({ ...n, actor: n.actor_id ? byId[n.actor_id] : null }));

    if (!mountedRef.current) return;
    setItems(withActors);
    setUnread(count || 0);
  };

  useEffect(() => {
    mountedRef.current = true;
    if (userId) loadInitial();

    // realtime: listen only to your notifications
    let ch: ReturnType<typeof supabase.channel> | null = null;
    if (userId) {
      ch = supabase
        .channel(`notifications-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
          async (payload) => {
            const n = payload.new as NotificationItem;
            // hydrate actor
            let actor: any = null;
            if (n.actor_id) {
              const { data } = await supabase
                .from("profiles")
                .select("id,username,display_name,first_name,avatar_url")
                .eq("id", n.actor_id)
                .limit(1)
                .single();
              actor = data ?? null;
            }
            setItems((prev) => [{ ...n, actor }, ...prev].slice(0, 50));
            setUnread((u) => u + 1);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
          (payload) => {
            const n = payload.new as NotificationItem;
            setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, read_at: n.read_at } : p)));
            if (payload.old && !payload.old.read_at && n.read_at) {
              setUnread((u) => Math.max(0, u - 1));
            }
          }
        )
        .subscribe();
    }

    return () => {
      mountedRef.current = false;
      if (ch) supabase.removeChannel(ch);
    };
  }, [userId]);

  const markAllRead = async () => {
    if (!userId || unread === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (!error) {
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      setUnread(0);
    }
  };

  const labelFor = (n: NotificationItem) => {
    const name =
      n.actor?.display_name ||
      n.actor?.first_name ||
      n.actor?.username ||
      "Someone";
    if (n.type === "like") return `${name} liked your video`;
    if (n.type === "follow") return `${name} started following you`;
    if (n.type === "new_post") return `${name} posted a new video`;
    return "New activity";
  };

  return (
    <div className={`relative ${className}`}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markAllRead().catch(() => {});
        }}
      >
        <Bell className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-[10px] font-semibold text-white flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {/* Panel */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-w-[90vw] z-50"
          onMouseLeave={() => setOpen(false)}
        >
          <Card className="p-2">
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="text-sm font-semibold">Notifications</div>
              <Link to="/notifications" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>

            <div className="max-h-96 overflow-auto">
              {items.length === 0 ? (
                <div className="text-xs text-muted-foreground px-2 py-6 text-center">
                  You’re all caught up.
                </div>
              ) : (
                <ul className="space-y-1">
                  {items.slice(0, 15).map((n) => (
                    <li key={n.id} className="px-2 py-2 rounded hover:bg-muted/60">
                      <Link
                        to={
                          n.type === "new_post" && n.entity_id
                            ? `/splik/${n.entity_id}`
                            : n.type === "like" && n.entity_id
                            ? `/splik/${n.entity_id}`
                            : n.actor?.id
                            ? `/creator/${n.actor.username || n.actor.id}`
                            : "#"
                        }
                        className="flex items-start gap-3"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback>
                            {(n.actor?.display_name || n.actor?.first_name || n.actor?.username || "??")
                              .toString()
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm leading-5">{labelFor(n)}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </div>
                        </div>
                        {!n.read_at && <span className="ml-auto mt-1 h-2 w-2 rounded-full bg-primary" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
