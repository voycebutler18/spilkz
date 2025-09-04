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

export default function MessageThread() {
  const { otherId } = useParams();
  const [me, setMe] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const threadKey = useMemo(() => {
    if (!me || !otherId) return null;
    return me < otherId ? `${me}|${otherId}` : `${otherId}|${me}`;
  }, [me, otherId]);

  // compute the latest sent-by-me message that has been read
  const lastSeenOutgoing = useMemo(() => {
    if (!me) return null;
    const readMine = msgs.filter(m => m.sender_id === me && m.read_at);
    if (!readMine.length) return null;
    // get most recent by read_at (fallback to created_at)
    readMine.sort((a, b) => {
      const ta = new Date(a.read_at || a.created_at).getTime();
      const tb = new Date(b.read_at || b.created_at).getTime();
      return ta - tb;
    });
    return readMine[readMine.length - 1];
  }, [msgs, me]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

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

      setMsgs(data || []);

      // mark my incoming messages as read when I view the thread
      const toMark = (data || [])
        .filter(m => m.recipient_id === me && !m.read_at)
        .map(m => m.id);
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
          setMsgs(prev => [...prev, m]);
          // auto-mark incoming as read if I’m currently viewing the thread
          if (m.recipient_id === me && !m.read_at) {
            supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
          }
        }
      )
      // read receipts and edits
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs(prev => prev.map(p => (p.id === m.id ? m : p)));
        }
      )
      // presence
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const others = Object.keys(state).filter(uid => uid === otherId);
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

    const start = setTimeout(() => { if (text) sendTyping(true); }, 120);
    const stop = setTimeout(() => sendTyping(false), 900);

    return () => { clearTimeout(start); clearTimeout(stop); };
  }, [text, me, otherId, threadKey]);

  const send = async () => {
    if (!me || !otherId || !text.trim()) return;
    const body = text.trim();

    // optimistic bubble
    const optimisticId =
      (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tmp_${Date.now()}`);
    const optimisticMsg: Msg = {
      id: optimisticId,
      sender_id: me,
      recipient_id: otherId,
      body,
      created_at: new Date().toISOString(),
      thread_key: threadKey!,
      read_at: null,
    };

    setMsgs(prev => [...prev, optimisticMsg]);
    setText("");

    const { error } = await supabase.from("messages").insert({
      sender_id: me,
      recipient_id: otherId,
      body,
    });

    if (error) {
      setMsgs(prev => prev.filter(m => m.id !== optimisticId));
      console.error(error);
      if (error.message?.toLowerCase().includes("row-level security") || error.code === "42501") {
        toast.error("You’re not allowed to send this message (blocked or not authorized).");
      } else {
        toast.error("Couldn’t send message. Please try again.");
      }
      return;
    }

    // fallback refresh if realtime update is not configured
    const { data: latest, error: selErr } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_key", threadKey)
      .order("created_at", { ascending: true });
    if (!selErr && latest) setMsgs(latest);
  };

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
              const mine = m.sender_id === me;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[80vw] sm:max-w-[60%]">
                    <div
                      className={[
                        "inline-block w-fit max-w-full",
                        "rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
                        mine ? "bg-primary text-primary-foreground" : "bg-accent text-foreground",
                      ].join(" ")}
                    >
                      {m.body}
                    </div>
                    <div className={["mt-1 text-[10px] text-muted-foreground", mine ? "text-right" : "text-left"].join(" ")}>
                      {new Date(m.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Single Seen indicator under the latest outgoing message that's been read */}
            {lastSeenOutgoing && (
              <div className="text-[10px] text-muted-foreground text-right pr-1">
                Seen {new Date(lastSeenOutgoing.read_at || lastSeenOutgoing.created_at).toLocaleTimeString()}
              </div>
            )}
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
              })}
            />
            <Button onClick={send}>Send</Button>
          </div>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
