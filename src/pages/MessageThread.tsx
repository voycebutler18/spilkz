import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockButton, UnblockButton } from "@/components/DM/BlockButtons";

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

  useEffect(() => {
    if (!threadKey || !me || !otherId) return;

    let presenceChannel = supabase.channel(`dm-${threadKey}`, {
      config: { presence: { key: me } }
    });

    const load = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_key", threadKey)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMsgs(data || []);

      // mark my incoming as read
      const myIncoming = (data || []).filter(m => m.recipient_id === me && !m.read_at).map(m => m.id);
      if (myIncoming.length) {
        await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", myIncoming);
      }
    };

    load();

    // message inserts
    presenceChannel = presenceChannel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
      (payload) => {
        const m = payload.new as Msg;
        setMsgs(prev => [...prev, m]);
        if (m.recipient_id === me && !m.read_at) {
          // best-effort quick read receipt
          supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
        }
      }
    );

    // presence (online status)
    presenceChannel = presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const others = Object.keys(state).filter(uid => uid === otherId);
        setOtherOnline(others.length > 0);
      })
      .on("presence", { event: "join" }, ({ key }) => {
        if (key === otherId) setOtherOnline(true);
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key === otherId) setOtherOnline(false);
      });

    // typing indicators via broadcast
    presenceChannel = presenceChannel.on("broadcast", { event: "typing" }, (payload) => {
      const { userId, typing } = payload.payload as { userId: string; typing: boolean };
      if (userId === otherId) setOtherTyping(Boolean(typing));
    });

    presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({ at: Date.now() });
      }
    });

    return () => { supabase.removeChannel(presenceChannel); };
  }, [threadKey, me, otherId]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs.length]);

  // typing broadcast (debounced)
  useEffect(() => {
    if (!me || !otherId || !threadKey) return;
    const channel = supabase.channel(`dm-${threadKey}`);
    const sendTyping = (typing: boolean) =>
      channel.send({ type: "broadcast", event: "typing", payload: { userId: me, typing } });

    const t = setTimeout(() => { if (text) sendTyping(true); }, 150);
    const stop = setTimeout(() => sendTyping(false), 1200);

    return () => { clearTimeout(t); clearTimeout(stop); };
  }, [text, me, otherId, threadKey]);

  const send = async () => {
    if (!me || !otherId || !text.trim()) return;
    const { error } = await supabase.from("messages").insert({
      sender_id: me,
      recipient_id: otherId,
      body: text.trim(),
    });
    if (!error) setText("");
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
              return (
                <div key={m.id} className={`max-w-[75%] ${mine ? "ml-auto text-right" : ""}`}>
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
