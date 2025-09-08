// src/pages/MessageThread.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// ⬇️ removed shadcn Input import
// import { Input } from "@/components/ui/input";
import { BlockButton, UnblockButton } from "@/components/DM/BlockButtons";
import { toast } from "sonner";
import {
  Send,
  Paperclip,
  Smile,
  MoreVertical,
  Phone,
  Video,
  Search,
  ArrowLeft,
  Circle,
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
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commonEmojis = ["😀", "😂", "❤️", "👍", "👎", "😢", "😮", "😡", "🎉", "🔥", "💯", "😊"];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const threadKey = useMemo(() => {
    if (!me || !otherId) return null;
    return me < otherId ? `${me}|${otherId}` : `${otherId}|${me}`;
  }, [me, otherId]);

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

  useEffect(() => {
    if (!isScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadCount(0);
    }
  }, [msgs.length, isScrolledUp]);

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
    };
  }, [text, me, otherId, threadKey]);

  const send = async () => {
    if (!me || !otherId || !text.trim()) return;
    const body = text.trim();

    const optimisticId =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tmp_${Date.now()}`;
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
    setReplyingTo(null);

    // NOTE: do NOT pass thread_key here — the DB computes it.
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
    const unreadMessages = msgs.filter((m) => m.recipient_id === me && !m.read_at);
    if (unreadMessages.length > 0) {
      const unreadIds = unreadMessages.map((m) => m.id);
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
          <div className="animate-pulse">
            <div className="h-4 bg-slate-700 rounded w-32 mx-auto"></div>
          </div>
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

      {/* 🔒 super small, component-scoped CSS to FORCE visible inputs */}
      <style>{`
        .force-input {
          color: #000000 !important;
          background-color: #ffffff !important;
          -webkit-text-fill-color: #000000 !important;
          caret-color: #000000 !important;
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
      `}</style>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-t-2xl border border-slate-700/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-white hover:bg-slate-700/50 p-2"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>

              <div className="flex items-center gap-3">
                <div className="relative">
                  {otherProfile?.avatar_url ? (
                    <img
                      src={otherProfile.avatar_url}
                      alt={nameFor(otherId as string)}
                      className="w-10 h-10 rounded-full border-2 border-slate-600"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-semibold border-2 border-slate-600">
                      {nameFor(otherId as string).charAt(0).toUpperCase()}
                    </div>
                  )}
                  {otherOnline && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-800"></div>
                  )}
                </div>

                <div>
                  <h2 className="text-white font-semibold text-lg">{nameFor(otherId as string)}</h2>
                  <div className="flex items-center gap-2 text-sm">
                    <Circle
                      className={`w-2 h-2 fill-current ${otherOnline ? "text-green-500" : "text-slate-500"}`}
                    />
                    <span className="text-slate-400">
                      {otherOnline ? "Online" : "Offline"}
                      {otherTyping && (
                        <span className="ml-2 text-purple-400 animate-pulse">typing...</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-white hover:bg-slate-700/50"
                onClick={() => setShowSearch(!showSearch)}
              >
                <Search className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-700/50">
                <Phone className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-700/50">
                <Video className="w-4 h-4" />
              </Button>

              <div className="flex gap-2 ml-2">
                <BlockButton otherUserId={otherId!} />
                <UnblockButton otherUserId={otherId!} />
              </div>

              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-700/50">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Search Bar (native input) */}
          {showSearch && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="force-input w-full"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        {/* Messages */}
        <Card className="rounded-none rounded-b-2xl border-x border-b border-slate-700/50 bg-slate-800/60 backdrop-blur-sm">
          <div className="h-[65vh] flex flex-col">
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
                    <div className={`flex items-end gap-2 max-w-[80%] ${mine ? "flex-row-reverse" : "flex-row"}`}>
                      {!mine && (
                        <div className={`w-6 h-6 flex-shrink-0 ${showAvatar ? "" : "invisible"}`}>
                          {showAvatar && (
                            otherProfile?.avatar_url ? (
                              <img
                                src={otherProfile.avatar_url}
                                alt={nameFor(m.sender_id)}
                                className="w-6 h-6 rounded-full"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                                {nameFor(m.sender_id).charAt(0).toUpperCase()}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      <div className="flex flex-col">
                        <div
                          className={[
                            "relative group px-4 py-2 text-sm leading-relaxed break-words shadow-lg",
                            "transition-all duration-200 hover:shadow-xl",
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

                        <div
                          className={[
                            "flex items-center gap-1 mt-1 text-[10px] text-slate-500",
                            mine ? "justify-end" : "justify-start",
                          ].join(" ")}
                        >
                          <span>{formatTime(m.created_at)}</span>
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
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {isScrolledUp && unreadCount > 0 && (
              <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-10">
                <Button
                  onClick={scrollToBottom}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2 animate-bounce"
                >
                  <span className="text-sm">
                    {unreadCount} new message{unreadCount > 1 ? "s" : ""}
                  </span>
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </Button>
              </div>
            )}

            {replyingTo && (
              <div className="px-4 py-2 bg-slate-700/50 border-t border-slate-600/50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <div className="w-1 h-8 bg-purple-500 rounded"></div>
                  <div>
                    <div className="text-purple-400 text-xs">
                      Replying to {nameFor(replyingTo.sender_id)}
                    </div>
                    <div className="truncate max-w-md">{replyingTo.body}</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-white">
                  ×
                </Button>
              </div>
            )}

            {/* Composer */}
            <div className="p-4 border-t border-slate-700/50 bg-slate-800/40">
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
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-700/50 h-10 w-10 p-0">
                  <Paperclip className="w-4 h-4" />
                </Button>

                {/* 🔁 Native input (message box) */}
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Type a message..."
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
                  size="sm"
                  className="text-slate-400 hover:text-white hover:bg-slate-700/50 h-10 w-10 p-0"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Smile className="w-4 h-4" />
                </Button>

                <Button
                  onClick={send}
                  disabled={!text.trim()}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl h-10 w-10 p-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-200"
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
