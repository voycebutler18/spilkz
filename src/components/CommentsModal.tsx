// src/components/CommentsModal.tsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
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

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profile?: {
    display_name?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
    avatar_url?: string;
  };
}

interface CommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  splikId: string;
  splikTitle?: string;
}

const CommentsModal = ({ isOpen, onClose, splikId, splikTitle = "Splik" }: CommentsModalProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchComments();
      getOrCreateCurrentUserProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, splikId]);

  // Ensure *current* user has a profile row (nice safety for legacy users)
  const getOrCreateCurrentUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Try to load a profile
    let { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    // If none exists (older accounts), create a minimal one
    if (!profile) {
      const base =
        (user.user_metadata as any)?.username ||
        user.email?.split("@")[0] ||
        "user";
      const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "user";
      const candidate = `${clean}${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}`;

      const { data: created } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          username: candidate,
          display_name:
            (user.user_metadata as any)?.full_name || candidate,
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      profile = created ?? null;
    }

    setCurrentUser({ ...user, profile });
  };

  const fetchComments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("splik_id", splikId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Attach each commenter's profile (if some are missing, links still work via /profile/:id)
      const commentsWithProfiles = await Promise.all(
        (data || []).map(async (comment) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", comment.user_id)
            .maybeSingle();
          return { ...comment, profile: profile || undefined };
        })
      );

      setComments(commentsWithProfiles);
    } catch (error: any) {
      console.error("Error fetching comments:", error);
      toast({
        title: "Error",
        description: "Failed to load comments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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

      const newCommentWithProfile: Comment = {
        ...data,
        profile: currentUser.profile,
      };

      setComments([newCommentWithProfile, ...comments]);
      setNewComment("");

      toast({
        title: "Comment posted!",
        description: "Your comment has been added",
      });
    } catch (error: any) {
      console.error("Error posting comment:", error);
      toast({
        title: "Error",
        description: "Failed to post comment",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getDisplayName = (profile: any) => {
    if (!profile) return "Unknown User";
    return profile.display_name || profile.first_name || profile.username || "Unknown User";
  };

  const getInitials = (profile: any) => {
    const name = getDisplayName(profile);
    return name.substring(0, 2).toUpperCase();
  };

  // Best route for a commenter: /creator/:username if present, otherwise /profile/:id
  const profileHref = (c: Comment) => {
    if (c.profile?.username) return `/creator/${c.profile.username}`;
    return `/profile/${c.user_id}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Comments</DialogTitle>
          <DialogDescription>
            {comments.length} {comments.length === 1 ? "comment" : "comments"} on this splik
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          <ScrollArea className="flex-1 pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No comments yet. Be the first to comment!
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex space-x-3">
                    {/* Clickable avatar */}
                    <Link
                      to={profileHref(comment)}
                      onClick={onClose}
                      className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                      aria-label={`Go to ${getDisplayName(comment.profile)}'s profile`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={comment.profile?.avatar_url} />
                        <AvatarFallback>{getInitials(comment.profile)}</AvatarFallback>
                      </Avatar>
                    </Link>

                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        {/* Clickable name */}
                        <Link
                          to={profileHref(comment)}
                          onClick={onClose}
                          className="font-semibold text-sm hover:underline truncate"
                        >
                          {getDisplayName(comment.profile)}
                        </Link>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm break-words">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {currentUser ? (
            <form onSubmit={handleSubmit} className="flex items-center space-x-2 pt-4 border-t">
              <Avatar className="h-8 w-8">
                <AvatarImage src={currentUser.profile?.avatar_url} />
                <AvatarFallback>{getInitials(currentUser.profile)}</AvatarFallback>
              </Avatar>
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
