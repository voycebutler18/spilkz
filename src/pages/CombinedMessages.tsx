// src/pages/CombinedMessages.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Circle,
  Mail,
  MessageSquare,
  Clock,
  Loader2,
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

type ThreadRow = {
  partnerId: string;
  lastMessage: Msg | null;
  unread: number;
  partner: ProfileLite | null;
};

export default function CombinedMessages() {
  const { otherId } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Inbox state
  const [allMessages, setAllMessages] = useState<Msg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [searchQuery, setSearchQuery] = useState("");

  // Active chat state
  const [activeThreadMsgs, setActiveThreadMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Refs
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Scroll the messages container only (not the window)
  const scrollThreadToBottom = (smooth = true) => {
    const el = messagesRef.current;
    if (!el) return;
    if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  };

  const commonEmojis = ["😀", "😂", "❤️", "👍", "👎", "😢", "😮", "😡", "🎉", "🔥", "💯", "😊"];

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const activeThreadKey = useMemo(() => {
    if (!me || !otherId) return null;
    return me < (otherId as string) ? `${me}|${otherId}` : `${otherId}|${me}`;
  }, [me, otherId]);

  // Load inbox messages
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setLoading(true);

    const loadInbox = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Failed to load messages");
        setLoading(false);
        return;
      }
      if (cancelled) return;

      setAllMessages((data as Msg[]) ?? []);

      // Load partner profiles
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

    loadInbox();

    // Setup realtime for inbox
    if (subRef.current) supabase.removeChannel(subRef.current);

    const ch = supabase
      .channel(`inbox-${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${me}` },
        (payload) => setAllMessages((prev) => [payload.new as Msg, ...prev])
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` },
        (payload) => {
          const newMsg = payload.new as Msg;
          setAllMessages((prev) => [newMsg, ...prev]);
          // If it's for the active thread, add to thread messages too and keep at bottom
          if (activeThreadKey && newMsg.thread_key === activeThreadKey) {
            setActiveThreadMsgs((prev) => [...prev, newMsg]);
            setTimeout(() => scrollThreadToBottom(true), 0);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Msg;
          if (m.sender_id !== me && m.recipient_id !== me) return;
          setAllMessages((prev) => {
            const idx = prev.findIndex((x) => x.id === m.id);
            if (idx === -1) return prev;
            const copy = prev.slice();
            copy[idx] = m;
            return copy;
          });
          // Update active thread too
          setActiveThreadMsgs((prev) => prev.map((p) => (p.id === m.id ? m : p)));
        }
      )
      .subscribe();

    subRef.current = ch;

    return () => {
      cancelled = true;
      if (subRef.current) supabase.removeChannel(subRef.current);
      subRef.current = null;
    };
  }, [me, activeThreadKey]);

  // Load active thread messages
  useEffect(() => {
    if (!activeThreadKey || !me || !otherId) {
      setActiveThreadMsgs([]);
      return;
    }

    const loadActiveThread = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_key", activeThreadKey)
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        return;
      }

      setActiveThreadMsgs((data as Msg[]) || []);

      // Mark as read
      const toMark = (data || [])
        .filter((m: Msg) => m.recipient_id === me && !m.read_at)
        .map((m: Msg) => m.id);
      if (toMark.length) {
        await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", toMark);
        setUnreadCount(0);
      }

      // ensure we're at the bottom when loading a thread
      setTimeout(() => scrollThreadToBottom(false), 0);
    };

    loadActiveThread();
  }, [activeThreadKey, me, otherId]);

  // Setup presence and typing for active thread
  useEffect(() => {
    if (!activeThreadKey || !me || !otherId) return;

    const ch = supabase
      .channel(`dm-${activeThreadKey}`, { config: { presence: { key: me } } })
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
  }, [activeThreadKey, me, otherId]);

  // Track whether user is scrolled up (so we don't auto-jump)
  const handleScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsScrolledUp(!isAtBottom);
  };

  // Auto scroll only when not scrolled up
  useEffect(() => {
    if (!isScrolledUp) {
      scrollThreadToBottom(true);
      setUnreadCount(0);
    }
  }, [activeThreadMsgs.length, isScrolledUp]);

  // Typing broadcast
  useEffect(() => {
    if (!me || !otherId || !activeThreadKey) return;
    const ch = supabase.channel(`dm-${activeThreadKey}`);
    const sendTyping = (typing: boolean) =>
      ch.send({ type: "broadcast", event: "typing", payload: { userId: me, typing } });
    const start = setTimeout(() => text && sendTyping(true), 120);
    const stop = setTimeout(() => sendTyping(false), 900);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
      supabase.removeChannel(ch);
    };
  }, [text, me, otherId, activeThreadKey]);

  // Compute threads from messages
  const threads = useMemo<ThreadRow[]>(() => {
    if (!me) return [];
    const map: Record<string, ThreadRow> = {};

    for (const m of allMessages) {
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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      arr = arr.filter((t) => {
        const name = t.partner?.display_name || t.partner?.username || t.partnerId;
        return name?.toLowerCase().includes(q) || t.lastMessage?.body?.toLowerCase().includes(q);
      });
    }

    arr.sort((a, b) => (b.lastMessage?.created_at || "").localeCompare(a.lastMessage?.created_at || ""));
    return arr;
  }, [allMessages, profiles, searchQuery, me]);

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
      thread_key: activeThreadKey!,
      read_at: null,
    };
    setActiveThreadMsgs((prev) => [...prev, optimistic]);
    setText("");
    // keep the view pinned to the bottom after send
    setTimeout(() => scrollThreadToBottom(false), 0);

    const { error } = await supabase.from("messages").insert({
      sender_id: me,
      recipient_id: otherId,
      body,
    });

    if (error) {
      setActiveThreadMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      toast.error(`Couldn't send message: ${error.message}`);
      return;
    }

    // Refresh active thread
    const { data: latest } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_key", activeThreadKey)
      .order("created_at", { ascending: true });
    if (latest) {
      setActiveThreadMsgs(latest as Msg[]);
      setTimeout(() => scrollThreadToBottom(false), 0);
    }
  };

  const selectThread = (partnerId: string) => {
    navigate(`/messages/${partnerId}`);
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

  const nameFor = (userId: string) => {
    if (userId === me) return "You";
    const profile = profiles[userId];
    return profile?.display_name || profile?.username || "User";
  };

  const otherProfile = profiles[otherId as string];

  if (me === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-10 text-center">
          <div className="animate-pulse">
            <div className="h-4 bg-slate-700 rounded w-32 mx-auto"></div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Header />

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

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-4 h-[85vh]">
          {/* Left Sidebar - Conversations List */}
          <div className="w-80 bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-700/50 flex flex-col">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Messages
                </h1>
                <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
                  Dashboard
                </Button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="force-input w-full pl-9"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : threads.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-70" />
                  No conversations yet
                </div>
              ) : (
                threads.map((t) => {
                  const name = t.partner?.display_name || t.partner?.username || "User";
                  const username = t.partner?.username ? `@${t.partner.username}` : "";
                  const avatar = t.partner?.avatar_url || null;
                  const last = t.lastMessage?.body?.trim() || "";
                  const when = formatWhen(t.lastMessage?.created_at);
                  const isActive = otherId === t.partnerId;

                  return (
                    <div
                      key={t.partnerId}
                      onClick={() => selectThread(t.partnerId)}
                      className={`flex items-center gap-3 p-4 hover:bg-slate-700/50 cursor-pointer transition-colors border-b border-slate-700/30 ${
                        isActive ? "bg-slate-700/70" : ""
                      }`}
                    >
                      {avatar ? (
                        <img src={avatar} alt={name} className="w-12 h-12 rounded-full border border-slate-600" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center text-sm font-bold">
                          {name.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white truncate">{name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">{when}</span>
                            {t.unread > 0 && (
                              <Badge variant="default" className="bg-purple-600 text-white">
                                {t.unread > 99 ? "99+" : t.unread}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-slate-400 truncate">{last || "(no message)"}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Side - Active Chat */}
          <div className="flex-1 bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-700/50 flex flex-col">
            {otherId && otherProfile ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-slate-700/50">
                  <div className="flex items-center justify-between">
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
                            {otherTyping && <span className="ml-2 text-purple-400 animate-pulse">typing...</span>}
                          </span>
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

                  {showSearch && (
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <input
                        type="text"
                        placeholder="Search in conversation..."
                        className="force-input w-full"
                        autoComplete="off"
                      />
                    </div>
                  )}
                </div>

                {/* Messages Area */}
                <div
                  ref={messagesRef}
                  onScroll={handleScroll}
                  className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
                  style={{ overscrollBehaviorY: "contain" }} // prevent scroll chaining to body
                >
                  {activeThreadMsgs.map((m, index) => {
                    const mine = m.sender_id === me;
                    const prevMsg = index > 0 ? activeThreadMsgs[index - 1] : null;
                    const showAvatar = !mine && (!prevMsg || prevMsg.sender_id !== m.sender_id);
                    const content = (m.body ?? "").trim();
                    const isConsecutive = prevMsg && prevMsg.sender_id === m.sender_id;

                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
                        <div className={`flex items-end gap-2 max-w-[80%] ${mine ? "flex-row-reverse" : "flex-row"}`}>
                          {!mine && (
                            <div className={`w-6 h-6 flex-shrink-0 ${showAvatar ? "" : "invisible"}`}>
                              {showAvatar &&
                                (otherProfile?.avatar_url ? (
                                  <img src={otherProfile.avatar_url} alt={nameFor(m.sender_id)} className="w-6 h-6 rounded-full" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                                    {nameFor(m.sender_id).charAt(0).toUpperCase()}
                                  </div>
                                ))}
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
                </div>

                {/* Message Composer */}
                <div className="p-4 border-t border-slate-700/50">
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
              </>
            ) : (
              /* No conversation selected */
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-xl font-semibold mb-2">Select a conversation</h3>
                  <p className="text-sm">Choose a conversation from the sidebar to start messaging</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
