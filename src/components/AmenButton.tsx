import { useState } from "react";
import { amenPrayer } from "@/lib/prayers";
import { Button } from "@/components/ui/button";

export default function AmenButton({ id, count }: { id: string; count: number }) {
  const [local, setLocal] = useState(count);
  const [busy, setBusy] = useState(false);

  const click = async () => {
    if (busy) return;
    setBusy(true);
    setLocal(v => v + 1);
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
