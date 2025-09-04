import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";

type Row = {
  thread_key: string;
  last_message_id: string;
  sender_id: string;
  recipient_id: string;
  last_body: string;
  last_created_at: string;
};

type ProfileLite = { id: string; display_name: string | null; username: string | null; avatar_url: string | null; };

export default function MessagesInbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from("latest_dm_threads").select("*").order("last_created_at", { ascending: false });
      if (error) throw error;

      // Only threads I’m part of (RLS already filters messages, but the view is public; we’ll filter client-side just in case)
      const mine = (data || []).filter((r: Row) => r.sender_id === me || r.recipient_id === me);
      setRows(mine);

      // Fetch counterpart profiles
      const ids = Array.from(new Set(mine.map(r => r.sender_id === me ? r.recipient_id : r.sender_id)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", ids);
        const map: Record<string, ProfileLite> = {};
        (profs || []).forEach(p => map[p.id] = p);
        setProfiles(map);
      }
    };
    if (me) load();
  }, [me]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-3">
        <h1 className="text-2xl font-bold">Messages</h1>
        {(rows.length === 0) && <Card className="p-6">No conversations yet</Card>}
        {rows.map(r => {
          const otherId = r.sender_id === me ? r.recipient_id : r.sender_id;
          const other = profiles[otherId];
          return (
            <Link key={r.thread_key} to={`/messages/${otherId}`}>
              <Card className="p-4 hover:bg-accent/40 transition">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{other?.display_name || other?.username || "User"}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.last_created_at).toLocaleString()}</div>
                </div>
                <div className="text-sm text-muted-foreground line-clamp-1">{r.last_body}</div>
              </Card>
            </Link>
          );
        })}
      </div>
      <Footer />
    </div>
  );
}
