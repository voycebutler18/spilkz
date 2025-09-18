// src/pages/Notes.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";

type NoteRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;   // timestamptz
  read_at: string | null; // timestamptz
  in_reply_to?: string | null;
};

const READ_GRACE_MS = 15_000; // 15s window for "recently read"

export default function NotesPage() {
  const { toast } = useToast();

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // compose form (optional)
  const [recipient, setRecipient] = useState(""); // username or user id—adjust for your app
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // lists
  const [unread, setUnread] = useState<NoteRow[]>([]);
  const [readRecent, setReadRecent] = useState<NoteRow[]>([]);

  // resolve current user
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setMe(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setMe(sess?.user?.id ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const cutoffISO = useMemo(
    () => new Date(Date.now() - READ_GRACE_MS).toISOString(),
    []
  );

  const reload = useCallback(async () => {
    if (!me) return;
    setLoading(true);

    const unreadQ = supabase
      .from("notes")
      .select("*")
      .eq("recipient_id", me)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    const readRecentQ = supabase
      .from("notes")
      .select("*")
      .eq("recipient_id", me)
      .not("read_at", "is", null)
      .gt("read_at", cutoffISO)
      .order("read_at", { ascending: false })
      .limit(200);

    const [u, r] = await Promise.all([unreadQ, readRecentQ]);

    if (u.error) {
      console.error(u.error);
      toast({ title: "Failed to load notes", variant: "destructive" });
    } else {
      setUnread((u.data ?? []) as NoteRow[]);
    }

    if (r.error) {
      console.error(r.error);
    } else {
      setReadRecent((r.data ?? []) as NoteRow[]);
    }

    setLoading(false);
  }, [me, cutoffISO, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  // realtime: add new note into unread (no auto-read!)
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel("notes:incoming-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notes", filter: `recipient_id=eq.${me}` },
        (payload) => {
          const row = payload.new as NoteRow;
          setUnread((cur) => [row, ...cur]);
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [me]);

  // explicit mark read
  const markRead = async (id: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("notes").update({ read_at: now }).eq("id", id);
    if (error) {
      console.error(error);
      toast({ title: "Could not mark as read", variant: "destructive" });
      return;
    }
    const moved = unread.find((n) => n.id === id);
    setUnread((cur) => cur.filter((n) => n.id !== id));
    if (moved) setReadRecent((cur) => [{ ...moved, read_at: now }, ...cur]);
  };

  // clear recently-read immediately (optional client cleanup)
  const clearReadNow = async () => {
    if (!me || readRecent.length === 0) return;
    const ids = readRecent.map((n) => n.id);
    const { error } = await supabase.from("notes").delete().in("id", ids);
    if (error) {
      console.error(error);
      toast({ title: "Could not clear", variant: "destructive" });
      return;
    }
    setReadRecent([]);
  };

  // (example) send a note – replace username->id lookup with your own logic
  const sendNote = async () => {
    const text = body.trim();
    if (!me || !recipient.trim() || !text) return;

    setSending(true);
    try {
      // Try to resolve recipient as username in 'profiles' table. Adjust for your schema.
      let recipientId = recipient.trim();

      if (!/^[0-9a-fA-F-]{36}$/.test(recipientId)) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", recipientId)
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("User not found");
        recipientId = data.id as string;
      }

      const { error: insErr } = await supabase.from("notes").insert({
        sender_id: me,
        recipient_id: recipientId,
        body: text,
      });
      if (insErr) throw insErr;

      setBody("");
      toast({ title: "Sent!" });
    } catch (e: any) {
      console.error(e);
      toast({ title: e.message || "Could not send", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const clearableCount = readRecent.length;

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-8">
      <h1 className="text-2xl font-semibold">Send a Note</h1>

      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <Input
          placeholder="recipient username or UUID"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
        <Input
          placeholder='Type your note…'
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button onClick={sendNote} disabled={sending || !recipient.trim() || !body.trim()}>
          {sending ? "Sending…" : "Send"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Heads up: read notes can be deleted after 15s (or when you press “Clear read now”).
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Your Note Inbox</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reload}>Refresh</Button>
          <Button variant="destructive" onClick={clearReadNow} disabled={!clearableCount}>
            Clear read now {clearableCount ? `(${clearableCount})` : ""}
          </Button>
        </div>
      </div>

      {/* UNREAD */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : unread.length === 0 ? (
        <div className="rounded-lg border border-white/10 p-4 text-muted-foreground">
          No notes yet. When someone sends you a note, it’ll appear here.
        </div>
      ) : (
        <div className="space-y-3">
          {unread.map((n) => (
            <div key={n.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-sm text-muted-foreground mb-1">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </div>
              <div className="whitespace-pre-wrap">{n.body}</div>
              <div className="mt-2">
                <Button size="sm" onClick={() => markRead(n.id)}>Mark read</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RECENTLY READ (15s window) */}
      <div className="pt-6">
        <h3 className="text-lg font-medium mb-3">Recently read (last 15s)</h3>
        {readRecent.length === 0 ? (
          <div className="rounded-lg border border-white/10 p-3 text-muted-foreground">
            Nothing recently read.
          </div>
        ) : (
          <div className="space-y-2">
            {readRecent.map((n) => (
              <div key={n.id} className="rounded-lg border border-white/10 bg-white/[.04] p-3">
                <div className="text-xs text-muted-foreground mb-1">
                  read {formatDistanceToNow(new Date(n.read_at || n.created_at), { addSuffix: true })}
                </div>
                <div className="whitespace-pre-wrap">{n.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
