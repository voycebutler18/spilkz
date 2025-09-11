// src/components/prayers/PrayerCard.tsx
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  amenPrayer,
  createReply,
  fetchReplies,
  deletePrayer,
} from "@/lib/prayers";
import { supabase } from "@/integrations/supabase/client";

export default function PrayerCard({
  item,
  onDeleted,
}: {
  item: {
    id: string;
    author: string;
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
        <ReplyListInline prayerId={item.id} initialCount={item.reply_count} />
      </div>
    </div>
  );
}

/** Inline Reply list */
function ReplyListInline({
  prayerId,
  initialCount
}: {
  prayerId: string;
  initialCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Array<{ id: string; body: string; created_at: string }>>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyCount, setReplyCount] = useState(initialCount);

  useEffect(() => {
    if (!open) return;
    fetchReplies(prayerId).then((d: any) => {
      setList(d || []);
      // Update the count when we fetch replies
      setReplyCount(Math.max(initialCount, (d || []).length));
    }).catch(() => {});
  }, [open, prayerId, initialCount]);

  const post = async () => {
    const t = text.trim();
    if (!t || t.length > 1000 || sending) return;
    setSending(true);
    try {
      const r: any = await createReply(prayerId, t);
      setList((l) => [...l, r]);
      setReplyCount((prev) => prev + 1);
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
            <div key={r.id} className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap">
              {r.body}
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
