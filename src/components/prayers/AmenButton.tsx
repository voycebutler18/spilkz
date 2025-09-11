import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { amenPrayer } from "@/lib/prayers";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function AmenButton({ id, count }: { id: string; count: number }) {
  const navigate = useNavigate();
  const [local, setLocal] = useState(count);
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setAuthed(!!s)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const click = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!authed) {
      navigate("/login");
      return;
    }

    if (busy) return;
    setBusy(true);

    try {
      console.log("Attempting to amen prayer:", id);
      const result = await amenPrayer(id);
      console.log("Amen result:", result);
      
      if (result.inserted) {
        setLocal(v => v + 1);
        console.log("Amen successful, count incremented");
      } else {
        console.log("Already amened or duplicate");
      }
    } catch (err) {
      console.error("Error amening prayer:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={click} 
      disabled={busy}
      title={!authed ? "Log in to Amen" : busy ? "Processing..." : "Amen"}
      className="relative z-10 select-none touch-manipulation min-h-[36px] min-w-[64px]"
      type="button"
    >
      🙏 <span className="ml-2">{local}</span>
    </Button>
  );
}
