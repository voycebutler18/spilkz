// src/pages/MessageThread.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { BlockButton, UnblockButton } from "@/components/DM/BlockButtons";
import { toast } from "sonner";
import {
  Send, Paperclip, Smile, MoreVertical, Phone, Video, Search, ArrowLeft, Circle,
} from "lucide-react";

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  created_at: string;
  thread_key: string;
  read_at: string | null;
};

type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

export default function MessageThread() {
  const { otherId } = useParams();
  const navigate = useNavigate();

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

  const commonEmojis = ["😀","😂","❤️","👍","👎","😢","😮","😡","🎉","🔥","💯","😊"];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const threadKey = useMemo(() => {
    if (!me || !otherId) return null;
    return me < otherId ? `${me}|${otherId}` : `${otherId}|${me}`;
  }, [me, otherId]);

  // Load names/avatars
  useEffect(() => {
    const run = async () => {
      if (!me || !otherId) return;
      const { data } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", [me, otherId as string]);

      const nameMap: Record<string, string> = {};
      const profileMap: Record<string, ProfileLite> = {};
      (data || []).forEach((p: any) => {
        nameMap[p.id] = p.display_name || p.username || "User";
        profileMap[p.id] = p;
      });
      setNames(nameMap);
      setProfiles(profileMap);
    };
    run();
  }, [me, otherId]);

  // Scroll state
  const handleScroll = () => {
    if (!messagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsScrolledUp(!isAtBottom);
  };

  const filteredMsgs = useMemo(() => {
    if (!searchQuery.trim()) return msgs;
    return msgs.filter((m) => m.body?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [msgs, searchQuery]);

  // Load thread + realtime
  useEffect(() => {
    if (!threadKey || !me || !otherId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_key", threadKey)
        .order("created_at", { ascending: true });
      if (error) {
        console.error(error);
        toast.error("Failed to load messages");
        return;
      }
      setMsgs((data as Msg[]) || []);

      const toMark = (data || [])
        .filter((m: Msg) => m.recipient_id === me && !m.read_at)
        .map((m: Msg) => m.id);
      if (toMark.length) {
        await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", toMark);
        setUnreadCount(0);
      }
    };
    load();

    const ch = supabase
      .channel(`dm-${threadKey}`, { config: { presence: { key: me } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((prev) => [...prev, m]);
          if (m.recipient_id === me && !m.read_at) {
            if (!isScrolledUp) {
              supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
            } else {
              setUnreadCount((prev) => prev + 1);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((prev) => prev.map((p) => (p.id === m.id ? m : p)));
        }
      )
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
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await ch.track({ at: Date.now() });
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [threadKey, me, otherId, isScrolledUp]);

  // Auto scroll when new messages and not scrolled up
  useEffect(() => {
    if (!isScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadCount(0);
    }
  }, [msgs.length, isScrolledUp]);

  // Typing broadcast
  useEffect(() => {
    if (!me || !otherId || !threadKey) return;
    const ch = supabase.channel(`dm-${threadKey}`);
    const sendTyping = (typing: boolean) =>
      ch.send({ type: "broadcast", event: "typing", payload: { userId: me, typing } });
    const start = setTimeout(() => text && sendTyping(true), 120);
    const stop = setTimeout(() => sendTyping(false), 900);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
      supabase.removeChannel(ch);
    };
  }, [text, me, otherId, threadKey]);

  const send = async () => {
    if (!me || !otherId || !text.trim()) return;
    const body = text.trim();

    const optimisticId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID() : `tmp_${Date.now()}`;
    const optimistic: Msg = {
      id: optimisticId,
      sender_id: me,
      recipient_id: otherId,
      body,
      created_at: new Date().toISOString(),
      thread_key: threadKey!,
      read_at: null,
    };
    setMsgs((prev) => [...prev, optimistic]);
    setText("");

    const { error } = await supabase.from("messages").insert({
      sender_id: me,
      recipient_id: otherId,
      body,
    });

    if (error) {
      setMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      toast.error(`Couldn't send message: ${error.message}`);
      return;
    }

    const { data: latest } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_key", threadKey)
      .order("created_at", { ascending: true });
    if (latest) setMsgs(latest as Msg[]);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsScrolledUp(false);
    setUnreadCount(0);
    if (!me) return;
    const unreadIds = msgs.filter((m) => m.recipient_id === me && !m.read_at).map((m) => m.id);
    if (unreadIds.length) {
      supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    }
  };

  const addEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffHr = Math.abs(+now - +d) / 36e5;
    if (diffHr < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffHr < 168)
      return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (me === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-10 text-center">
          <div className="animate-pulse"><div className="h-4 bg-slate-700 rounded w-32 mx-auto" /></div>
        </div>
        <Footer />
      </div>
    );
  }

  const nameFor = (userId: string) => (userId === me ? "You" : names[userId] || "User");
  const otherProfile = profiles[otherId as string];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Header />

      {/* Force visible native inputs (mobile safe) */}
      <style>{`
        .force-input {
          color:#000!important;background:#fff!important;-webkit-text-fill-color:#000!important;
          caret-color:#000!important;border:1px solid rgba(0,0,0,.25)!important;border-radius:12px!important;
          padding:10px 12px!important;height:40px!important;line-height:20px!important;outline:none!important;
        }
        .force-input:focus { box-shadow:0 0 0 2px rgba(124,58,237,.35)!important;border-color:rgba(124,58,237,.75)!important; }
        .force-input::placeholder { color:#6b7280!important;-webkit-text-fill-color:#6b7280!important;opacity:1!important; }
      `}</style>

      <div className="mx-auto w-full max-w-md px-3 py-4 pb-24 overflow-hidden">
        {/* Sticky chat header (mobile) */}
        <div className="sticky top-0 z-10 -mx-3 bg-slate-800/90 backdrop-blur border-b border-slate-700/50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>

              <div className="flex items-center gap-2 min-w-0">
                <div className="relative">
                  {otherProfile?.avatar_url ? (
                    <img src={otherProfile.avatar_url} alt={nameFor(otherId as string)} className="w-9 h-9 rounded-full border" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center font-semibold">
                      {nameFor(otherId as string).charAt(0).toUpperCase()}
                    </div>
                  )}
                  {otherOnline && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-slate-800" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{nameFor(otherId as string)}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-300">
                    <Circle className={`w-2 h-2 ${otherOnline ? "text-green-500" : "text-slate-500"} fill-current`} />
                    <span className="truncate">
                      {otherOnline ? "Online" : "Offline"}{otherTyping && " • typing…"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setShowSearch((s) => !s)}>
                  <Search className="mr-2 h-4 w-4" /> Search
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}}>
                  <Phone className="mr-2 h-4 w-4" /> Voice call
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}}>
                  <Video className="mr-2 h-4 w-4" /> Video call
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <div><BlockButton otherUserId={otherId!} /></div>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <div><UnblockButton otherUserId={otherId!} /></div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {showSearch && (
            <div className="mt-2">
              <input
                type="text"
                placeholder="Search messages…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="force-input w-full"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        {/* Messages */}
        <Card className="border border-slate-700/50 bg-slate-800/60 backdrop-blur-sm">
          <div className="flex flex-col" style={{ height: "calc(100svh - 230px)" }}>
            <div
              ref={messagesRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
              onScroll={handleScroll}
            >
              {filteredMsgs.map((m, index) => {
                const mine = m.sender_id === me;
                const prevMsg = index > 0 ? filteredMsgs[index - 1] : null;
                const showAvatar = !mine && (!prevMsg || prevMsg.sender_id !== m.sender_id);
                const content = (m.body ?? "").trim();
                const isConsecutive = prevMsg && prevMsg.sender_id === m.sender_id;

                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
                    <div className={`flex items-end gap-2 max-w-[82%] ${mine ? "flex-row-reverse" : "flex-row"}`}>
                      {!mine && (
                        <div className={`w-6 h-6 flex-shrink-0 ${showAvatar ? "" : "invisible"}`}>
                          {showAvatar ? (
                            otherProfile?.avatar_url ? (
                              <img src={otherProfile.avatar_url} alt={nameFor(m.sender_id)} className="w-6 h-6 rounded-full" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white text-xs font-semibold flex items-center justify-center">
                                {nameFor(m.sender_id).charAt(0).toUpperCase()}
                              </div>
                            )
                          ) : null}
                        </div>
                      )}

                      <div className="flex flex-col">
                        <div
                          className={[
                            "relative px-4 py-2 text-sm leading-relaxed break-words shadow-lg transition-all",
                            mine
                              ? `bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-purple-500/25 ${
                                  isConsecutive ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-br-sm"
                                }`
                              : `bg-slate-700/80 text-slate-100 shadow-slate-900/50 ${
                                  isConsecutive ? "rounded-2xl rounded-bl-md" : "rounded-2xl rounded-bl-sm"
                                }`,
                          ].join(" ")}
                        >
                          {content.length ? (
                            <span className="whitespace-pre-wrap">{content}</span>
                          ) : (
                            <span className="opacity-60 italic text-xs">(empty message)</span>
                          )}
                        </div>
                        <div className={`mt-1 text-[10px] text-slate-500 ${mine ? "text-right" : "text-left"}`}>
                          {formatTime(m.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {otherTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-700/80 rounded-2xl rounded-bl-sm px-4 py-2 shadow-lg">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {isScrolledUp && unreadCount > 0 && (
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
                <Button onClick={scrollToBottom} className="bg-purple-600 hover:bg-purple-700 text-white rounded-full px-4 py-2 shadow-lg">
                  {unreadCount} new message{unreadCount > 1 ? "s" : ""}
                </Button>
              </div>
            )}

            {/* Composer */}
            <div className="p-3 border-t border-slate-700/50 bg-slate-800/40">
              {showEmojiPicker && (
                <div className="mb-3 p-3 bg-slate-700/80 rounded-xl border border-slate-600/50">
                  <div className="grid grid-cols-6 gap-2">
                    {commonEmojis.map((emoji) => (
                      <Button
                        key={emoji}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-slate-600/50 text-lg"
                        onClick={() => addEmoji(emoji)}
                      >
                        {emoji}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2">
                <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-white hover:bg-slate-700/50">
                  <Paperclip className="w-4 h-4" />
                </Button>

                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Type a message…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    className="force-input w-full"
                    autoComplete="off"
                    autoCorrect="on"
                    spellCheck
                  />
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-slate-300 hover:text-white hover:bg-slate-700/50"
                  onClick={() => setShowEmojiPicker((s) => !s)}
                >
                  <Smile className="w-4 h-4" />
                </Button>

                <Button
                  onClick={send}
                  disabled={!text.trim()}
                  className="h-10 w-10 p-0 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
