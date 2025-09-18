// src/components/NoteBoxLink.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchUnreadNotesCount } from "@/lib/realtimeNotes";
import { Mail } from "lucide-react";

type Props = {
  to?: string;           // route to open your NoteBox page
  label?: string;        // text label next to the icon
  className?: string;    // optional styling override
};

export default function NoteBoxLink({ to = "/notes", label = "NoteBox", className }: Props) {
  const [me, setMe] = useState<string | null>(null);
  const [count, setCount] = useState<number>(0);

  // who am I
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setMe(s?.user?.id ?? null)
    );
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // initial count + updates
  useEffect(() => {
    if (!me) return;

    let active = true;

    const refresh = async () => {
      try {
        const c = await fetchUnreadNotesCount(me);
        if (active) setCount(c);
      } catch (e) {
        console.error("NoteBoxLink: unread count error", e);
      }
    };

    // Initial fetch
    refresh();

    // Increment on live inserts (from RealtimeNotesBridge)
    const onNew = (ev: Event) => {
      const anyEv = ev as CustomEvent;
      const note = anyEv.detail as { recipient_id: string };
      if (note?.recipient_id === me) setCount((x) => x + 1);
    };
    window.addEventListener("notes:new", onNew);

    // Recount when inbox is changed by read/delete actions inside NoteBox page
    const onInboxChanged = () => refresh();
    window.addEventListener("notes:inboxChanged", onInboxChanged);

    // Periodic safety recount (other tabs)
    const interval = setInterval(refresh, 30000);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("notes:new", onNew);
      window.removeEventListener("notes:inboxChanged", onInboxChanged);
    };
  }, [me]);

  return (
    <Link
      to={to}
      className={
        className ??
        "relative inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent"
      }
      title="Open NoteBox"
    >
      <Mail className="h-5 w-5" />
      <span className="font-medium">{label}</span>
      {count > 0 && (
        <span className="ml-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
