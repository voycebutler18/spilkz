import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { subscribeUnreadCount } from "@/lib/realtimeNotes";

export default function NoteBoxLink() {
  const [uid, setUid] = useState<string | null>(null);
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUid(s?.user?.id ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeUnreadCount(uid, setCount);
    return () => unsub();
  }, [uid]);

  return (
    <Link
      to="/notes"
      className="relative inline-flex items-center gap-2 font-medium hover:opacity-90"
      aria-label={`NoteBox${count ? ` (${count} unread)` : ""}`}
    >
      <span className="i-lucide-mail h-5 w-5" /> {/* or your mail icon */}
      <span>NoteBox</span>
      {count > 0 && (
        <span
          className="ml-1 rounded-full bg-fuchsia-600 px-2 py-0.5 text-xs font-semibold text-white leading-none"
          aria-live="polite"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
