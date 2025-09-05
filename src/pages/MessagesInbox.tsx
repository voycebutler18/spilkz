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
  CheckCheck,
  Check,
  Eye,
  EyeOff
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

  // Common emojis for quick access
  const commonEmojis = ["😀", "😂", "❤️", "👍", "👎", "😢", "😮", "😡", "🎉", "🔥", "💯", "😊"];

  // 1) Know who I am first (prevents wrong-side flash)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  // 2) Stable thread key
  const threadKey = useMemo(() => {
    if (!me || !otherId) return null;
    return me < otherId ? `${me}|${otherId}` : `${otherId}|${me}`;
  }, [me, otherId]);

  // 4) Load display names and profiles for both users
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

  // 5) Scroll detection for unread indicator
  const handleScroll = () => {
    if (!messagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsScrolledUp(!isAtBottom);
  };

  // 6) Filter messages based on search
  const filteredMsgs = useMemo(() => {
    if (!searchQuery.trim()) return msgs;
    return msgs.filter(m => 
      m.body?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [msgs, searchQuery]);

  // 7) Initial load + realtime (messages, presence, typing)
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

      // mark any messages TO ME as read now
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
          
          // if I'm the recipient and I have this thread open, mark read immediately
          if (m.recipient_id === me && !m.read_at) {
            if (!isScrolledUp) {
              supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
            } else {
              setUnreadCount(prev => prev + 1);
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
      // presence
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        setOtherOnline(Object.prototype.hasOwnProperty.call(state, otherId as string));
      })
      .on("presence", { event: "join" }, ({ key }) => key === otherId && setOtherOnline(true))
      .on("presence", { event: "leave" }, ({ key }) => key === otherId && setOtherOnline(false))
      // typing
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

  // 8) autoscroll only if not scrolled up
  useEffect(() => {
    if (!isScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadCount(0);
    }
  }, [msgs.length, isScrolledUp]);

  // 9) typing broadcast
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

  // 10) send message
  const send = async () => {
    if (!me || !otherId || !text.trim()) return;
    const body = text.trim();

    // optimistic
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

    const { error } = await supabase.from("messages").insert({
      sender_id: me,
      recipient_id: otherId,
      body,
    });
    
    if (error) {
      setMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      toast.error("Couldn't send message.");
      return;
    }

    // fallback refresh if realtime UPDATEs aren't firing
    const { data: latest } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_key", threadKey)
      .order("created_at", { ascending: true });
    if (latest) setMsgs(latest as Msg[]);
  };

  // 11) Scroll to bottom function
  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsScrolledUp(false);
    setUnreadCount(0);
    
    // Mark recent unread messages as read
    const unreadMessages = msgs.filter(m => m.recipient_id === me && !m.read_at);
    if (unreadMessages.length > 0) {
      const unreadIds = unreadMessages.map(m => m.id);
      supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    }
  };

  // 12) Add emoji to message
  const addEmoji = (emoji: string) => {
    setText(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // 13) Format time more elegantly
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  };

  // 14) Message status (kept function, not shown)
  const getMessageStatus = (msg: Msg) => {
    if (msg.sender_id !== me) return null;
    if (msg.read_at) return <CheckCheck className="w-3 h-3 text-blue-500" />;
    return <Check className="w-3 h-3 text-gray-400" />;
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
        {/* Chat Header */}
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
                {/* Avatar */}
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
                  <h2 className="text-white font-semibold text-lg">
                    {nameFor(otherId as string)}
                  </h2>
                  <div className="flex items-center gap-2 text-sm">
                    <Circle className={`w-2 h-2 fill-current ${otherOnline ? 'text-green-500' : 'text-slate-500'}`} />
                    <span className="text-slate-400">
                      {otherOnline ? "Online" : "Offline"}
                      {otherTyping && (
                        <span className="ml-2 text-purple-400 animate-pulse">
                          typing...
                        </span>
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
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-white hover:bg-slate-700/50"
              >
                <Phone className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-white hover:bg-slate-700/50"
              >
                <Video className="w-4 h-4" />
              </Button>
              
              <div className="flex gap-2 ml-2">
                <BlockButton otherUserId={otherId!} />
                <UnblockButton otherUserId={otherId!} />
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-white hover:bg-slate-700/50"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Search Bar */}
          {showSearch && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
              />
            </div>
          )}
        </div>

        {/* Messages Container */}
        <Card className="rounded-none rounded-b-2xl border-x border-b border-slate-700/50 bg-slate-800/60 backdrop-blur-sm">
          <div className="h-[65vh] flex flex-col">
            {/* Messages List */}
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
                    <div className={`flex items-end gap-2 max-w-[80%] ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* Avatar for other user */}
                      {!mine && (
                        <div className={`w-6 h-6 flex-shrink-0 ${showAvatar ? '' : 'invisible'}`}>
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
                        {/* Message bubble */}
                        <div
                          className={[
                            "relative group px-4 py-2 text-sm leading-relaxed break-words shadow-lg",
                            "transition-all duration-200 hover:shadow-xl",
                            mine
                              ? `bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-purple-500/25 ${
                                  isConsecutive ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-br-sm'
                                }`
                              : `bg-slate-700/80 text-slate-100 shadow-slate-900/50 ${
                                  isConsecutive ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl rounded-bl-sm'
                                }`,
                          ].join(" ")}
                        >
                          {content.length ? (
                            <span className="whitespace-pre-wrap">{content}</span>
                          ) : (
                            <span className="opacity-60 italic text-xs">(empty message)</span>
                          )}
                          
                          {/* Message actions on hover */}
                          <div className="absolute -top-8 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 rounded-lg shadow-lg border border-slate-700 flex">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-slate-300 hover:text-white"
                              onClick={() => setReplyingTo(m)}
                            >
                              Reply
                            </Button>
                          </div>
                        </div>

                        {/* Timestamp (no seen indicator) */}
                        <div
                          className={[
                            "flex items-center gap-1 mt-1 text-[10px] text-slate-500",
                            mine ? "justify-end" : "justify-start",
                          ].join(" ")}
                        >
                          <span>{formatTime(m.created_at)}</span>
                          {/* seen/status removed per request */}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {otherTyping && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 flex-shrink-0">
                      {otherProfile?.avatar_url ? (
                        <img 
                          src={otherProfile.avatar_url} 
                          alt={nameFor(otherId as string)}
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                          {nameFor(otherId as string).charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="bg-slate-700/80 rounded-2xl rounded-bl-sm px-4 py-2 shadow-lg">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Unread messages indicator */}
            {isScrolledUp && unreadCount > 0 && (
              <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-10">
                <Button
                  onClick={scrollToBottom}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2 animate-bounce"
                >
                  <span className="text-sm">{unreadCount} new message{unreadCount > 1 ? 's' : ''}</span>
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </Button>
              </div>
            )}

            {/* Reply indicator */}
            {replyingTo && (
              <div className="px-4 py-2 bg-slate-700/50 border-t border-slate-600/50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <div className="w-1 h-8 bg-purple-500 rounded"></div>
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

            {/* Input Area */}
            <div className="p-4 border-t border-slate-700/50 bg-slate-800/40">
              {/* Emoji Picker */}
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
                {/* Attachment button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white hover:bg-slate-700/50 h-10 w-10 p-0"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>

                {/* Message input — FIXED: proper contrast for dark theme */}
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    placeholder="Type a message..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    className="bg-slate-700/60 text-white placeholder-slate-400 border-slate-600/50
                               rounded-xl pr-12 h-10 resize-none
                               focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50
                               focus:bg-slate-700/80"
                    style={{ minHeight: "40px" }}
                  />
                </div>

                {/* Emoji button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white hover:bg-slate-700/50 h-10 w-10 p-0"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Smile className="w-4 h-4" />
                </Button>

                {/* Send button */}
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
