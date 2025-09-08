import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MessageSquare, Clock, Loader2, MailOpen } from "lucide-react";
import { toast } from "sonner";

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
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

export default function InboxPane() {
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [query, setQuery] = useState("");
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { otherId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

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

      setMessages((data as Msg[]) ?? []);
      const partnerIds = Array.from(
        new Set((data || []).map((m: Msg) => (m.sender_id === me ? m.recipient_id : m.sender_id)))
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

    if (subRef.current) supabase.removeChannel(subRef.current);
    const ch = supabase
      .channel(`inbox-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${me}` },
        (payload) => setMessages((prev) => [payload.new as Msg, ...prev]))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` },
        (payload) => setMessages((prev) => [payload.new as Msg, ...prev]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" },
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
        })
      .subscribe();

    subRef.current = ch;

    return () => {
      cancelled = true;
      if (subRef.current) supabase.removeChannel(subRef.current);
      subRef.current = null;
    };
  }, [me]);

  const threads = useMemo<ThreadRow[]>(() => {
    if (!me) return [];
    const map: Record<string, ThreadRow> = {};
    for (const m of messages) {
      const pid = m.sender_id === me ? m.recipient_id : m.sender_id;
      if (!map[pid]) map[pid] = { partnerId: pid, lastMessage: m, unread: 0, partner: profiles[pid] || null };
      if (!map[pid].lastMessage || m.created_at > (map[pid].lastMessage?.created_at || "")) {
        map[pid].lastMessage = m;
      }
      if (m.recipient_id === me && !m.read_at) map[pid].unread += 1;
      if (!map[pid].partner && profiles[pid]) map[pid].partner = profiles[pid];
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
    const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const hr = Math.round(diffMin / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.round(hr / 24);
    if (day < 7) return `${day}d`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-[78vh]">
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or message…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : threads.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <MailOpen className="h-10 w-10 mx-auto mb-3 opacity-70" />
            No conversations yet
          </div>
        ) : (
          threads.map((t) => {
            const name = t.partner?.display_name || t.partner?.username || "User";
            const username = t.partner?.username ? `@${t.partner.username}` : "";
            const avatar = t.partner?.avatar_url || null;
            const last = t.lastMessage?.body?.trim() || "";
            const when = formatWhen(t.lastMessage?.created_at);
            const selected = otherId === t.partnerId; // highlight active

            return (
              <div
                key={t.partnerId}
                onClick={() => navigate(`/messages/${t.partnerId}`)}
                className={`flex items-center justify-between p-3 border-b cursor-pointer transition-colors ${
                  selected ? "bg-accent/80" : "hover:bg-accent/60"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {avatar ? (
                    <img src={avatar} alt={name} className="w-10 h-10 rounded-full border" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center text-sm font-bold">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{name}</span>
                      {username && <span className="text-xs text-muted-foreground truncate">{username}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span className="truncate">{last || "(no message body)"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {when}
                  </div>
                  {t.unread > 0 && <Badge variant="default">{t.unread > 99 ? "99+" : t.unread}</Badge>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
