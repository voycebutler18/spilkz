// src/components/notifications/NotificationBellDropdown.tsx
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  splik_id: string | null;
  type: "like" | "follow" | "comment" | string;
  message: string | null;
  read: boolean;
  created_at: string;
  extra: any;
};

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type Props = { user?: { id: string } | null };

const PAGE_SIZE = 50; // fetch 50 at a time; click "Load more" for the rest

export default function NotificationBellDropdown({ user }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const [items, setItems] = useState<NotificationRow[]>([]);
  const [actors, setActors] = useState<Record<string, Profile>>({});
  const [unreadCount, setUnreadCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null); // created_at of last item

  const badge = unreadCount > 99 ? "99+" : unreadCount || "";

  const fetchUnreadCount = async (uid: string) => {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", uid)
      .eq("read", false);
    setUnreadCount(count || 0);
  };

  const fetchPage = async (uid: string, afterCreatedAt?: string | null) => {
    const q = supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", uid)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (afterCreatedAt) {
      // load older items
      q.lt("created_at", afterCreatedAt);
    }

    const { data, error } = await q;
    if (error) return { rows: [] as NotificationRow[] };

    const rows = (data || []) as NotificationRow[];
    if (rows.length) {
      const lastCreatedAt = rows[rows.length - 1].created_at;
      setCursor(lastCreatedAt);
    }
    setHasMore(rows.length === PAGE_SIZE); // likely more if we filled the page

    // fetch missing actor profiles (best-effort)
    const missingActorIds = Array.from(
      new Set(
        rows
          .map((r) => r.actor_id)
          .filter((id): id is string => !!id && !actors[id])
      )
    );
    if (missingActorIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", missingActorIds);
      const map: Record<string, Profile> = {};
      (profs || []).forEach((p) => (map[p.id] = p as Profile));
      if (Object.keys(map).length) {
        setActors((m) => ({ ...m, ...map }));
      }
    }

    return { rows };
  };

  const initialLoad = async (uid: string) => {
    setLoading(true);
    try {
      await fetchUnreadCount(uid);
      const { rows } = await fetchPage(uid, null);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!user?.id || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { rows } = await fetchPage(user.id, cursor);
      if (rows.length) setItems((prev) => [...prev, ...rows]);
    } finally {
      setLoadingMore(false);
    }
  };

  // Initial mount
  useEffect(() => {
    if (!user?.id) {
      setItems([]);
      setUnreadCount(0);
      setHasMore(false);
      setCursor(null);
      return;
    }
    initialLoad(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notif-recipient-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          // push to top
          setItems((prev) => [row, ...prev]);
          if (!row.read) setUnreadCount((c) => c + 1);

          // fetch actor if needed
          if (row.actor_id && !actors[row.actor_id]) {
            supabase
              .from("profiles")
              .select("id, display_name, username, avatar_url")
              .eq("id", row.actor_id)
              .maybeSingle()
              .then(({ data }) => {
                if (data) setActors((m) => ({ ...m, [data.id]: data as Profile }));
              });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const newRow = payload.new as NotificationRow;
          const oldRow = payload.old as NotificationRow;
          setItems((prev) => prev.map((r) => (r.id === newRow.id ? newRow : r)));
          if (oldRow.read === false && newRow.read === true) {
            setUnreadCount((c) => Math.max(0, c - 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, actors]);

  // When you open the dropdown: clear the badge (mark all unread as read)
  useEffect(() => {
    if (!open || !user?.id || unreadCount === 0) return;
    const unreadIds = items.filter((r) => !r.read).map((r) => r.id);
    if (unreadIds.length === 0) {
      setUnreadCount(0);
      return;
    }
    // optimistic UI
    setItems((prev) => prev.map((r) => (r.read ? r : { ...r, read: true })));
    setUnreadCount(0);
    // persist
    supabase.from("notifications").update({ read: true }).in("id", unreadIds).then(() => {});
  }, [open, unreadCount, items, user?.id]);

  const textFor = (row: NotificationRow) => {
    const actor = row.actor_id ? actors[row.actor_id] : undefined;
    const who =
      actor?.display_name ||
      actor?.username ||
      (row.actor_id ? "Someone" : "Someone");
    if (row.type === "follow") return `${who} followed you`;
    if (row.type === "like") return `${who} liked your Splik`;
    if (row.type === "comment") return `${who} commented on your Splik`;
    return row.message || `${who} sent you a notification`;
  };

  const linkFor = (row: NotificationRow) => {
    if (row.type === "follow" && row.actor_id) return `/profile/${row.actor_id}`;
    if (row.splik_id) return `/splik/${row.splik_id}`;
    return "/home";
  };

  const goto = (row: NotificationRow) => {
    navigate(linkFor(row));
  };

  // Logged-out = simple bell → login
  if (!user?.id) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        onClick={() => navigate("/login")}
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={badge ? `${badge} unread notifications` : "Notifications"}
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          {badge !== "" && (
            <span className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-[10px] leading-none px-1.5 py-0.5 min-w-[1.1rem] text-center">
              {badge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 text-sm font-semibold">Notifications</div>

        <ScrollArea className="max-h-80">
          <ul className="px-1 py-1">
            {loading ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">No notifications (yet)</li>
            ) : (
              items.map((row) => {
                const actor = row.actor_id ? actors[row.actor_id] : undefined;
                const when = formatDistanceToNow(new Date(row.created_at), { addSuffix: true });
                const initial =
                  (actor?.display_name?.[0] || actor?.username?.[0] || "U").toUpperCase();
                return (
                  <li
                    key={row.id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent ${
                      row.read ? "opacity-80" : ""
                    }`}
                    onClick={() => goto(row)}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      {actor?.avatar_url ? (
                        <AvatarImage src={actor.avatar_url} alt="" />
                      ) : (
                        <AvatarFallback>{initial}</AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-5 truncate">{textFor(row)}</p>
                      <p className="text-xs text-muted-foreground">{when}</p>
                    </div>
                    {!row.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </li>
                );
              })
            )}
          </ul>

          {/* Load more */}
          {hasMore && (
            <div className="px-3 pb-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </ScrollArea>

        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          New items appear here instantly.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
