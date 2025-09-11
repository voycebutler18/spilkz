// src/components/prayers/PrayerCard.tsx
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createReply, fetchReplies, deletePrayer } from "@/lib/prayers";
import { supabase } from "@/integrations/supabase/client";

/* ---------- Types ---------- */
type PrayerItem = {
  id: string;
  author: string;
  type: "request" | "testimony" | "quote";
  body: string;
  amen_count: number;   // kept in type but NOT rendered/used
  reply_count: number;
  answered: boolean;
  created_at: string;
};

type ReplyRow = { id: string; author?: string; body: string; created_at: string };

/* ---------- Card ---------- */
export default function PrayerCard({
  item,
  onDeleted,
}: {
  item: PrayerItem;
  onDeleted?: (id: string) => void;
}) {
  const day = format(new Date(item.created_at), "MMM d, yyyy");
  const time = format(new Date(item.created_at), "h:mm a");

  // who am I
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setMe(s?.user?.id ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);
  const isOwner = me === item.author;

  // delete post
  const [deleting, setDeleting] = useState(false);
  const handleDeletePost = async () => {
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
            onClick={handleDeletePost}
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

      <div className="mt-3 text-sm">
        <ReplyListInline
          prayerId={item.id}
          prayerAuthor={item.author}
          initialCount={item.reply_count}
        />
      </div>
    </div>
  );
}

/* ---------- Replies (realtime + delete) ---------- */
function ReplyListInline({
  prayerId,
  prayerAuthor,
  initialCount,
}: {
  prayerId: string;
  prayerAuthor: string;
  initialCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ReplyRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // who am I (for delete perms)
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setMe(s?.user?.id ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const canDeleteReply = (replyAuthor?: string) =>
    !!me && (me === replyAuthor || me === prayerAuthor);

  // authoritative count (kept in sync by realtime)
  const [replyCount, setReplyCount] = useState(initialCount);

  // On mount, get authoritative count (for hard refresh)
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

  // Realtime updates: INSERT/DELETE
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
          const row = payload.new as ReplyRow & { prayer_id: string };
          setReplyCount((c) => c + 1);
          if (open) {
            setList((prev) =>
              prev.some((r) => r.id === row.id)
                ? prev
                : [...prev, { id: row.id, author: row.author, body: row.body, created_at: row.created_at }]
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
          if (open) setList((prev) => prev.filter((r) => r.id !== removedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [prayerId, open]);

  // Load replies when opened
  useEffect(() => {
    if (!open) return;
    fetchReplies(prayerId)
      .then((d) => setList((d as ReplyRow[]) || []))
      .catch(() => {});
  }, [open, prayerId]);

  const post = async () => {
    const t = text.trim();
    if (!t || t.length > 1000 || sending) return;
    setSending(true);
    try {
      // Do not append locally; realtime INSERT will handle it.
      await createReply(prayerId, t);
      setText("");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      post();
    }
  };

  const removeReply = async (replyId: string) => {
    // optimistic remove
    setList((prev) => prev.filter((r) => r.id !== replyId));
    setReplyCount((c) => Math.max(0, c - 1));
    const { error } = await supabase.from("prayer_replies").delete().eq("id", replyId);
    if (error) {
      console.error(error);
      // fallback: refetch
      const d = await fetchReplies(prayerId);
      setList((d as ReplyRow[]) || []);
      // refresh count too
      const { count } = await supabase
        .from("prayer_replies")
        .select("id", { count: "exact", head: true })
        .eq("prayer_id", prayerId);
      if (typeof count === "number") setReplyCount(count);
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
              className="flex items-start gap-2 rounded-md bg-muted/40 p-2 text-sm"
            >
              <div className="whitespace-pre-wrap flex-1">{r.body}</div>
              {canDeleteReply(r.author) && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-red-400 hover:text-red-500"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeReply(r.id);
                  }}
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
            <Button onClick={post} disabled={!text.trim() || text.length > 1000 || sending} type="button">
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>

          {text.length > 1000 && (
            <div className="text-xs text-red-500">Replies must be 1–1000 characters.</div>
          )}
        </div>
      )}
    </div>
  );
}
