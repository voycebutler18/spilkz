// src/components/NoteBoxLink.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchUnreadNotesCount } from "@/lib/realtimeNotes";

export default function NoteBoxLink() {
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

  // initial count + update hooks
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

    // initial
    refresh();

    // realtime: from RealtimeNotesBridge
    const onNew = (ev: Event) => {
      const anyEv = ev as CustomEvent;
      const note = anyEv.detail as { recipient_id: string };
      if (note?.recipient_id === me) {
        setCount((x) => x + 1);
      }
    };
    window.addEventListener("notes:new", onNew);

    // allow pages (e.g., Notes.tsx) to trigger a recount after reads/deletes
    const onInboxChanged = () => refresh();
    window.addEventListener("notes:inboxChanged", onInboxChanged);

    // safety: periodic recount (covers deletes from other tabs)
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
      to="/notes"
      className="relative inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent"
      title="Open Notes"
    >
      <span>Notes</span>
      {count > 0 && (
        <span className="ml-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
