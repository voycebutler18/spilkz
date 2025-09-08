// src/pages/MessageThread.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const commonEmojis = ["😀", "😂", "❤️", "👍", "👎", "😢", "😮", "😡", "🎉", "🔥", "💯", "😊"];

  // who am I
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  // thread key
  const threadKey = useMemo(() => {
    if (!me || !otherId) return null;
    return me < (otherId as string) ? `${me}|${otherId}` : `${otherId}|${me}`;
  }, [me, otherId]);

  // load both profiles
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

  // scroll detection
  const handleScroll = () => {
    if (!messagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsScrolledUp(!isAtBottom);
  };

  // filtered messages
  const filteredMsgs = useMemo(() => {
    if (!searchQuery.trim()) return msgs;
    return msgs.filter((m) => m.body?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [msgs, searchQuery]);

  // initial load + realtime
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

      // mark unread to me as read
      const toMark = (data || [])
        .filter((m: Msg) => m.recipient_id === me && !m.read_at)
        .map((m: Msg) => m.id);

      if (toMark.length) {
        await supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", toMark);
        setUnreadCount(0);
      }
    };

    load();

    // subscribe
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const ch = supabase
      .channel(`dm-${threadKey}`, { config: { presence: { key: me } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((prev) => [...prev, m]);

          // mark as read if I'm viewing and it's to me
          if (m.recipient_id === me && !m.read_at) {
            if (!isScrolledUp) {
              supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
            } else {
              setUnreadCount((p) => p + 1);
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

    channelRef.current = ch;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [threadKey, me, otherId, isScrolledUp]);

  // auto-scroll
  useEffect(() => {
    if (!isScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadCount(0);
    }
  }, [msgs.length, isScrolledUp]);

  // typing broadcast (reuses subscribed channel)
  useEffect(() => {
    if (!me || !threadKey || !channelRef.current) return;

    const sendTyping = (typing: boolean) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: me, typing },
      });
    };

    const start = setTimeout(() => text && sendTyping(true), 120);
    const stop = setTimeout(() => sendTyping(false), 900);

    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [text, me, threadKey]);

  // send message (ensures thread_key is included)
  const send = async () => {
    if (!me || !otherId || !text.trim() || !threadKey) return;
    const body = text.trim();

    const tempId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tmp_${Date.now()}`;

    const optimistic: Msg = {
      id: tempId,
      sender_id: me,
      recipient_id: otherId,
      body,
      created_at: new Date().toISOString(),
      thread_key: threadKey,
      read_at: null,
    };

    setMsgs((prev) => [...prev, optimistic]);
    setText("");
    setReplyingTo(null);

    const { error } = await supabase.from("messages").insert({
      sender_id: me,
      recipient_id: otherId,
      body,
      thread_key: threadKey, // <- make sure the row has the same thread key
    });

    if (error) {
      setMsgs((prev) => prev.filter((m) => m.id !== tempId));
      setText(body);
      toast.error("Couldn't send message.");
    }
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsScrolledUp(false);
    setUnreadCount(0);

    // mark any unread (to me) as read
    const toMark = msgs.filter((m) => m.recipient_id === me && !m.read_at).map((m) => m.id);
    if (toMark.length) {
      supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", toMark);
    }
  };

  const addEmoji = (emoji: string) => {
    setText((p) => p + emoji);
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

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Top bar */}
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
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-800" />
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
                      {otherTyping && <span className="ml-2 text-purple-400 animate-pulse">typing…</span>}
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
                onClick={() => setShowSearch((s) => !s)}
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

          {showSearch && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <Input
                placeholder="Search messages…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
              />
            </div>
          )}
        </div>

        {/* Chat surface */}
        <Card className="relative rounded-none rounded-b-2xl border-x border-b border-slate-700/50 bg-slate-800/60 backdrop-blur-sm">
          <div className="h-[65vh] flex flex-col">
            {/* list */}
            <div
              ref={messagesRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
              onScroll={handleScroll}
            >
              {filteredMsgs.map((m, i) => {
                const mine = m.sender_id === me;
                const prev = i > 0 ? filteredMsgs[i - 1] : null;
                const isConsecutive = !!prev && prev.sender_id === m.sender_id;
                const content = (m.body ?? "").trim();

                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
                    <div className={`flex items-end gap-2 max-w-[80%] ${mine ? "flex-row-reverse" : "flex-row"}`}>
                      {!mine && (
                        <div className={`w-6 h-6 flex-shrink-0 ${isConsecutive ? "invisible" : ""}`}>
                          {profiles[otherId as string]?.avatar_url ? (
                            <img
                              src={profiles[otherId as string]!.avatar_url!}
                              alt={nameFor(m.sender_id)}
                              className="w-6 h-6 rounded-full"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                              {nameFor(m.sender_id).charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col">
                        <div
                          className={[
                            "relative px-4 py-2 text-sm leading-relaxed break-words shadow-lg transition-all duration-200",
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
                            "mt-1 text-[10px] text-slate-500 flex items-center gap-1",
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

              {/* typing */}
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

            {/* unread floater */}
            {isScrolledUp && unreadCount > 0 && (
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
                <Button
                  onClick={scrollToBottom}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-full px-4 py-2 shadow-lg animate-bounce"
                >
                  {unreadCount} new message{unreadCount > 1 ? "s" : ""}
                </Button>
              </div>
            )}

            {/* reply indicator */}
            {replyingTo && (
              <div className="px-4 py-2 bg-slate-700/50 border-t border-slate-600/50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <div className="w-1 h-8 bg-purple-500 rounded" />
                  <div>
                    <div className="text-purple-400 text-xs">Replying to {nameFor(replyingTo.sender_id)}</div>
                    <div className="truncate max-w-md">{replyingTo.body}</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(null)}
                  className="text-slate-400 hover:text-white"
                >
                  ×
                </Button>
              </div>
            )}

            {/* composer */}
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white hover:bg-slate-700/50 h-10 w-10 p-0"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>

                {/* INPUT — guaranteed visible text while typing */}
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    placeholder="Type a message…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    className="
                      bg-white text-black placeholder-slate-500 border-slate-300
                      dark:bg-slate-700/60 dark:text-white dark:placeholder-slate-400 dark:border-slate-600/50
                      rounded-xl pr-12 h-10 caret-purple-500
                      focus-visible:ring-2 focus-visible:ring-purple-500/60 focus-visible:border-purple-500/60
                    "
                    // Prevent Safari/WebKit from inheriting transparent text from parents
                    style={{ WebkitTextFillColor: "currentColor", minHeight: "40px" }}
                    autoComplete="off"
                    autoCorrect="on"
                    spellCheck
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white hover:bg-slate-700/50 h-10 w-10 p-0"
                  onClick={() => setShowEmojiPicker((s) => !s)}
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
