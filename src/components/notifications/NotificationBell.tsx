// src/components/notifications/NotificationBell.tsx
import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

type Props = { user?: any };

type RawNotif = {
  id: string;
  recipient_id: string;
  type: "like" | "follow" | "new_post" | string;
  actor_id: string | null;
  splik_id: string | null;
  created_at: string;
  read: boolean;
};

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type SplikMeta = {
  id: string;
  title?: string | null;
  thumbnail_url?: string | null;
};

export default function NotificationBell({ user }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<RawNotif[]>([]);
  const [actors, setActors] = useState<Record<string, Profile>>({});
  const [spliks, setSpliks] = useState<Record<string, SplikMeta>>({});

  const unread = useMemo(() => list.filter((n) => !n.read).length, [list]);

  // Initial fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) {
        setList([]);
        setActors({});
        setSpliks({});
        return;
      }
      // Load latest 40 notifications
      const { data, error } = await supabase
        .from("notifications")
        .select("id, recipient_id, type, actor_id, splik_id, created_at, read")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40);

      if (!alive) return;
      if (error) {
        setList([]);
        return;
      }
      const rows = (data || []) as RawNotif[];
      setList(rows);

      // hydrate actors
      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
      if (actorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", actorIds);
        const map: Record<string, Profile> = {};
        (profs || []).forEach((p) => (map[p.id] = p));
        if (alive) setActors(map);
      }

      // hydrate spliks (optional)
      const splikIds = Array.from(new Set(rows.map((r) => r.splik_id).filter(Boolean))) as string[];
      if (splikIds.length) {
        const { data: sp } = await supabase
          .from("spliks")
          .select("id, title, thumbnail_url")
          .in("id", splikIds);
        const sMap: Record<string, SplikMeta> = {};
        (sp || []).forEach((s) => (sMap[s.id] = s));
        if (alive) setSpliks(sMap);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Realtime: INSERT/UPDATE
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`rt-notifs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        async (payload) => {
          const n = payload.new as RawNotif;
          setList((cur) => [n, ...cur].slice(0, 60));

          // hydrate missing actor
          if (n.actor_id && !actors[n.actor_id]) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url")
              .eq("id", n.actor_id)
              .maybeSingle();
            if (prof) setActors((m) => ({ ...m, [prof.id]: prof }));
          }
          // hydrate missing splik
          if (n.splik_id && !spliks[n.splik_id]) {
            const { data: sp } = await supabase
              .from("spliks")
              .select("id, title, thumbnail_url")
              .eq("id", n.splik_id)
              .maybeSingle();
            if (sp) setSpliks((m) => ({ ...m, [sp.id]: sp }));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as RawNotif;
          setList((cur) => cur.map((n) => (n.id === updated.id ? updated : n)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, actors, spliks]);

  // Mark all as read when menu opens
  const handleOpenChange = async (v: boolean) => {
    setOpen(v);
    if (v && user?.id && unread > 0) {
      try {
        await supabase
          .from("notifications")
          .update({ read: true })
          .eq("recipient_id", user.id)
          .eq("read", false);
        setList((cur) => cur.map((n) => ({ ...n, read: true })));
      } catch {}
    }
  };

  const goTo = (n: RawNotif) => {
    // Navigate to the right place
    if (n.splik_id) {
      navigate(`/splik/${n.splik_id}`);
    } else if (n.actor_id) {
      navigate(`/profile/${n.actor_id}`);
    }
    setOpen(false);
  };

  const displayNameFor = (p?: Profile) =>
    p?.display_name || p?.username || "Someone";

  const lineFor = (n: RawNotif) => {
    const p = n.actor_id ? actors[n.actor_id] : undefined;
    const who = displayNameFor(p);
    switch (n.type) {
      case "like":
        return `${who} liked your post`;
      case "follow":
        return `${who} followed you`;
      case "new_post":
        return `${who} posted a new Splik`;
      default:
        return `${who} sent a notification`;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-[10px] leading-none px-1.5 py-0.5 min-w-[1.1rem] text-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[320px] p-0 overflow-hidden"
      >
        <div className="px-3 py-2 border-b">
          <p className="text-sm font-semibold">Notifications</p>
        </div>

        <ScrollArea className="max-h-[60vh]">
          {list.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No notifications yet</div>
          ) : (
            <ul className="divide-y">
              {list.map((n) => {
                const actor = n.actor_id ? actors[n.actor_id] : undefined;
                const splik = n.splik_id ? spliks[n.splik_id] : undefined;
                const when = formatDistanceToNow(new Date(n.created_at), { addSuffix: true });
                const initials =
                  (actor?.display_name?.[0] || actor?.username?.[0] || "U").toUpperCase();

                return (
                  <li key={n.id}>
                    <button
                      onClick={() => goTo(n)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent/60 transition ${
                        n.read ? "opacity-80" : "opacity-100"
                      }`}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        {actor?.avatar_url ? (
                          <AvatarImage src={actor.avatar_url} alt="" />
                        ) : null}
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 grow">
                        <p className="text-sm truncate">{lineFor(n)}</p>
                        <p className="text-[11px] text-muted-foreground">{when}</p>
                      </div>

                      {splik?.thumbnail_url ? (
                        <img
                          src={splik.thumbnail_url}
                          alt=""
                          className="h-8 w-6 rounded object-cover shrink-0"
                          loading="lazy"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
