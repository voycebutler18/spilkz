// src/components/CommentsModal.tsx
import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

type Profile = {
  id: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

interface CommentRow {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profile?: Profile | null;
}

interface CommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  splikId: string;
  splikTitle?: string;
  /** Notify parent to adjust the visible count immediately (+1 on insert, -1 on delete) */
  onCountDelta?: (delta: number) => void;
}

const CommentsModal = ({ isOpen, onClose, splikId, onCountDelta }: CommentsModalProps) => {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Accurate count independent of what's rendered
  const [count, setCount] = useState(0);

  // Auth state (avoid “Please log in” flicker)
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; profile?: Profile } | null>(null);

  const { toast } = useToast();

  // De-dup set for realtime/optimistic updates
  const seenIds = useRef<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const buildProfilePath = (p?: Profile | null, fallbackUserId?: string) =>
    p?.username ? `/creator/${p.username}` : `/profile/${p?.id || fallbackUserId}`;

  const displayName = (p?: Profile | null) =>
    p?.display_name || p?.first_name || p?.username || "Unknown User";

  const initials = (p?: Profile | null) =>
    (displayName(p).substring(0, 2) || "UU").toUpperCase();

  // ---- Auth (session) -----------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session?.user) {
        const uid = data.session.user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id,display_name,first_name,last_name,username,avatar_url")
          .eq("id", uid)
          .maybeSingle();
        setCurrentUser({ id: uid, profile: (profile as Profile) || undefined });
      } else {
        setCurrentUser(null);
      }

      setAuthReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        setCurrentUser((prev) => ({
          id: session.user!.id,
          profile: prev?.profile, // keep until we re-fetch
        }));
      } else {
        setCurrentUser(null);
      }
      setAuthReady(true);
    });

    return () => {
      sub?.subscription.unsubscribe();
      cancelled = true;
    };
  }, [isOpen]);

  // ---- Initial load: comments + accurate count ----------------------------
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Comments (newest first for UX)
        const { data: rows, error } = await supabase
          .from("comments")
          .select("id, content, created_at, user_id")
          .eq("splik_id", splikId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const list = rows || [];
        list.forEach((r: any) => seenIds.current.add(r.id)); // mark as seen

        // Count via head request (never over-counts)
        const { count: exact } = await supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("splik_id", splikId);

        if (!cancelled) {
          setCount(exact ?? list.length);

          // Fetch profiles in batch and hydrate
          const ids = Array.from(new Set(list.map((r: any) => r.user_id).filter(Boolean)));
          let profilesById = new Map<string, Profile>();
          if (ids.length > 0) {
            const { data: profs } = await supabase
              .from("profiles")
              .select("id,display_name,first_name,last_name,username,avatar_url")
              .in("id", ids);
            (profs || []).forEach((p: any) => profilesById.set(p.id, p as Profile));
          }

          const hydrated: CommentRow[] = list.map((c: any) => ({
            id: c.id,
            content: c.content,
            created_at: c.created_at,
            user_id: c.user_id,
            profile: profilesById.get(c.user_id) ?? null,
          }));

          setComments(hydrated);
        }
      } catch (e) {
        console.error(e);
        toast({
          title: "Error",
          description: "Failed to load comments",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, splikId, toast]);

  // ---- Realtime (INSERT/DELETE), de-duplicated ----------------------------
  useEffect(() => {
    if (!isOpen) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase
      .channel(`comments-${splikId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "comments", event: "INSERT", filter: `splik_id=eq.${splikId}` },
        async (payload) => {
          const row = payload.new as any;
          if (!row?.id || seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);

          // Fetch profile for the new commenter (small one-off)
          let prof: Profile | null = null;
          const { data: p } = await supabase
            .from("profiles")
            .select("id,display_name,first_name,last_name,username,avatar_url")
            .eq("id", row.user_id)
            .maybeSingle();
          prof = (p as Profile) || null;

          setComments((prev) => [
            { id: row.id, content: row.content, created_at: row.created_at, user_id: row.user_id, profile: prof },
            ...prev,
          ]);
          setCount((c) => c + 1);
          onCountDelta?.(1); // notify parent exactly once
        }
      )
      .on(
        "postgres_changes",
        { schema: "public", table: "comments", event: "DELETE", filter: `splik_id=eq.${splikId}` },
        (payload) => {
          const row = payload.old as any;
          if (!row?.id || seenIds.current.has(`del:${row.id}`)) return;
          seenIds.current.add(`del:${row.id}`);
          setComments((prev) => prev.filter((c) => c.id !== row.id));
          setCount((c) => Math.max(0, c - 1));
          onCountDelta?.(-1); // notify parent exactly once
        }
      )
      .subscribe();

    channelRef.current = ch;

    // Cleanup on close/unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isOpen, splikId, onCountDelta]);

  // ---- Submit --------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .insert({
          splik_id: splikId,
          user_id: currentUser.id,
          content: newComment.trim(),
        })
        .select("id, content, created_at, user_id")
        .single();

      if (error) throw error;

      // Optimistic add (guard against double-add when realtime arrives)
      if (data && !seenIds.current.has(data.id)) {
        seenIds.current.add(data.id);
        setComments((prev) => [
          { ...(data as any), profile: currentUser.profile || null },
          ...prev,
        ]);
        setCount((c) => c + 1);
        onCountDelta?.(1); // instant bump on the card
      }

      setNewComment("");
      toast({ title: "Comment posted!", description: "Your comment has been added" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to post comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Comments</DialogTitle>
          <DialogDescription>
            {count} {count === 1 ? "comment" : "comments"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          <ScrollArea className="flex-1 pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No comments yet.</div>
            ) : (
              <div className="space-y-4">
                {comments.map((c) => {
                  const path = buildProfilePath(c.profile, c.user_id);
                  return (
                    <div key={c.id} className="flex space-x-3">
                      <Link to={path} className="shrink-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={c.profile?.avatar_url || undefined} />
                          <AvatarFallback>{initials(c.profile)}</AvatarFallback>
                        </Avatar>
                      </Link>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center space-x-2">
                          <Link to={path} className="font-semibold text-sm hover:underline">
                            {displayName(c.profile)}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm">{c.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Composer */}
          {!authReady ? (
            <div className="text-center py-4 border-t text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 inline mr-2 animate-spin" />
              Checking session…
            </div>
          ) : currentUser ? (
            <form onSubmit={handleSubmit} className="flex items-center space-x-2 pt-4 border-t">
              <Link to={buildProfilePath(currentUser.profile, currentUser.id)} className="shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={currentUser.profile?.avatar_url || undefined} />
                  <AvatarFallback>{initials(currentUser.profile)}</AvatarFallback>
                </Avatar>
              </Link>

              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                disabled={submitting}
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={!newComment.trim() || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          ) : (
            <div className="text-center py-4 border-t text-muted-foreground text-sm">
              Please log in to comment
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommentsModal;
