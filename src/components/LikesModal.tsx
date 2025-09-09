import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  avatar_url?: string | null;
};

type LikeRow = {
  id: string;
  user_id: string;
  created_at: string;
  profile?: Profile | null;
};

interface LikesModalProps {
  isOpen: boolean;
  onClose: () => void;
  splikId: string;
  /** Optional: let parent update visible count immediately */
  onCountDelta?: (delta: number) => void;
}

const nameOf = (p?: Profile | null) =>
  p?.display_name || p?.first_name || p?.username || "User";

const initials = (p?: Profile | null) =>
  (nameOf(p).slice(0, 2) || "UU").toUpperCase();

const profilePath = (p?: Profile | null, fallbackId?: string) =>
  p?.username ? `/creator/${p.username}` : `/profile/${p?.id || fallbackId}`;

export default function LikesModal({ isOpen, onClose, splikId, onCountDelta }: LikesModalProps) {
  const [loading, setLoading] = useState(false);
  const [likes, setLikes] = useState<LikeRow[]>([]);
  const [count, setCount] = useState(0);

  const seen = useRef<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // initial load
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data: rows, error } = await supabase
          .from("likes")
          .select("id, user_id, created_at")
          .eq("splik_id", splikId)
          .order("created_at", { ascending: false });
        if (error) throw error;

        rows?.forEach((r) => seen.current.add(r.id));

        // accurate count
        const { count: exact } = await supabase
          .from("likes")
          .select("id", { head: true, count: "exact" })
          .eq("splik_id", splikId);

        if (cancelled) return;

        setCount(exact ?? rows?.length ?? 0);

        // hydrate profiles
        const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
        const profilesById = new Map<string, Profile>();
        if (ids.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, username, display_name, first_name, avatar_url")
            .in("id", ids);
          (profs ?? []).forEach((p: any) => profilesById.set(p.id, p));
        }

        const list: LikeRow[] =
          rows?.map((r) => ({ ...r, profile: profilesById.get(r.user_id) ?? null })) ?? [];
        setLikes(list);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, splikId]);

  // realtime
  useEffect(() => {
    if (!isOpen) return;

    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const ch = supabase
      .channel(`likes-${splikId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "likes", event: "INSERT", filter: `splik_id=eq.${splikId}` },
        async (payload) => {
          const row = payload.new as any;
          if (seen.current.has(row.id)) return;
          seen.current.add(row.id);

          // fetch profile (small one-off)
          let prof: Profile | null = null;
          const { data: p } = await supabase
            .from("profiles")
            .select("id, username, display_name, first_name, avatar_url")
            .eq("id", row.user_id)
            .maybeSingle();
          prof = (p as Profile) || null;

          setLikes((prev) => [{ ...row, profile: prof }, ...prev]);
          setCount((c) => c + 1);
          onCountDelta?.(1);
        }
      )
      .on(
        "postgres_changes",
        { schema: "public", table: "likes", event: "DELETE", filter: `splik_id=eq.${splikId}` },
        (payload) => {
          const row = payload.old as any;
          if (seen.current.has(`del:${row.id}`)) return;
          seen.current.add(`del:${row.id}`);
          setLikes((prev) => prev.filter((l) => l.id !== row.id));
          setCount((c) => Math.max(0, c - 1));
          onCountDelta?.(-1);
        }
      )
      .subscribe();

    channelRef.current = ch;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [isOpen, splikId, onCountDelta]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Likes</DialogTitle>
        </DialogHeader>

        <div className="px-1 text-sm text-muted-foreground mb-2">{count} total</div>

        <ScrollArea className="flex-1 pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : likes.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No likes yet</div>
          ) : (
            <div className="space-y-3">
              {likes.map((l) => {
                const to = profilePath(l.profile, l.user_id);
                return (
                  <Link key={l.id} to={to} className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={l.profile?.avatar_url || undefined} />
                      <AvatarFallback>{initials(l.profile)}</AvatarFallback>
                    </Avatar>
                    <div className="font-medium">{nameOf(l.profile)}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
