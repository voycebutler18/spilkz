// src/pages/MessagesInbox.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
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
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
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

      setMessages((data as Msg[]) ?? []);

      // prefetch partner profiles
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

  // threads
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

  const formatWhen = (iso: string | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return d.toLocaleDateString();
  };

  if (me === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Header />
        <div className="max-w-md mx-auto px-4 py-10 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300 mx-auto" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Header />

      {/* Sticky mobile header + search */}
      <div className="max-w-md mx-auto px-3 pb-24">
        <div className="sticky top-0 z-10 -mx-3 bg-slate-800/90 backdrop-blur border-b border-slate-700/50 px-3 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Messages
            </h1>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
              Dashboard
            </Button>
          </div>

          <div className="mt-3 relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search conversations…"
              className="pl-9 bg-slate-900/60 border-slate-700 text-slate-100 placeholder:text-slate-400"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <Card className="mt-3 divide-y border-slate-700/60 bg-slate-800/60 backdrop-blur-sm">
          {loading ? (
            <div className="p-8 text-center text-slate-300 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : threads.length === 0 ? (
            <div className="p-12 text-center text-slate-300">
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

              return (
                <Link
                  to={`/messages/${t.partnerId}`}
                  key={t.partnerId}
                  className="flex items-center justify-between p-4 hover:bg-slate-700/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {avatar ? (
                      <img src={avatar} alt={name} className="w-12 h-12 rounded-full border border-slate-600" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center text-sm font-bold">
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{name}</span>
                        {username && <span className="text-xs text-slate-400 truncate">{username}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-300 min-w-0">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="truncate">{last || "(no message body)"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-xs text-slate-400 inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {when}
                    </div>
                    {t.unread > 0 && (
                      <Badge variant="default" className="bg-purple-600 text-white">
                        {t.unread > 99 ? "99+" : t.unread}
                      </Badge>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </Card>
      </div>

      <Footer />
    </div>
  );
}
