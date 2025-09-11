// src/components/prayers/PrayerCard.tsx
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { amenPrayer, createReply, fetchReplies } from "@/lib/prayers";

export default function PrayerCard({
  item
}: {
  item: {
    id: string;
    type: "request" | "testimony" | "quote";
    body: string;
    amen_count: number;
    reply_count: number;
    answered: boolean;
    created_at: string;
  };
}) {
  const day = format(new Date(item.created_at), "MMM d, yyyy");
  const time = format(new Date(item.created_at), "h:mm a");

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

/** Inline Amen button (keeps build from failing on missing file) */
function AmenButtonInline({ id, initialCount }: { id: string; initialCount: number }) {
  const [local, setLocal] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [clicked, setClicked] = useState(false); // prevent double-amen on this session

  const click = async () => {
    if (busy || clicked) return;
    setBusy(true);
    setClicked(true);
    setLocal((v) => v + 1); // optimistic
    try {
      await amenPrayer(id);
    } catch {
      setClicked(false);
      setLocal((v) => v - 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={click}
      disabled={busy || clicked}
      aria-label="Amen"
      title={clicked ? "You already clicked Amen" : "Amen"}
    >
      🙏 <span className="ml-2">{local}</span>
    </Button>
  );
}

/** Inline Reply list (avoids missing import) */
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

  useEffect(() => {
    if (!open) return;
    fetchReplies(prayerId).then((d: any) => setList(d || [])).catch(() => {});
  }, [open, prayerId]);

  const total = useMemo(() => Math.max(initialCount, list.length), [initialCount, list.length]);

  const post = async () => {
    const t = text.trim();
    if (!t || t.length > 1000 || sending) return;
    setSending(true);
    try {
      const r: any = await createReply(prayerId, t);
      setList((l) => [...l, r]);
      setText("");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    // Enter or Cmd/Ctrl+Enter to send
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      post();
    }
  };

  return (
    <div>
      <button
        className="text-muted-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`replies-${prayerId}`}
      >
        💬 {open ? "Hide" : "Replies"} ({total})
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
            <Button onClick={post} disabled={!text.trim() || text.length > 1000 || sending}>
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
