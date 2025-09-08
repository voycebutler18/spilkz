import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BlockButton, UnblockButton } from "@/components/DM/BlockButtons";
import { Send, Paperclip, Smile, MoreVertical, Phone, Video, Search, ArrowLeft, Circle } from "lucide-react";
import { toast } from "sonner";

/* Types match your current MessageThread.tsx */
type Msg = { id: string; sender_id: string; recipient_id: string; body: string | null; created_at: string; thread_key: string; read_at: string | null; };
type ProfileLite = { id: string; username: string | null; display_name: string | null; avatar_url?: string | null; };

export default function ThreadPane() {
  const { otherId } = useParams();
  const [me, setMe] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)); }, []);
  const threadKey = useMemo(() => (!me || !otherId) ? null : (me < otherId ? `${me}|${otherId}` : `${otherId}|${me}`), [me, otherId]);

  // fetch names/avatars for header
  useEffect(() => {
    const run = async () => {
      if (!me || !otherId) return;
      const { data } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", [me, otherId as string]);
      const nameMap: Record<string, string> = {};
      const profileMap: Record<string, ProfileLite> = {};
      (data || []).forEach((p: any) => { nameMap[p.id] = p.display_name || p.username || "User"; profileMap[p.id] = p; });
      setNames(nameMap); setProfiles(profileMap);
    };
    run();
  }, [me, otherId]);

  const handleScroll = () => {
    if (!messagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsScrolledUp(!isAtBottom);
  };

  const filteredMsgs = useMemo(() => (!searchQuery.trim()) ? msgs : msgs.filter((m) => m.body?.toLowerCase().includes(searchQuery.toLowerCase())), [msgs, searchQuery]);

  // initial load + realtime (presence, typing, inserts, updates)
  useEffect(() => {
    if (!threadKey || !me || !otherId) return;

    const load = async () => {
      const { data, error } = await supabase.from("messages").select("*").eq("thread_key", threadKey).order("created_at", { ascending: true });
      if (error) { console.error(error); toast.error("Failed to load messages"); return; }
      setMsgs((data as Msg[]) || []);
      const toMark = (data || []).filter((m: Msg) => m.recipient_id === me && !m.read_at).map((m: Msg) => m.id);
      if (toMark.length) { await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", toMark); setUnreadCount(0); }
    };
    load();

    const ch = supabase
      .channel(`dm-${threadKey}`, { config: { presence: { key: me } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((prev) => [...prev, m]);
          if (m.recipient_id === me && !m.read_at) {
            if (!isScrolledUp) supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
            else setUnreadCount((prev) => prev + 1);
          }
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((prev) => prev.map((p) => (p.id === m.id ? m : p)));
        })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        setOtherOnline(Object.prototype.hasOwnProperty.call(state, otherId as string));
      })
      .on("presence", { event: "join" }, ({ key }) => key === otherId && setOtherOnline(true))
      .on("presence", { event: "leave" }, ({ key }) => key === otherId && setOtherOnline(false))
      .on("broadcast", { event: "typing" }, (payload) => {
        const { userId, typing } = payload.payload as { userId: string; typing: boolean };
        if (userId === otherId) setOtherTyping(Boolean(typing));
      })
      .subscribe(async (status) => { if (status === "SUBSCRIBED") await ch.track({ at: Date.now() }); });

    return () => { supabase.removeChannel(ch); };
  }, [threadKey, me, otherId, isScrolledUp]);

  useEffect(() => {
    if (!isScrolledUp) { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setUnreadCount(0); }
  }, [msgs.length, isScrolledUp]);

  useEffect(() => {
    if (!me || !otherId || !threadKey) return;
    const ch = supabase.channel(`dm-${threadKey}`);
    const sendTyping = (typing: boolean) => ch.send({ type: "broadcast", event: "typing", payload: { userId: me, typing } });
    const start = setTimeout(() => text && sendTyping(true), 120);
    const stop = setTimeout(() => sendTyping(false), 900);
    return () => { clearTimeout(start); clearTimeout(stop); };
  }, [text, me, otherId, threadKey]);

  const send = async () => {
    if (!me || !otherId || !text.trim()) return;
    const body = text.trim();
    const optimisticId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `tmp_${Date.now()}`;
    const optimistic: Msg = { id: optimisticId, sender_id: me, recipient_id: otherId!, body, created_at: new Date().toISOString(), thread_key: threadKey!, read_at: null };
    setMsgs((prev) => [...prev, optimistic]); setText("");

    const { error } = await supabase.from("messages").insert({ sender_id: me, recipient_id: otherId, body });
    if (error) {
      setMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      toast.error(`Couldn't send message: ${error.message}`);
      return;
    }
  };

  const nameFor = (userId: string) => (userId === me ? "You" : names[userId] || "User");
  const otherProfile = otherId ? profiles[otherId] : null;

  if (!otherId) {
    return (
      <div className="h-[78vh] flex items-center justify-center text-muted-foreground">
        Select a conversation from the list.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[78vh]">
      <style>{`
        .force-input{color:#000!important;background:#fff!important;-webkit-text-fill-color:#000!important;caret-color:#000!important;border:1px solid rgba(0,0,0,.25)!important;border-radius:12px!important;padding:10px 12px!important;height:40px!important;line-height:20px!important;outline:none!important;}
        .force-input:focus{box-shadow:0 0 0 2px rgba(124,58,237,.35)!important;border-color:rgba(124,58,237,.75)!important;}
        .force-input::placeholder{color:#6b7280!important;-webkit-text-fill-color:#6b7280!important;opacity:1!important;}
      `}</style>

      {/* Top bar */}
      <div className="p-3 border-b flex items-center justify-between bg-muted/40">
        <div className="flex items-center gap-3">
          {/* avatar + name + presence */}
          <div className="relative">
            {otherProfile?.avatar_url ? (
              <img src={otherProfile.avatar_url} alt={nameFor(otherId)} className="w-10 h-10 rounded-full border" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center font-semibold">
                {nameFor(otherId).charAt(0).toUpperCase()}
              </div>
            )}
            {otherOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />}
          </div>
          <div>
            <div className="font-medium">{nameFor(otherId)}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Circle className={`w-2 h-2 ${otherOnline ? "text-green-500" : "text-muted-foreground"}`} />
              {otherOnline ? "Online" : "Offline"}
              {otherTyping && <span className="text-purple-500 animate-pulse ml-2">typing…</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setShowSearch((v) => !v)}><Search className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm"><Phone className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm"><Video className="w-4 h-4" /></Button>
          <div className="flex gap-2 mx-1"><BlockButton otherUserId={otherId} /><UnblockButton otherUserId={otherId} /></div>
          <Button variant="ghost" size="sm"><MoreVertical className="w-4 h-4" /></Button>
        </div>
      </div>

      {showSearch && (
        <div className="p-3 border-b bg-muted/30">
          <input
            className="force-input w-full"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* Messages */}
      <div ref={messagesRef} onScroll={handleScroll}
           className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
        {filteredMsgs.map((m, index) => {
          const mine = m.sender_id === me;
          const prev = index > 0 ? filteredMsgs[index - 1] : null;
          const sameAsPrev = prev && prev.sender_id === m.sender_id;
          const content = (m.body ?? "").trim();

          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${mine ? "text-right" : "text-left"}`}>
                <div
                  className={[
                    "px-4 py-2 text-sm leading-relaxed shadow",
                    mine
                      ? `bg-gradient-to-r from-purple-600 to-blue-600 text-white ${sameAsPrev ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-br-sm"}`
                      : `bg-muted text-foreground/90 ${sameAsPrev ? "rounded-2xl rounded-bl-md" : "rounded-2xl rounded-bl-sm"}`,
                  ].join(" ")}
                >
                  {content.length ? <span className="whitespace-pre-wrap">{content}</span> : <span className="opacity-60 italic text-xs">(empty)</span>}
                </div>
                <div className={`mt-1 text-[10px] text-muted-foreground ${mine ? "text-right" : "text-left"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        {otherTyping && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2 shadow">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="p-3 border-t bg-muted/30">
        <div className="flex items-end gap-2">
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0"><Paperclip className="w-4 h-4" /></Button>
          <div className="flex-1">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type a message…"
              className="force-input w-full"
              autoComplete="off"
              autoCorrect="on"
              spellCheck
            />
          </div>
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0"><Smile className="w-4 h-4" /></Button>
          <Button onClick={send} disabled={!text.trim()} className="h-10 w-10 p-0 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white disabled:opacity-50">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
