// src/pages/Notes.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";

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
  scheduled_delete_at: string | null;
  in_reply_to: string | null;
  sender_username?: string | null;
  sender_display_name?: string | null;
  sender_avatar_url?: string | null;
};

const DELETE_MS = 30_000; // 30 seconds

export default function NotesPage() {
  const [searchParams] = useSearchParams();

  const [me, setMe] = useState<string | null>(null);

  // composer
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [options, setOptions] = useState<Profile[]>([]);
  const [toUser, setToUser] = useState<Profile | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // inbox
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [inbox, setInbox] = useState<NoteRow[]>([]);
  const [replying, setReplying] = useState<Record<string, boolean>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  // track what we made read in THIS session (for instant delete on refresh)
  const readThisSession = useRef<Set<string>>(new Set());
  const deleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /* ---------- auth ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) {
        console.error(error);
        toast.error("Could not get user");
        return;
      }
      setMe(data.user?.id ?? null);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  /* ---------- preselect from query string ---------- */
  useEffect(() => {
    const to = searchParams.get("to");
    const msg = searchParams.get("msg");
    if (!to) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", to)
        .maybeSingle();
      if (!cancelled && !error && data) {
        setToUser(data as Profile);
        if (msg && !body) setBody(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* ---------- search creators (username OR display_name) ---------- */
  useEffect(() => {
    if (!query.trim()) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      setSearching(true);
      const q = query.trim();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .or(
          `username.ilike.%${q}%,display_name.ilike.%${q}%`
        )
        .limit(10);

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

  /* ---------- send ---------- */
  const handleSend = async () => {
    if (!me) return toast.error("Please sign in to send a note");
    if (!toUser) return toast.error("Choose who you want to send a note to");
    if (!body.trim()) return toast.error("Type a note");
    if (toUser.id === me) return toast.error("You can't send a note to yourself");

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

  /* ---------- delete right now (used on timer & on unload) ---------- */
  const deleteReadNow = useCallback(async () => {
    if (!me) return;
    const ids = Array.from(readThisSession.current);
    if (!ids.length) return;

    try {
      const { error } = await supabase
        .from("notes")
        .delete()
        .in("id", ids)
        .eq("recipient_id", me);

      if (error) {
        console.error("Failed to delete notes:", error);
        return;
      }

      // local cleanup
      readThisSession.current.clear();
      setInbox((prev) => prev.filter((n) => !ids.includes(n.id)));
      toast.success(`Deleted ${ids.length} read note(s)`);
    } catch (e) {
      console.error("Error deleting notes:", e);
    }
  }, [me]);

  /* ---------- inbox: only UNREAD, mark read immediately ---------- */
  const fetchInbox = useCallback(async () => {
    if (!me) return;
    setLoadingInbox(true);

    try {
      // 1) Get UNREAD only (so anything you’ve opened before never shows again on refresh)
      const { data: notesData, error: notesError } = await supabase
        .from("notes")
        .select("*")
        .eq("recipient_id", me)
        .is("read_at", null)
        .order("created_at", { ascending: false });

      if (notesError) throw notesError;

      // 2) Hydrate sender profiles for UI
      const senderIds = [...new Set(notesData?.map((n) => n.sender_id) || [])];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", senderIds);

      const enriched: NoteRow[] = (notesData || []).map((n) => {
        const p = profilesData?.find((x) => x.id === n.sender_id);
        return {
          ...n,
          sender_username: p?.username ?? null,
          sender_display_name: p?.display_name ?? null,
          sender_avatar_url: p?.avatar_url ?? null,
        };
      });

      setInbox(enriched);

      // 3) Mark all shown as READ now, and set scheduled_delete_at = now()+30s
      if (enriched.length) {
        const ids = enriched.map((n) => n.id);
        const now = new Date();
        const deleteAt = new Date(now.getTime() + DELETE_MS);

        const { error: updErr } = await supabase
          .from("notes")
          .update({
            read_at: now.toISOString(),
            scheduled_delete_at: deleteAt.toISOString(),
          })
          .in("id", ids)
          .eq("recipient_id", me);

        if (!updErr) {
          // stash for instant delete on refresh / leave
          readThisSession.current = new Set(ids);

          // also schedule client-side delete at 30s to remove without refresh
          if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
          deleteTimeoutRef.current = setTimeout(() => {
            deleteReadNow();
          }, DELETE_MS);
        }
      }
    } catch (error) {
      console.error("Error fetching inbox:", error);
      toast.error("Failed to load notes");
    } finally {
      setLoadingInbox(false);
    }
  }, [me, deleteReadNow]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  /* ---------- realtime ---------- */
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

  /* ---------- cleanup: refresh / leave tab ---------- */
  useEffect(() => {
    const cleanup = () => {
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
      // Best-effort delete. If it fails, server cron will wipe using scheduled_delete_at.
      deleteReadNow();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cleanup();
    };

    // pagehide fires more reliably than unload in modern browsers
    const onPageHide = () => cleanup();
    const onBeforeUnload = () => cleanup();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      cleanup();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [deleteReadNow]);

  /* ---------- UI helpers ---------- */
  const initial = useCallback((p?: Profile | null, emailFallback?: string | null) => {
    return (p?.display_name?.[0] || p?.username?.[0] || emailFallback?.[0] || "U").toUpperCase();
  }, []);

  const hasInbox = inbox.length > 0;

  const disclaimer = useMemo(
    () => (
      <div className="rounded-md border border-yellow-300/40 bg-yellow-500/10 p-3 text-sm">
        <strong>Heads up:</strong> Notes disappear after you read them. They’ll vanish
        immediately if you refresh/leave, or automatically after ~30 seconds.
      </div>
    ),
    []
  );

  if (!me) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        {disclaimer}
        <div className="mt-6 text-sm">
          Please <a className="underline" href="/login">log in</a> to send and read notes.
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
          Pick a creator and send a short, one-off note. When they read it, we delete it on refresh
          or after ~30 seconds automatically.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,320px)_1fr_auto]">
          <div className="relative">
            <Input
              value={toUser ? (toUser.display_name || toUser.username || "Selected") : query}
              onChange={(e) => {
                setToUser(null);
                setQuery(e.target.value);
              }}
              placeholder="Search name or username…"
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
              Clear read now ({readThisSession.current.size})
            </Button>
          </div>
        </div>

        {loadingInbox ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !hasInbox ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            No notes yet. When someone sends you a note, it'll appear here.
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

                <div className={cn("mt-2 text-xs", "text-emerald-600")}>
                  Read — will disappear on refresh or within ~30s
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
