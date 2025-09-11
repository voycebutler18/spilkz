// src/components/prayers/PrayerCard.tsx
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useEffect, useState } from "react";
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
          <span className="inline-flex rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
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

  const click = async () => {
    if (busy) return;
    setBusy(true);
    setLocal(v => v + 1); // optimistic
    try { await amenPrayer(id); }
    catch { setLocal(v => v - 1); }
    finally { setBusy(false); }
  };

  return (
    <Button variant="ghost" size="sm" onClick={click} disabled={busy}>
      🙏 <span className="ml-2">{local}</span>
    </Button>
  );
}

/** Inline Reply list (avoids missing import) */
function ReplyListInline({ prayerId, initialCount }: { prayerId: string; initialCount: number }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Array<{id:string; body:string; created_at:string}>>([]);
  const [text, setText] = useState("");
  const total = Math.max(initialCount, list.length);

  useEffect(() => {
    if (!open) return;
    fetchReplies(prayerId).then((d:any) => setList(d || [])).catch(()=>{});
  }, [open, prayerId]);

  const post = async () => {
    const t = text.trim();
    if (!t) return;
    const r:any = await createReply(prayerId, t);
    setList(l => [...l, r]);
    setText("");
  };

  return (
    <div>
      <button className="text-muted-foreground" onClick={()=>setOpen(v=>!v)}>
        💬 {open ? "Hide" : "Replies"} ({total})
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {list.map(r => (
            <div key={r.id} className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap">
              {r.body}
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={text} onChange={(e)=>setText(e.target.value)} placeholder="Write a reply…" />
            <Button onClick={post} disabled={!text.trim()}>Send</Button>
          </div>
        </div>
      )}
    </div>
  );
}
