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
  Image,
  Mic,
  Settings,
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

  const emojiCategories = {
    faces: ["😀", "😂", "🥰", "😍", "🤔", "😎", "🥳", "😴"],
    gestures: ["👍", "👎", "👏", "🙌", "🤝", "✌️", "🤞", "👌"],
    hearts: ["❤️", "💙", "💚", "💛", "💜", "🖤", "🤍", "💖"],
    objects: ["🔥", "💯", "⚡", "💎", "🎉", "🚀", "💡", "⭐"],
  };

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

  // typing broadcast
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

  // send message
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
      thread_key: threadKey,
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950">
        <Header />
        <div className="max-w-6xl mx-auto px-4 py-10 text-center">
          <div className="animate-pulse">
            <div className="h-6 bg-white/10 rounded-lg w-48 mx-auto"></div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const nameFor = (userId: string) => (userId === me ? "You" : names[userId] || "User");
  const otherProfile = profiles[otherId as string];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950">
      <Header />

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Enhanced Header */}
        <div className="bg-gradient-to-r from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl mb-6">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-3 transition-all duration-200"
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>

                <div className="flex items-center gap-4">
                  <div className="relative group">
                    {otherProfile?.avatar_url ? (
                      <img
                        src={otherProfile.avatar_url}
                        alt={nameFor(otherId as string)}
                        className="w-14 h-14 rounded-full border-3 border-gradient-to-r from-purple-400 to-blue-400 shadow-lg group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xl shadow-lg group-hover:scale-105 transition-transform duration-200">
                        {nameFor(otherId as string).charAt(0).toUpperCase()}
                      </div>
                    )}
                    {otherOnline && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-400 rounded-full border-3 border-slate-900 shadow-lg animate-pulse" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-white font-bold text-2xl tracking-tight">{nameFor(otherId as string)}</h2>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Circle
                          className={`w-2.5 h-2.5 fill-current ${otherOnline ? "text-emerald-400" : "text-slate-500"}`}
                        />
                        <span className={`font-medium ${otherOnline ? "text-emerald-400" : "text-slate-400"}`}>
                          {otherOnline ? "Online now" : "Offline"}
                        </span>
                      </div>
                      {otherTyping && (
                        <span className="text-purple-400 animate-pulse flex items-center gap-1">
                          <div className="flex space-x-0.5">
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" />
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}} />
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}} />
                          </div>
                          typing...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-3 transition-all duration-200"
                  onClick={() => setShowSearch((s) => !s)}
                >
                  <Search className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-3 transition-all duration-200">
                  <Phone className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-3 transition-all duration-200">
                  <Video className="w-5 h-5" />
                </Button>

                <div className="flex gap-2 ml-2 border-l border-white/10 pl-4">
                  <BlockButton otherUserId={otherId!} />
                  <UnblockButton otherUserId={otherId!} />
                </div>

                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-3 transition-all duration-200">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {showSearch && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/50" />
                  <Input
                    placeholder="Search messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder-white/50 rounded-full pl-12 h-12 focus:bg-white/15 focus:border-white/30 transition-all duration-200"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Chat Container */}
        <div className="bg-gradient-to-b from-slate-900/40 to-slate-800/40 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
          <div className="h-[70vh] flex flex-col">
            {/* Messages Area */}
            <div
              ref={messagesRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent hover:scrollbar-thumb-white/30"
              onScroll={handleScroll}
            >
              {filteredMsgs.map((m, i) => {
                const mine = m.sender_id === me;
                const prev = i > 0 ? filteredMsgs[i - 1] : null;
                const isConsecutive = !!prev && prev.sender_id === m.sender_id;
                const content = (m.body ?? "").trim();

                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
                    <div className={`flex items-end gap-3 max-w-[75%] ${mine ? "flex-row-reverse" : "flex-row"}`}>
                      {!mine && (
                        <div className={`w-8 h-8 flex-shrink-0 ${isConsecutive ? "invisible" : ""}`}>
                          {profiles[otherId as string]?.avatar_url ? (
                            <img
                              src={profiles[otherId as string]!.avatar_url!}
                              alt={nameFor(m.sender_id)}
                              className="w-8 h-8 rounded-full border-2 border-white/20"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-bold border-2 border-white/20">
                              {nameFor(m.sender_id).charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col space-y-1">
                        <div
                          className={[
                            "relative px-5 py-3 text-sm leading-relaxed break-words shadow-xl transition-all duration-300 group-hover:shadow-2xl",
                            mine
                              ? `bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-size-200 bg-pos-0 hover:bg-pos-100 text-white shadow-purple-500/30 ${
                                  isConsecutive ? "rounded-3xl rounded-br-lg" : "rounded-3xl rounded-br-sm"
                                }`
                              : `bg-gradient-to-r from-slate-700/90 to-slate-600/90 backdrop-blur-sm text-white shadow-slate-900/50 border border-white/10 ${
                                  isConsecutive ? "rounded-3xl rounded-bl-lg" : "rounded-3xl rounded-bl-sm"
                                }`,
                          ].join(" ")}
                        >
                          {content.length ? (
                            <span className="whitespace-pre-wrap font-medium">{content}</span>
                          ) : (
                            <span className="opacity-60 italic text-xs">(empty message)</span>
                          )}
                          
                          {/* Enhanced message glow effect */}
                          <div className={`absolute inset-0 rounded-3xl ${mine ? 'bg-gradient-to-r from-purple-600/20 to-blue-600/20' : 'bg-gradient-to-r from-slate-600/20 to-slate-500/20'} -z-10 blur-lg group-hover:opacity-80 opacity-0 transition-opacity duration-300`} />
                        </div>

                        <div
                          className={[
                            "flex items-center gap-2 text-xs text-white/50 px-2",
                            mine ? "justify-end" : "justify-start",
                          ].join(" ")}
                        >
                          <span className="font-medium">{formatTime(m.created_at)}</span>
                          {mine && m.read_at && (
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Enhanced Typing Indicator */}
              {otherTyping && (
                <div className="flex justify-start">
                  <div className="bg-gradient-to-r from-slate-700/90 to-slate-600/90 backdrop-blur-sm rounded-3xl rounded-bl-sm px-6 py-4 shadow-xl border border-white/10">
                    <div className="flex space-x-2">
                      <div className="w-2.5 h-2.5 bg-white/60 rounded-full animate-bounce" />
                      <div className="w-2.5 h-2.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                      <div className="w-2.5 h-2.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Enhanced Unread Messages Indicator */}
            {isScrolledUp && unreadCount > 0 && (
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20">
                <Button
                  onClick={scrollToBottom}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-full px-6 py-3 shadow-2xl animate-bounce border border-white/20 backdrop-blur-sm"
                >
                  <span className="font-semibold">{unreadCount} new message{unreadCount > 1 ? "s" : ""}</span>
                </Button>
              </div>
            )}

            {/* Enhanced Reply Indicator */}
            {replyingTo && (
              <div className="px-6 py-4 bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-sm border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm text-white/90">
                  <div className="w-1 h-12 bg-gradient-to-b from-purple-500 to-blue-500 rounded-full" />
                  <div className="space-y-1">
                    <div className="text-purple-400 text-xs font-semibold uppercase tracking-wide">Replying to {nameFor(replyingTo.sender_id)}</div>
                    <div className="truncate max-w-md text-white/70">{replyingTo.body}</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(null)}
                  className="text-white/50 hover:text-white hover:bg-white/10 rounded-full p-2"
                >
                  ✕
                </Button>
              </div>
            )}

            {/* Enhanced Composer */}
            <div className="p-6 bg-gradient-to-r from-slate-800/30 to-slate-700/30 backdrop-blur-sm border-t border-white/10">
              {/* Enhanced Emoji Picker */}
              {showEmojiPicker && (
                <div className="mb-6 p-6 bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
                  <div className="space-y-4">
                    {Object.entries(emojiCategories).map(([category, emojis]) => (
                      <div key={category}>
                        <h4 className="text-white/70 text-xs uppercase tracking-wide font-semibold mb-2 capitalize">{category}</h4>
                        <div className="grid grid-cols-8 gap-2">
                          {emojis.map((emoji) => (
                            <Button
                              key={emoji}
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0 hover:bg-white/10 hover:scale-110 transition-all duration-200 text-xl rounded-full"
                              onClick={() => addEmoji(emoji)}
                            >
                              {emoji}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                {/* Enhanced Action Buttons */}
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/60 hover:text-white hover:bg-white/10 rounded-full p-3 transition-all duration-200"
                  >
                    <Paperclip className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/60 hover:text-white hover:bg-white/10 rounded-full p-3 transition-all duration-200"
                  >
                    <Image className="w-5 h-5" />
                  </Button>
                </div>

                {/* Enhanced Input Field */}
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    placeholder="Type your message..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    className="
                      bg-white text-black placeholder-gray-500 border-0
                      rounded-full px-6 py-4 text-base font-medium
                      shadow-inner focus:shadow-lg transition-all duration-200
                      focus:ring-2 focus:ring-purple-500/50 focus:bg-white
                    "
                    style={{ 
                      backgroundColor: '#ffffff',
                      color: '#000000',
                      minHeight: "48px",
                      WebkitTextFillColor: '#000000'
                    }}
                    autoComplete="off"
                    autoCorrect="on"
                    spellCheck
                  />
                </div>

                {/* Enhanced Control Buttons */}
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/60 hover:text-white hover:bg-white/10 rounded-full p-3 transition-all duration-200"
                    onClick={() => setShowEmojiPicker((s) => !s)}
                  >
                    <Smile className="w-5 h-5" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/60 hover:text-white hover:bg-white/10 rounded-full p-3 transition-all duration-200"
                  >
                    <Mic className="w-5 h-5" />
                  </Button>

                  <Button
                    onClick={send}
                    disabled={!text.trim()}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-600 text-white rounded-full p-3 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
