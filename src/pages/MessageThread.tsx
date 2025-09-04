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
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commonEmojis = ["😀", "😂", "❤️", "👍", "👎", "😢", "😮", "😡", "🎉", "🔥", "💯", "😊"];

  // Load my user first (prevents wrong-side flash)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  // Stable thread key
  const threadKey = useMemo(() => {
    if (!me || !otherId) return null;
    return me < otherId ? `${me}|${otherId}` : `${otherId}|${me}`;
  }, [me, otherId]);

  // Last message overall (used for "Seen")
  const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
  const isLastMineRead = !!lastMsg && !!me && lastMsg.sender_id === me && !!lastMsg.read_at;

  // Load display names & avatars
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

  // Scroll position -> unread badge
  const handleScroll = () => {
    if (!messagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsScrolledUp(!isAtBottom);
  };

  // Searching
  const filteredMsgs = useMemo(() => {
    if (!searchQuery.trim()) return msgs;
    return msgs.filter((m) => (m.body ?? "").toLowerCase().includes(searchQuery.toLowerCase()));
  }, [msgs, searchQuery]);

  // Load + realtime
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

          // if I'm the recipient and I'm at bottom mark as read
          if (m.recipient_id === me && !m.read_at) {
            if (!isScrolledUp) {
              supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
            } else {
              setUnreadCount((x) => x + 1);
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

  // autoscroll when at bottom
  useEffect(() => {
    if (!isScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadCount(0);
    }
  }, [msgs.length, isScrolledUp]);

  // typing broadcast
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

    // fallback refresh if no realtime UPDATEs
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
    // mark any outstanding incoming as read
    const unread = msgs.filter((m) => m.recipient_id === me && !m.read_at).map((m) => m.id);
    if (unread.length) {
      supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread);
    }
  };

  const addEmoji = (emoji: string) => {
    setText((p) => p + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const formatTime = (s: string) =>
    new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const getMessageStatus = (m: Msg) => {
    if (m.sender_id !== me) return null;
    if (m.read_at) return <CheckCheck className="w-3 h-3 text-blue-500" />;
    return <Check className="w-3 h-3 text-gray-400" />;
  };

  if (me === null) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
        <Footer />
      </div>
    );
  }

  const nameFor = (userId: string) => (userId === me ? "You" : names[userId] || "User");
  const otherProfile = profiles[otherId as string];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Chat header */}
        <div className="bg-white dark:bg-slate-900 rounded-t-2xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 p-2"
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
                      className="w-10 h-10 rounded-full border"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-violet-600 text-white grid place-items-center font-semibold">
                      {nameFor(otherId as string).charAt(0).toUpperCase()}
                    </div>
                  )}
                  {otherOnline && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-slate-900" />
                  )}
                </div>

                <div>
                  <h2 className="font-semibold">{nameFor(otherId as string)}</h2>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Circle className={`w-2 h-2 ${otherOnline ? "text-green-500" : "text-slate-400"} fill-current`} />
                    <span>{otherOnline ? "Online" : "Offline"}</span>
                    {otherTyping && <span className="text-violet-600 dark:text-violet-400">• typing…</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setShowSearch((s) => !s)}
              >
                <Search className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                <Phone className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                <Video className="w-4 h-4" />
              </Button>
              <div className="flex gap-2 ml-2">
                <BlockButton otherUserId={otherId!} />
                <UnblockButton otherUserId={otherId!} />
              </div>
              <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {showSearch && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Input
                placeholder="Search messages…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Messages */}
        <Card className="rounded-none rounded-b-2xl border-x border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="h-[65vh] flex flex-col">
            <div
              ref={messagesRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
              onScroll={handleScroll}
            >
              {filteredMsgs.map((m, i) => {
                const mine = m.sender_id === me;
                const prev = i > 0 ? filteredMsgs[i - 1] : null;
                const isConsecutive = !!prev && prev.sender_id === m.sender_id;
                const isLast = !!lastMsg && m.id === lastMsg.id;
                const content = (m.body ?? "").trim();

                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[80vw] sm:max-w-[60%]">
                      <div
                        className={[
                          // bubble sizing
                          "inline-block w-fit max-w-full whitespace-pre-wrap break-words leading-relaxed",
                          "px-3 py-2 text-sm shadow-sm",
                          // visible, theme-agnostic colors
                          mine
                            ? "bg-violet-600 text-white"
                            : "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white",
                          // rounded grouping
                          mine
                            ? isConsecutive
                              ? "rounded-2xl rounded-br-md"
                              : "rounded-2xl rounded-br-sm"
                            : isConsecutive
                              ? "rounded-2xl rounded-bl-md"
                              : "rounded-2xl rounded-bl-sm",
                        ].join(" ")}
                      >
                        {content.length ? content : <span className="opacity-60 italic">(empty)</span>}
                      </div>

                      {/* meta line */}
                      <div
                        className={[
                          "mt-1 text-[10px]",
                          mine ? "text-right text-violet-700 dark:text-violet-300" : "text-left text-slate-500 dark:text-slate-300",
                        ].join(" ")}
                      >
                        {nameFor(m.sender_id)} • {formatTime(m.created_at)}
                        {/* show “Seen” only on my very last read message */}
                        {mine && isLast && isLastMineRead ? " • Seen" : ""}
                        {/* optional ticks */}
                        <span className="inline-block align-middle ml-1">{getMessageStatus(m)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* typing indicator */}
              {otherTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white rounded-2xl rounded-bl-sm px-3 py-2 text-xs">
                    typing…
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* unread badge when scrolled up */}
            {isScrolledUp && unreadCount > 0 && (
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
                <Button onClick={scrollToBottom} className="rounded-full px-4">
                  {unreadCount} new message{unreadCount > 1 ? "s" : ""}
                </Button>
              </div>
            )}

            {/* composer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
              {showEmojiPicker && (
                <div className="mb-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-6 gap-2">
                    {commonEmojis.map((e) => (
                      <Button
                        key={e}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-lg"
                        onClick={() => addEmoji(e)}
                      >
                        {e}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2">
                <Button variant="ghost" size="sm" className="h-10 w-10 p-0">
                  <Paperclip className="w-4 h-4" />
                </Button>

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
                    className="pr-12"
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0"
                  onClick={() => setShowEmojiPicker((s) => !s)}
                >
                  <Smile className="w-4 h-4" />
                </Button>

                <Button
                  onClick={send}
                  disabled={!text.trim()}
                  className="h-10 w-10 p-0 rounded-lg"
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
