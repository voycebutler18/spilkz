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
import { Send, Trash2, ChevronDown, ChevronRight } from "lucide-react";

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

  sender_username?: string | null;
  sender_display_name?: string | null;
  sender_avatar_url?: string | null;
};

const DELETE_MS = 15_000; // 15s after you open a note

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
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, NodeJS.Timeout>>({});

  const [replying, setReplying] = useState<Record<string, boolean>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  /* ---------------- auth ---------------- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setMe(s?.user?.id ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  /* -------- preselect recipient from URL -------- */
  useEffect(() => {
    const to = searchParams.get("to");
    const msg = searchParams.get("msg");
    if (!to) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", to)
        .maybeSingle();
      if (!cancelled && data) {
        setToUser(data as Profile);
        if (msg && !body) setBody(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* -------- search creators -------- */
  useEffect(() => {
    const raw = query.trim();
    if (!raw || toUser) {
      setOptions([]);
      return;
    }
    const term = raw.replace(/^@/, "");
    const pattern = `%${term}%`;
    let cancelled = false;

    const run = async () => {
      setSearching(true);
      const [byUser, byName] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .ilike("username", pattern)
          .limit(25),
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .ilike("display_name", pattern)
          .limit(25),
      ]);
      if (cancelled) return;
      const a: Profile[] = (byUser.data as any) ?? [];
      const seen = new Set(a.map((r) => r.id));
      const merged: Profile[] = [
        ...a,
        ...(((byName.data as any) ?? []).filter((r: Profile) => !seen.has(r.id))),
      ];
      // rank
      merged.sort((x, y) => {
        const xu = (x.username || "").toLowerCase();
        const yu = (y.username || "").toLowerCase();
        const xd = (x.display_name || "").toLowerCase();
        const yd = (y.display_name || "").toLowerCase();
        const t = term.toLowerCase();
        const rank = (s: string) => (s.startsWith(t) ? 0 : 1);
        const rx = Math.min(rank(xu), rank(xd));
        const ry = Math.min(rank(yu), rank(yd));
        return rx !== ry ? rx - ry : (xd || xu).localeCompare(yd || yu);
      });
      setOptions(merged.slice(0, 25));
      setSearching(false);
    };
    const t = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, toUser]);

  /* ---------------- send ---------------- */
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

  /* ---------------- fetch inbox (no auto-read) ---------------- */
  const fetchInbox = useCallback(async () => {
    if (!me) return;
    setLoadingInbox(true);
    try {
      const { data: notesData, error } = await supabase
        .from("notes")
        .select("*")
        .eq("recipient_id", me)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const senderIds = [...new Set(notesData?.map((n) => n.sender_id) || [])];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", senderIds);

      const enriched: NoteRow[] = (notesData || []).map((n) => {
        const p = profilesData?.find((pp) => pp.id === n.sender_id);
        return {
          ...n,
          sender_username: p?.username,
          sender_display_name: p?.display_name,
          sender_avatar_url: p?.avatar_url,
        };
      });

      setInbox(enriched);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load notes");
    } finally {
      setLoadingInbox(false);
    }
  }, [me]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  /* ---------------- realtime: new notes for me ---------------- */
  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel("notes-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notes", filter: `recipient_id=eq.${me}` },
        fetchInbox
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [me, fetchInbox]);

  /* ---------------- per-note open -> mark read + schedule delete ---------------- */
  const openNote = async (id: string) => {
    setOpenMap((m) => ({ ...m, [id]: !m[id] }));
    // if it was unread, mark now and start timer
    const n = inbox.find((x) => x.id === id);
    if (n && !n.read_at) {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("notes")
        .update({ read_at: now })
        .eq("id", id)
        .eq("recipient_id", me!);
      if (!error) {
        setInbox((prev) => prev.map((x) => (x.id === id ? { ...x, read_at: now } : x)));
        if (timers.current[id]) clearTimeout(timers.current[id]);
        timers.current[id] = setTimeout(async () => {
          try {
            await supabase.from("notes").delete().eq("id", id).eq("recipient_id", me!);
            setInbox((prev) => prev.filter((x) => x.id !== id));
          } catch {}
        }, DELETE_MS);
      }
    }
  };

  /* ---------------- manual clear of any read (active timers) ---------------- */
  const clearReadNow = async () => {
    const ids = inbox.filter((n) => n.read_at).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from("notes").delete().in("id", ids).eq("recipient_id", me!);
    ids.forEach((id) => {
      if (timers.current[id]) clearTimeout(timers.current[id]);
    });
    setInbox((prev) => prev.filter((n) => !ids.includes(n.id)));
    toast.success(`Deleted ${ids.length} read note(s)`);
  };

  /* ---------------- cleanup ---------------- */
  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  /* ---------------- UI helpers ---------------- */
  const initial = useCallback(
    (p?: Profile | null, emailFallback?: string | null) =>
      (p?.display_name?.[0] || p?.username?.[0] || emailFallback?.[0] || "U").toUpperCase(),
    []
  );

  const seconds = DELETE_MS / 1000;

  const disclaimer = useMemo(
    () => (
      <div className="rounded-md border border-yellow-300/40 bg-yellow-500/10 p-3 text-sm">
        <strong>Heads up:</strong> Notes disappear after you open them. Each open
        note auto-deletes in {seconds} seconds, or sooner if you click “Clear read now”.
      </div>
    ),
    [seconds]
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
      {/* Composer (unchanged) */}
      <div>
        <h1 className="text-xl font-semibold">Send a Note</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a creator and send a short, one-off note.
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
            <Button variant="destructive" size="sm" onClick={clearReadNow}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear read now
            </Button>
          </div>
        </div>

        {loadingInbox ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : inbox.length === 0 ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            No notes yet. When someone sends you a note, it’ll appear here.
          </div>
        ) : (
          <ul className="space-y-3">
            {inbox.map((n) => {
              const isOpen = !!openMap[n.id];
              return (
                <li key={n.id} className="rounded-md border p-3">
                  <button
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() => openNote(n.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="mt-1">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                    <Avatar className="h-9 w-9">
                      {n.sender_avatar_url ? <AvatarImage src={n.sender_avatar_url} /> : null}
                      <AvatarFallback>
                        {(n.sender_display_name || n.sender_username || "U")[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {n.sender_display_name || n.sender_username || "User"}
                        </span>
                        {n.sender_username ? (
                          <span className="text-xs text-muted-foreground">@{n.sender_username}</span>
                        ) : null}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      </div>

                      <div
                        className={cn(
                          "mt-1 text-sm",
                          n.read_at ? "text-foreground" : "font-medium"
                        )}
                      >
                        {isOpen ? n.body : (n.body.length > 80 ? n.body.slice(0, 80) + "…" : n.body)}
                      </div>

                      <div className="mt-1 text-xs">
                        {n.read_at
                          ? `Read • will delete in ${seconds}s`
                          : "Unread – click to open"}
                      </div>
                    </div>
                  </button>

                  {/* reply editor only when open */}
                  {isOpen && (
                    <div className="mt-3 ml-6 flex items-center gap-2">
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
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
