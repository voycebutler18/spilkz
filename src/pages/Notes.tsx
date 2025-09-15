import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";

/**
 * Requires:
 * - table public.notes(id, sender_id, recipient_id, body, in_reply_to, read_at, deleted_at, created_at)
 * - view  public.notes_enriched with sender_* fields from profiles
 * RLS idea:
 *   SELECT: sender_id = auth.uid() OR recipient_id = auth.uid()
 *   INSERT: sender_id = auth.uid()
 *   UPDATE: recipient can set read_at for their notes
 *   DELETE: recipient can delete their read notes (we hard-delete on leaving page)
 */

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type NoteRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  in_reply_to: string | null;

  // from notes_enriched view
  sender_username?: string | null;
  sender_display_name?: string | null;
  sender_avatar_url?: string | null;
};

export default function NotesPage() {
  const [me, setMe] = useState<string | null>(null);

  // composer state
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [options, setOptions] = useState<Profile[]>([]);
  const [toUser, setToUser] = useState<Profile | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // inbox state
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [inbox, setInbox] = useState<NoteRow[]>([]);
  const [replying, setReplying] = useState<Record<string, boolean>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  // track notes that were unread -> we marked read this session
  const readThisSession = useRef<Set<string>>(new Set());

  // ---------- auth ----------
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error(error);
        toast.error("Could not get user");
        return;
      }
      if (!mounted) return;
      setMe(data.user?.id ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // ---------- search creators ----------
  useEffect(() => {
    if (!query.trim()) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();

    const run = async () => {
      setSearching(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .ilike("username", `%${query.trim()}%`)
        .limit(8);

      if (!controller.signal.aborted) {
        if (error) console.error(error);
        setOptions((data as Profile[]) ?? []);
        setSearching(false);
      }
    };

    const t = setTimeout(run, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query]);

  const handleSend = async () => {
    if (!me) {
      toast.error("Please sign in to send a note");
      return;
    }
    if (!toUser) {
      toast.error("Choose who you want to send a note to");
      return;
    }
    if (!body.trim()) {
      toast.error("Type a note");
      return;
    }
    if (toUser.id === me) {
      toast.error("You can’t send a note to yourself");
      return;
    }

    setSending(true);
    const { error } = await supabase.from("notes").insert({
      sender_id: me,
      recipient_id: toUser.id,
      body: body.trim(),
      in_reply_to: null,
    });
    setSending(false);

    if (error) {
      console.error(error);
      toast.error("Failed to send note");
      return;
    }
    setBody("");
    setToUser(null);
    setQuery("");
    toast.success("Note sent!");
  };

  // ---------- inbox ----------
  const fetchInbox = useCallback(async () => {
    if (!me) return;
    setLoadingInbox(true);

    // The view 'notes_enriched' does not include deleted_at, so do not filter on it here
    const { data, error } = await supabase
      .from("notes_enriched")
      .select("*")
      .eq("recipient_id", me)
      .order("created_at", { ascending: false });

    setLoadingInbox(false);

    if (error) {
      console.error(error);
      toast.error("Failed to load notes");
      return;
    }

    const rows = (data as NoteRow[]) ?? [];
    setInbox(rows);

    // Mark unread as read immediately (so they get hard-deleted when leaving)
    const unread = rows.filter((n) => !n.read_at);
    if (unread.length) {
      const ids = unread.map((n) => n.id);
      const { error: updErr } = await supabase
        .from("notes")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .eq("recipient_id", me);

      if (!updErr) {
        unread.forEach((n) => readThisSession.current.add(n.id));
        // reflect read_at in UI immediately
        const now = new Date().toISOString();
        setInbox((cur) => cur.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
      }
    }
  }, [me]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // realtime changes
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel("notes-realtime")
      .on(
        "postgres_changes",
        { schema: "public", table: "notes", event: "*" },
        () => fetchInbox()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, fetchInbox]);

  // ---------- ephemeral deletion on leave ----------
  const deleteReadNow = useCallback(async () => {
    if (!me) return;
    const ids = Array.from(readThisSession.current);
    if (!ids.length) return;

    await supabase.from("notes").delete().in("id", ids).eq("recipient_id", me);
    readThisSession.current.clear();
  }, [me]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // user navigated away / switched tab — purge read notes from this session
        deleteReadNow();
      }
    };
    const onUnload = () => deleteReadNow();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [deleteReadNow]);

  // UI helpers
  const initial = useCallback((p?: Profile | null, emailFallback?: string | null) => {
    return (p?.display_name?.[0] || p?.username?.[0] || emailFallback?.[0] || "U").toUpperCase();
  }, []);

  const hasInbox = inbox.length > 0;

  const disclaimer = useMemo(
    () => (
      <div className="rounded-md border border-yellow-300/40 bg-yellow-500/10 p-3 text-sm">
        <strong>Heads up:</strong> Notes disappear after you read them. We permanently
        delete any notes you’ve read as soon as you leave this page.
      </div>
    ),
    []
  );

  if (!me) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        {disclaimer}
        <div className="mt-6 text-sm">
          Please{" "}
          <a className="underline" href="/login">
            log in
          </a>{" "}
          to send and read notes.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-8">
      {/* Composer */}
      <div>
        <h1 className="text-xl font-semibold">Send a Note</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a creator and send a short, one-off note. When they open it, it’s marked read and will
          be deleted once they leave their notes page. They can reply directly below your note.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,320px)_1fr_auto]">
          <div className="relative">
            <Input
              value={toUser ? (toUser.display_name || toUser.username || "Selected") : query}
              onChange={(e) => {
                setToUser(null);
                setQuery(e.target.value);
              }}
              placeholder="Search username…"
              aria-label="Search creators"
            />
            {!!(query && !toUser) && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow">
                {searching && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
                )}
                {!searching && options.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                )}
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                    onClick={() => {
                      setToUser(opt);
                      setQuery("");
                    }}
                  >
                    <Avatar className="h-6 w-6">
                      {opt.avatar_url ? <AvatarImage src={opt.avatar_url} /> : null}
                      <AvatarFallback className="text-[10px]">
                        {initial(opt, null)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="text-sm">
                        {opt.display_name || opt.username || "User"}
                      </div>
                      {opt.username ? (
                        <div className="text-xs text-muted-foreground">@{opt.username}</div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              toUser
                ? `Write a note to ${toUser.display_name || toUser.username || "creator"}…`
                : "Choose a creator first…"
            }
            className="min-h-[44px]"
          />

          <Button onClick={handleSend} disabled={sending || !toUser || !body.trim()}>
            <Send className="mr-2 h-4 w-4" />
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>

        <div className="mt-4">{disclaimer}</div>
      </div>

      {/* Inbox */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Note Inbox</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchInbox} disabled={loadingInbox}>
              Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={deleteReadNow}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear read now
            </Button>
          </div>
        </div>

        {loadingInbox ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !hasInbox ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            No notes yet. When someone sends you a note, it’ll appear here.
          </div>
        ) : (
          <ul className="space-y-3">
            {inbox.map((n) => (
              <li key={n.id} className="rounded-md border p-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9">
                    {n.sender_avatar_url ? <AvatarImage src={n.sender_avatar_url} /> : null}
                    <AvatarFallback>
                      {(n.sender_display_name || n.sender_username || "U")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/profile/${n.sender_id}`}
                        className="font-medium hover:underline"
                        title="View profile"
                      >
                        {n.sender_display_name || n.sender_username || "User"}
                      </a>
                      {n.sender_username ? (
                        <span className="text-xs text-muted-foreground">@{n.sender_username}</span>
                      ) : null}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-1 whitespace-pre-wrap text-sm">{n.body}</div>

                    {/* Reply box */}
                    <div className="mt-2 flex items-center gap-2">
                      {!replying[n.id] ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReplying((s) => ({ ...s, [n.id]: true }))}
                        >
                          Reply
                        </Button>
                      ) : (
                        <>
                          <Textarea
                            value={replyText[n.id] ?? ""}
                            onChange={(e) =>
                              setReplyText((s) => ({ ...s, [n.id]: e.target.value }))
                            }
                            placeholder="Write your reply…"
                            className="min-h-[38px]"
                          />
                          <Button
                            size="sm"
                            onClick={async () => {
                              const text = (replyText[n.id] ?? "").trim();
                              if (!text) return;
                              const { error } = await supabase.from("notes").insert({
                                sender_id: me!,
                                recipient_id: n.sender_id,
                                body: text,
                                in_reply_to: n.id,
                              });
                              if (error) {
                                console.error(error);
                                toast.error("Failed to send reply");
                                return;
                              }
                              setReplyText((s) => ({ ...s, [n.id]: "" }));
                              setReplying((s) => ({ ...s, [n.id]: false }));
                              toast.success("Reply sent");
                            }}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Send
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setReplying((s) => ({ ...s, [n.id]: false }))}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* subtle “read” badge */}
                <div
                  className={cn(
                    "mt-2 text-xs",
                    n.read_at ? "text-emerald-600" : "text-muted-foreground"
                  )}
                >
                  {n.read_at
                    ? "Read (will be deleted when you leave this page)"
                    : "Unread"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
