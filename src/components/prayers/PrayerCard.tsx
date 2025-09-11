// src/components/prayers/PrayerCard.tsx
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { amenPrayer, createReply, deletePrayer } from "@/lib/prayers";
import { supabase } from "@/integrations/supabase/client";

/* ---------- Card for a single prayer ---------- */
export default function PrayerCard({
  item,
  onDeleted,
}: {
  item: {
    id: string;
    author: string; // prayer owner
    type: "request" | "testimony" | "quote";
    body: string;
    amen_count: number;
    reply_count: number;
    answered: boolean;
    created_at: string;
  };
  onDeleted?: (id: string) => void;
}) {
  const day = format(new Date(item.created_at), "MMM d, yyyy");
  const time = format(new Date(item.created_at), "h:mm a");

  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setMe(s?.user?.id ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);
  const isOwner = me === item.author;

  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    if (!isOwner || deleting) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deletePrayer(item.id);
      onDeleted?.(item.id);
    } catch (e) {
      console.error(e);
      alert("Could not delete.");
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 capitalize">
          {item.type}
        </span>
        {item.answered && (
          <span
            className="inline-flex rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5"
            aria-label="Marked as answered"
            title="Marked as answered"
          >
            Answered
          </span>
        )}
        <span className="text-muted-foreground ml-auto">
          {day} at {time}
        </span>

        {isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 text-red-400 hover:text-red-500"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete post"
            title="Delete post"
            type="button"
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        )}
      </div>

      <Link to={`/prayers/${item.id}`} className="whitespace-pre-wrap leading-7">
        {item.body}
      </Link>

      <div className="mt-3 flex items-center gap-4 text-sm">
        <AmenButtonInline id={item.id} initialCount={item.amen_count} />
        <ReplyListInline
          prayerId={item.id}
          prayerAuthorId={item.author}
          initialCount={item.reply_count}
        />
      </div>
    </div>
  );
}

/* ---------- Amen button – simplified & mobile-safe ---------- */
function AmenButtonInline({
  id,
  initialCount,
}: {
  id: string;
  initialCount: number;
}) {
  const navigate = useNavigate();
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setAuthed(!!s)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const onTap: React.MouseEventHandler<HTMLButtonElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!authed) {
      navigate("/login");
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      const result = await amenPrayer(id);
      if (result.inserted) setCount((prev) => prev + 1);
    } catch {
      alert("Error adding amen. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onTap}
      disabled={busy}
      aria-label="Amen"
      title={!authed ? "Log in to Amen" : busy ? "Processing..." : "Amen"}
      type="button"
      className="relative z-10 select-none touch-manipulation min-h-[36px] min-w-[64px]"
    >
      🙏 <span className="ml-2">{count}</span>
    </Button>
  );
}

/* ---------- Replies with realtime count & owner/author delete ---------- */
function ReplyListInline({
  prayerId,
  prayerAuthorId,
  initialCount,
}: {
  prayerId: string;
  prayerAuthorId: string; // the prayer owner can delete any reply
  initialCount: number;
}) {
  type ReplyRow = { id: string; body: string; created_at: string; author: string };

  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ReplyRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // current user
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setMe(s?.user?.id ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // authoratitive count shown beside "Replies"
  const [replyCount, setReplyCount] = useState(initialCount);

  // fetch authoritative count on mount (so refresh shows correct value)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from("prayer_replies")
        .select("id", { count: "exact", head: true })
        .eq("prayer_id", prayerId);

      if (!cancelled && !error && typeof count === "number") {
        setReplyCount(count);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prayerId]);

  // realtime: INSERT/DELETE on prayer_replies for this prayer
  useEffect(() => {
    const channel = supabase
      .channel(`replies-${prayerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "prayer_replies",
          filter: `prayer_id=eq.${prayerId}`,
        },
        (payload) => {
          const row = payload.new as ReplyRow;
          setReplyCount((c) => c + 1);
          if (open) {
            setList((prev) =>
              prev.some((r) => r.id === row.id) ? prev : [...prev, row]
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "prayer_replies",
          filter: `prayer_id=eq.${prayerId}`,
        },
        (payload) => {
          const removedId = (payload.old as any).id as string;
          setReplyCount((c) => Math.max(0, c - 1));
          if (open) {
            setList((prev) => prev.filter((r) => r.id !== removedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [prayerId, open]);

  // when opening, fetch the list once (include author to decide delete visibility)
  useEffect(() => {
    if (!open) return;
    supabase
      .from("prayer_replies")
      .select("id, body, created_at, author")
      .eq("prayer_id", prayerId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!error) setList((data as ReplyRow[]) || []);
      });
  }, [open, prayerId]);

  const post = async () => {
    const t = text.trim();
    if (!t || t.length > 1000 || sending) return;
    setSending(true);
    try {
      // do not append locally; realtime INSERT will add it & bump count
      await createReply(prayerId, t);
      setText("");
    } finally {
      setSending(false);
    }
  };

  const canDeleteReply = (replyAuthorId: string) =>
    !!me && (me === replyAuthorId || me === prayerAuthorId);

  const deleteReply = async (replyId: string) => {
    if (!window.confirm("Delete this reply?")) return;
    // optimistic UI: remove immediately; realtime will also fire a DELETE
    setList((prev) => prev.filter((r) => r.id !== replyId));
    try {
      await supabase.from("prayer_replies").delete().eq("id", replyId);
    } catch (e) {
      console.error(e);
      // fallback: refetch if something goes wrong
      const { data } = await supabase
        .from("prayer_replies")
        .select("id, body, created_at, author")
        .eq("prayer_id", prayerId)
        .order("created_at", { ascending: true });
      setList((data as ReplyRow[]) || []);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      post();
    }
  };

  return (
    <div>
      <button
        className="text-muted-foreground"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls={`replies-${prayerId}`}
      >
        💬 {open ? "Hide" : "Replies"} ({replyCount})
      </button>

      {open && (
        <div id={`replies-${prayerId}`} className="mt-2 space-y-2">
          {list.map((r) => (
            <div
              key={r.id}
              className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap flex items-start gap-2"
            >
              <div className="flex-1">{r.body}</div>
              {canDeleteReply(r.author) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-500"
                  onClick={() => deleteReply(r.id)}
                >
                  Delete
                </Button>
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Write a reply…"
              aria-label="Write a reply"
              disabled={sending}
            />
            <Button
              onClick={post}
              disabled={!text.trim() || text.length > 1000 || sending}
              type="button"
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>

          {text.length > 1000 && (
            <div className="text-xs text-red-500">
              Replies must be 1–1000 characters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
