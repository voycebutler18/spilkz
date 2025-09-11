import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createReply, fetchReplies } from "@/lib/prayers";

export default function ReplyList({ prayerId, initialCount }: { prayerId: string; initialCount: number }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) return;
    fetchReplies(prayerId).then(setList).catch(()=>{});
  }, [open, prayerId]);

  const post = async () => {
    const t = text.trim();
    if (!t) return;
    const r = await createReply(prayerId, t);
    setList(l => [...l, r]);
    setText("");
  };

  const total = Math.max(initialCount, list.length);

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
