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

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  thread_key: string;
  read_at: string | null;
};

type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string | null;
};

export default function MessageThread() {
  const { otherId } = useParams();
  const [me, setMe] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Load who I am first (prevents wrong-side flash)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  // Build stable thread key once we know both ids
  const threadKey = useMemo(() => {
    if (!me || !otherId) return null;
    return me < otherId ? `${me}|${otherId}` : `${otherId}|${me}`;
  }, [me, otherId]);

  // Last message overall
  const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
  // Show Seen only if the very last message is mine and has read_at
  const showSeenOnLast =
    !!lastMsg && !!me && lastMsg.sender_id === me && !!lastMsg.read_at;

  // Fetch display names for both sides (me + other) once we know ids
  useEffect(() => {
    const loadNames = async () => {
      if (!me || !otherId) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", [me, otherId as string]);

      if (error) return;
      const map: Record<string, string> = {};
      (data as ProfileLite[]).forEach((p) => {
        map[p.id] = p.display_name || p.username || "User";
      });
      setNames(map);
    };
    loadNames();
  }, [me, otherId]);

  // Initial load + realtime updates (messages, presence, typing)
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

      setMsgs(data || []);

      // Mark all messages TO ME as read now that I'm viewing the thread
      const toMark = (data || [])
        .filter((m) => m.recipient_id === me && !m.read_at)
        .map((m) => m.id);
      if (toMark.length) {
        await supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", toMark);
      }
    };

    load();

    const channel = supabase
      .channel(`dm-${threadKey}`, { config: { presence: { key: me } } })
      // new messages
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((prev) => [...prev, m]);

          // If I'm the recipient and I have this thread open, mark read right away
          if (m.recipient_id === me && !m.read_at) {
            supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", m.id);
          }
        }
      )
      // updates (e.g., read_at changes)
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
        const state = channel.presenceState();
        const others = Object.keys(state).filter((uid) => uid === otherId);
        setOtherOnline(others.length > 0);
      })
      .on("presence", { event: "join" }, ({ key }) => {
        if (key === otherId) setOtherOnline(true);
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key === otherId) setOtherOnline(false);
      })
      // typing
      .on("broadcast", { event: "typing" }, (payload) => {
        const { userId, typing } = payload.payload as { userId: string; typing: boolean };
        if (userId === otherId) setOtherTyping(Boolean(typing));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadKey, me, otherId]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs.length]);

  // typing broadcast (debounced)
  useEffect(() => {
    if (!me || !otherId || !threadKey) return;
    const ch = supabase.channel(`dm-${threadKey}`);
    const sendTyping = (typing: boolean) =>
      ch.send({ type: "broadcast", event: "typing", payload: { userId: me, typing } });

    const start = setTimeout(() => {
      if (text) sendTyping(true);
    }, 120);
    const stop = setTimeout(() => sendTyping(false), 900);

    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [text, me, otherId, threadKey]);

  const send = async () => {
    if (!me || !otherId || !text.trim()) return;

    const body = text.trim();

    // Optimistic message
    const optimisticId =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tmp_${Date.now()}`;
    const optimisticMsg: Msg = {
      id: optimisticId,
      sender_id: me,
      recipient_id: otherId!,
      body,
      created_at: new Date().toISOString(),
      thread_key: threadKey!,
      read_at: null,
    };
    setMsgs((prev) => [...prev, optimisticMsg]);
    setText("");

    const { error } = await supabase.from("messages").insert({
      sender_id: me,
      recipient_id: otherId,
      body,
    });

    if (error) {
      setMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      console.error(error);
      toast.error("Couldn’t send message.");
      return;
    }

    // Fallback fetch (if realtime UPDATEs aren’t set)
    const { data: latest, error: selErr } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_key", threadKey)
      .order("created_at", { ascending: true });
    if (!selErr && latest) setMsgs(latest);
  };

  // Wait until we know who I am to avoid wrong alignment
  if (me === null) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-3xl mx-auto px-4 py-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
        <Footer />
      </div>
    );
  }

  const nameFor = (userId: string) =>
    userId === me ? "You" : names[userId] || "User";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {otherOnline ? "Online" : "Offline"} {otherTyping && "• typing…"}
          </div>
          <div className="flex gap-2">
            <BlockButton otherUserId={otherId!} />
            <UnblockButton otherUserId={otherId!} />
          </div>
        </div>

        <Card className="p-4 h-[70vh] flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {msgs.map((m) => {
              const mine = m.sender_id === me; // right vs left
              const isLast = lastMsg && m.id === lastMsg.id;
              const ts = new Date(m.created_at).toLocaleTimeString();

              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[80vw] sm:max-w-[60%]">
                    <div
                      className={[
                        "inline-block w-fit max-w-full whitespace-pre-wrap break-words leading-relaxed",
                        "rounded-2xl px-3 py-2 text-sm",
                        // Explicit, readable colors (light & dark)
                        mine
                          ? "bg-violet-600 text-white"
                          : "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white",
                      ].join(" ")}
                    >
                      {m.body}
                    </div>
                    <div
                      className={[
                        "mt-1 text-[10px]",
                        mine ? "text-right text-violet-700 dark:text-violet-300" : "text-left text-gray-500 dark:text-gray-300",
                      ].join(" ")}
                    >
                      {nameFor(m.sender_id)} • {ts}
                      {mine && isLast && m.read_at ? " • Seen" : ""}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Write a message…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <Button onClick={send}>Send</Button>
          </div>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
