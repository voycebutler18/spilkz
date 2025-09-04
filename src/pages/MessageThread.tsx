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
    return (me < otherId ? `${me}|${otherId}` : `${otherId}|${me}`);
  }, [me, otherId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  // Initial load + realtime
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

      // Mark my incoming as read
      const myIncoming = (data || []).filter(m => m.recipient_id === me && !m.read_at).map(m => m.id);
      if (myIncoming.length) {
        await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", myIncoming);
      }
    };

    load();

    // Realtime: inserts + updates (for read receipts)
    let channel = supabase
      .channel(`dm-${threadKey}`, { config: { presence: { key: me } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs(prev => {
            // If we added an optimistic “temp” message, drop it when real row arrives
            const withoutTemp = prev.filter(p => p.id !== (m as any)._optimisticId);
            return [...withoutTemp, m];
          });
          // quick best-effort read receipt
          if (m.recipient_id === me && !m.read_at) {
            supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs(prev => prev.map(p => (p.id === m.id ? m : p)));
        }
      )
      // Presence (online)
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
      // Typing
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

  // Typing broadcast (small debounce)
  useEffect(() => {
    if (!me || !otherId || !threadKey) return;
    const channel = supabase.channel(`dm-${threadKey}`);
    const sendTyping = (typing: boolean) =>
      channel.send({ type: "broadcast", event: "typing", payload: { userId: me, typing } });

    const start = setTimeout(() => { if (text) sendTyping(true); }, 120);
    const stop = setTimeout(() => sendTyping(false), 900);

    return () => { clearTimeout(start); clearTimeout(stop); };
  }, [text, me, otherId, threadKey]);

  const send = async () => {
    if (!me || !otherId || !text.trim()) return;

    const body = text.trim();

    // Optimistic message to avoid “disappearing” feeling
    const optimisticId = (crypto?.randomUUID?.() ?? `tmp_${Date.now()}`);
    const optimisticMsg: Msg = {
      id: optimisticId,
      sender_id: me,
      recipient_id: otherId,
      body,
      created_at: new Date().toISOString(),
      thread_key: threadKey!,
      read_at: null,
    };
    (optimisticMsg as any)._optimisticId = optimisticId;

    setMsgs(prev => [...prev, optimisticMsg]);
    setText("");

    const { error } = await supabase.from("messages").insert({
      sender_id: me,
      recipient_id: otherId,
      body,
    });

    if (error) {
      // Roll back optimistic message and show why
      setMsgs(prev => prev.filter(m => m.id !== optimisticId));
      console.error(error);
      if (error.message?.toLowerCase().includes("violates row-level security") || error.code === "42501") {
        toast.error("You’re not allowed to send this message (blocked or not authorized).");
      } else {
        toast.error("Couldn’t send message. Please try again.");
      }
      return;
    }

    // If realtime is disabled, manually refresh so message appears
    // (keeps UX correct even if publication isn’t set)
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
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {msgs.map(m => {
              const mine = m.sender_id === me;
              const isOptimistic = (m as any)._optimisticId;
              return (
                <div key={m.id} className={`max-w-[75%] ${mine ? "ml-auto text-right" : ""} ${isOptimistic ? "opacity-60" : ""}`}>
                  <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-accent text-foreground"}`}>
                    {m.body}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {new Date(m.created_at).toLocaleTimeString()} {mine && m.read_at ? "• Read" : ""}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Write a message…"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") send(); }}
            />
            <Button onClick={send}>Send</Button>
          </div>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
