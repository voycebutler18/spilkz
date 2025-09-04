import { useState, useEffect } from "react";
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
}

const CommentsModal = ({ isOpen, onClose, splikId }: CommentsModalProps) => {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; profile?: Profile } | null>(null);
  const { toast } = useToast();

  const buildProfilePath = (p?: Profile | null, fallbackUserId?: string) => {
    if (p?.username) return `/creator/${p.username}`;
    return `/profile/${p?.id || fallbackUserId}`;
  };

  const displayName = (p?: Profile | null) =>
    p?.display_name || p?.first_name || p?.username || "Unknown User";

  const initials = (p?: Profile | null) =>
    (displayName(p).substring(0, 2) || "UU").toUpperCase();

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id,display_name,first_name,last_name,username,avatar_url")
          .eq("id", auth.user.id)
          .maybeSingle();
        setCurrentUser({ id: auth.user.id, profile: (profile as Profile) || undefined });
      }
    })();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      try {
        const { data: rows, error } = await supabase
          .from("comments")
          .select("*")
          .eq("splik_id", splikId)
          .order("created_at", { ascending: false });
        if (error) throw error;

        const hydrated: CommentRow[] = await Promise.all(
          (rows || []).map(async (c) => {
            const { data: p } = await supabase
              .from("profiles")
              .select("id,display_name,first_name,last_name,username,avatar_url")
              .eq("id", c.user_id)
              .maybeSingle();
            return { ...c, profile: (p as Profile) || null };
          })
        );

        setComments(hydrated);
      } catch (e) {
        console.error(e);
        toast({ title: "Error", description: "Failed to load comments", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, splikId, toast]);

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
        .select()
        .single();
      if (error) throw error;

      setComments((prev) => [
        { ...(data as any), profile: currentUser.profile || null },
        ...prev,
      ]);
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
            {comments.length} {comments.length === 1 ? "comment" : "comments"}
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
                      {/* Avatar (clickable) */}
                      <Link to={path} className="shrink-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={c.profile?.avatar_url || undefined} />
                          <AvatarFallback>{initials(c.profile)}</AvatarFallback>
                        </Avatar>
                      </Link>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center space-x-2">
                          {/* Display name (clickable) */}
                          <Link
                            to={path}
                            className="font-semibold text-sm hover:underline"
                          >
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

          {/* Input row */}
          {currentUser ? (
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
