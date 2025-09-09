// src/pages/MessagesInbox.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mail, MailOpen, Search, Loader2, MessageSquare, Clock } from "lucide-react";
import { toast } from "sonner";

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  thread_key: string;
};

type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

type ThreadRow = {
  partnerId: string;
  lastMessage: Msg | null;
  unread: number;
  partner: ProfileLite | null;
};

export default function MessagesInbox() {
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // who am I
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMe(data.user?.id ?? null);
    });
  }, []);

  // initial load + realtime
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Failed to load inbox");
        setLoading(false);
        return;
      }
      if (cancelled) return;

      const rows = (data as Msg[]) ?? [];
      setMessages(rows);

      const partnerIds = Array.from(
        new Set(rows.map((m) => (m.sender_id === me ? m.recipient_id : m.sender_id)))
      );

      if (partnerIds.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,username,display_name,avatar_url")
          .in("id", partnerIds);
        const map: Record<string, ProfileLite> = {};
        (ps || []).forEach((p: any) => (map[p.id] = p));
        setProfiles(map);
      }

      setLoading(false);
    };

    load();

    // realtime
    if (subRef.current) supabase.removeChannel(subRef.current);

    const ch = supabase
      .channel(`inbox-${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${me}` },
        (payload) => setMessages((prev) => [payload.new as Msg, ...prev])
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` },
        (payload) => setMessages((prev) => [payload.new as Msg, ...prev])
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Msg;
          if (m.sender_id !== me && m.recipient_id !== me) return;
          setMessages((prev) => {
            const idx = prev.findIndex((x) => x.id === m.id);
            if (idx === -1) return prev;
            const copy = prev.slice();
            copy[idx] = m;
            return copy;
          });
        }
      )
      .subscribe();

    subRef.current = ch;

    return () => {
      cancelled = true;
      if (subRef.current) supabase.removeChannel(subRef.current);
      subRef.current = null;
    };
  }, [me]);

  // compute threads
  const threads = useMemo<ThreadRow[]>(() => {
    if (!me) return [];
    const map: Record<string, ThreadRow> = {};

    for (const m of messages) {
      const partnerId = m.sender_id === me ? m.recipient_id : m.sender_id;
      if (!map[partnerId]) {
        map[partnerId] = { partnerId, lastMessage: m, unread: 0, partner: profiles[partnerId] || null };
      }
      if (!map[partnerId].lastMessage || m.created_at > map[partnerId].lastMessage!.created_at) {
        map[partnerId].lastMessage = m;
      }
      if (m.recipient_id === me && !m.read_at) map[partnerId].unread += 1;
      if (!map[partnerId].partner && profiles[partnerId]) {
        map[partnerId].partner = profiles[partnerId];
      }
    }

    let arr = Object.values(map);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter((t) => {
        const name = t.partner?.display_name || t.partner?.username || t.partnerId;
        return name?.toLowerCase().includes(q) || t.lastMessage?.body?.toLowerCase().includes(q);
      });
    }

    arr.sort((a, b) => (b.lastMessage?.created_at || "").localeCompare(a.lastMessage?.created_at || ""));
    return arr;
  }, [messages, profiles, query, me]);

  const formatWhen = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.round((+now - +d) / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return d.toLocaleDateString();
  };

  return (
    <div className="mx-auto w-full max-w-md px-3 pb-24">
      {/* Sticky mobile header + search */}
      <div className="sticky top-0 z-10 -mx-3 bg-background/90 backdrop-blur border-b">
        <div className="px-3 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <h1 className="text-base font-bold">Messages</h1>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/dashboard")}>
            Dashboard
          </Button>
        </div>
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations…"
              className="pl-9 h-10"
            />
          </div>
        </div>
      </div>

      {/* Thread list */}
      {loading ? (
        <div className="mt-10 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
        </div>
      ) : threads.length === 0 ? (
        <div className="mt-12 text-center text-muted-foreground">
          <MailOpen className="h-10 w-10 mx-auto mb-2 opacity-70" />
          No conversations yet
        </div>
      ) : (
        <ul className="divide-y">
          {threads.map((t) => {
            const name = t.partner?.display_name || t.partner?.username || "User";
            const username = t.partner?.username ? `@${t.partner.username}` : "";
            const avatar = t.partner?.avatar_url || null;
            const last = t.lastMessage?.body?.trim() || "";
            const when = formatWhen(t.lastMessage?.created_at);

            return (
              <li key={t.partnerId}>
                <Link
                  to={`/messages/${t.partnerId}`}
                  className="flex items-center gap-3 py-3 active:opacity-80"
                >
                  {avatar ? (
                    <img src={avatar} alt={name} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center font-semibold">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate font-medium">{name}</p>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{when}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm text-muted-foreground">{last || "(no message)"}</p>
                      {t.unread > 0 && (
                        <Badge className="ml-2 shrink-0">{t.unread > 99 ? "99+" : t.unread}</Badge>
                      )}
                    </div>
                    {username && <p className="text-xs text-muted-foreground mt-0.5">{username}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
