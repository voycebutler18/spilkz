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
  // present in your profiles table; used as a fallback for names
  first_name?: string | null;
  last_name?: string | null;
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

  // tiny CSS just to ensure Safari mobile inputs are always readable
  // (scoped to this page)
  const ForceInputStyle = () => (
    <style>{`
      @media (max-width: 767px) {
        .force-input {
          color: #000 !important;
          background-color: #fff !important;
          -webkit-text-fill-color: #000 !important;
          caret-color: #000 !important;
          border: 1px solid rgba(0,0,0,0.25) !important;
          border-radius: 12px !important;
          padding: 10px 12px !important;
          height: 40px !important;
          line-height: 20px !important;
          outline: none !important;
        }
        .force-input:focus {
          box-shadow: 0 0 0 2px rgba(124,58,237,.35) !important;
          border-color: rgba(124,58,237,.75) !important;
        }
        .force-input::placeholder {
          color: #6b7280 !important;
          -webkit-text-fill-color: #6b7280 !important;
          opacity: 1 !important;
        }
      }
    `}</style>
  );

  // 1) who am I
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMe(data.user?.id ?? null);
    });
  }, []);

  // 2) initial load + realtime
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      // Grab all messages where I'm involved
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
        const { data: ps, error: perr } = await supabase
          .from("profiles")
          .select("id,username,display_name,avatar_url,first_name,last_name")
          .in("id", partnerIds);
        if (perr) {
          // if your schema didn't have first_name/last_name at some point,
          // fall back to a narrower select:
          const { data: ps2 } = await supabase
            .from("profiles")
            .select("id,username,display_name,avatar_url")
            .in("id", partnerIds);
          const map2: Record<string, ProfileLite> = {};
          (ps2 || []).forEach((p: any) => (map2[p.id] = p));
          setProfiles(map2);
        } else {
          const map: Record<string, ProfileLite> = {};
          (ps || []).forEach((p: any) => (map[p.id] = p));
          setProfiles(map);
        }
      }
      setLoading(false);
    };

    load();

    // realtime: inserts/updates anywhere I'm involved
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
          // only care if it's in a thread I'm part of
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

  // 3) compute threads from flat messages
  const threads = useMemo<ThreadRow[]>(() => {
    if (!me) return [];
    const map: Record<string, ThreadRow> = {};

    for (const m of messages) {
      const partnerId = m.sender_id === me ? m.recipient_id : m.sender_id;
      if (!map[partnerId]) {
        map[partnerId] = { partnerId, lastMessage: m, unread: 0, partner: profiles[partnerId] || null };
      }
      // update last message (messages are ordered desc by created_at, but keep safe)
      if (!map[partnerId].lastMessage || m.created_at > map[partnerId].lastMessage!.created_at) {
        map[partnerId].lastMessage = m;
      }
      // unread count (only messages TO ME that aren't read)
      if (m.recipient_id === me && !m.read_at) map[partnerId].unread += 1;
      // attach partner when available
      if (!map[partnerId].partner && profiles[partnerId]) {
        map[partnerId].partner = profiles[partnerId];
      }
    }

    let arr = Object.values(map);
    // filter by search query (name or message)
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter((t) => {
        const p = t.partner;
        const name =
          p?.display_name ||
          p?.username ||
          (p?.first_name || p?.last_name ? `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() : t.partnerId);
        return name.toLowerCase().includes(q) || (t.lastMessage?.body ?? "").toLowerCase().includes(q);
      });
    }

    // newest first by last message time
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

  const displayNameFor = (p: ProfileLite | null | undefined, fallbackId: string) => {
    if (!p) return "User";
    return (
      p.display_name ||
      p.username ||
      (p.first_name || p.last_name ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "User") ||
      fallbackId
    );
  };

  /* ---------------- UI ---------------- */

  if (me === null) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-5xl mx-auto px-4 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <ForceInputStyle />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Desktop header (unchanged) */}
        <div className="hidden md:flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Messages
          </h1>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Creator Dashboard
          </Button>
        </div>

        {/* Mobile sticky header (new) */}
        <div className="md:hidden sticky top-[56px] z-30 bg-background/95 backdrop-blur border-b -mx-4 px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Messages
            </h1>
            <Button size="sm" variant="outline" onClick={() => navigate("/dashboard")}>
              Dashboard
            </Button>
          </div>

          {/* Native input on mobile for Safari visibility */}
          <div className="relative mt-3">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search by name or message…"
              className="force-input w-full pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Desktop search (unchanged style) */}
        <div className="hidden md:flex items-center gap-2">
          <div className="relative w-full">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or message…"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Desktop list (unchanged shell, cleaner spacing) */}
        <Card className="divide-y hidden md:block">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : threads.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <MailOpen className="h-10 w-10 mx-auto mb-3 opacity-70" />
              No conversations yet
            </div>
          ) : (
            threads.map((t) => {
              const p = t.partner;
              const name = displayNameFor(p, t.partnerId);
              const username = p?.username ? `@${p.username}` : "";
              const avatar = p?.avatar_url || null;
              const last = t.lastMessage?.body?.trim() || "";
              const when = formatWhen(t.lastMessage?.created_at);

              return (
                <Link
                  to={`/messages/${t.partnerId}`}
                  key={t.partnerId}
                  className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {avatar ? (
                      <img src={avatar} alt={name} className="w-11 h-11 rounded-full border" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center text-sm font-bold">
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

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {when}
                    </div>
                    {t.unread > 0 && <Badge variant="default">{t.unread > 99 ? "99+" : t.unread}</Badge>}
                  </div>
                </Link>
              );
            })
          )}
        </Card>

        {/* Mobile list (modern look, larger tap targets) */}
        <div className="md:hidden divide-y rounded-2xl border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : threads.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <MailOpen className="h-10 w-10 mx-auto mb-3 opacity-70" />
              No conversations yet
            </div>
          ) : (
            threads.map((t) => {
              const p = t.partner;
              const name = displayNameFor(p, t.partnerId);
              const username = p?.username ? `@${p.username}` : "";
              const avatar = p?.avatar_url || null;
              const last = t.lastMessage?.body?.trim() || "";
              const when = formatWhen(t.lastMessage?.created_at);

              return (
                <Link
                  to={`/messages/${t.partnerId}`}
                  key={t.partnerId}
                  className="flex items-center gap-3 p-4 active:bg-accent/70 transition-colors"
                >
                  {avatar ? (
                    <img src={avatar} alt={name} className="w-12 h-12 rounded-full border" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center text-sm font-bold">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{name}</span>
                          {username && (
                            <span className="text-[11px] text-muted-foreground truncate">{username}</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">{last || "(no message)"}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-muted-foreground">{when}</span>
                        {t.unread > 0 && (
                          <Badge variant="default" className="px-1.5 py-0.5">
                            {t.unread > 99 ? "99+" : t.unread}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
