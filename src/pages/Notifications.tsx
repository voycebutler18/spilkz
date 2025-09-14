// src/pages/Notifications.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

type NotificationItem = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: "like" | "follow" | "new_post";
  entity_id: string | null;
  entity_type: string | null;
  metadata: any | null;
  created_at: string;
  read_at: string | null;
  actor?: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

export default function NotificationsPage() {
  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data: base } = await supabase
        .from("notifications")
        .select("id,recipient_id,actor_id,type,entity_id,entity_type,metadata,created_at,read_at")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      const list = (base || []) as NotificationItem[];
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

      if (!mounted) return;
      setItems(withActors);
      setLoading(false);

      // mark visible items read
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", user.id)
        .is("read_at", null);
    };

    load();

    const ch = supabase
      .channel(`notifications-page-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        async (payload) => {
          const n = payload.new as NotificationItem;
          let actor: any = null;
          if (n.actor_id) {
            const { data } = await supabase
              .from("profiles")
              .select("id,username,display_name,first_name,avatar_url")
              .eq("id", n.actor_id)
              .single();
            actor = data ?? null;
          }
          setItems((prev) => [{ ...n, actor }, ...prev]);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

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

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Sign in to see notifications.
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-4">Notifications</h1>
      <Card className="divide-y">
        {loading && (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">You’re all caught up.</div>
        )}
        {items.map((n) => (
          <Link
            key={n.id}
            to={
              n.type !== "follow" && n.entity_id
                ? `/splik/${n.entity_id}`
                : n.actor?.id
                ? `/creator/${n.actor.username || n.actor.id}`
                : "#"
            }
            className="flex items-start gap-3 p-4 hover:bg-muted/60"
          >
            <Avatar className="h-9 w-9 shrink-0">
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
          </Link>
        ))}
      </Card>
    </div>
  );
}
