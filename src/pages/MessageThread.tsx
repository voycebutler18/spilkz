import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // stable thread key for (me, otherId)
  const threadKey = useMemo(() => {
    if (!me || !otherId) return null;
    return (me < otherId ? `${me}|${otherId}` : `${otherId}|${me}`);
  }, [me, otherId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  // Load & subscribe
  useEffect(() => {
    if (!threadKey) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_key", threadKey)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMsgs(data || []);

      // Mark any unread that I received as read
      const myIncoming = (data || []).filter(m => m.recipient_id === me && !m.read_at).map(m => m.id);
      if (myIncoming.length) {
        await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", myIncoming);
      }
    };

    load();

    const channel = supabase
      .channel(`dm-${threadKey}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_key=eq.${threadKey}` },
        (payload) => setMsgs(prev => [...prev, payload.new as Msg]))
      .subscribe();

    return () => void supabase.removeChannel(channel);
  }, [threadKey, me]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs.length]);

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
