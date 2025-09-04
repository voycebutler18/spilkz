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
      getCurrentUser();
    }
  }, [isOpen, splikId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setCurrentUser({ ...user, profile });
    }
  };

  const fetchComments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('splik_id', splikId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles for each comment
      const commentsWithProfiles = await Promise.all(
        (data || []).map(async (comment) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', comment.user_id)
            .single();
          
          return {
            ...comment,
            profile
          };
        })
      );

      setComments(commentsWithProfiles);
    } catch (error: any) {
      console.error('Error fetching comments:', error);
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
        .from('comments')
        .insert({
          splik_id: splikId,
          user_id: currentUser.id,
          content: newComment.trim()
        })
        .select()
        .single();

      if (error) throw error;

      // Add the new comment with profile to the list
      const newCommentWithProfile = {
        ...data,
        profile: currentUser.profile
      };

      setComments([newCommentWithProfile, ...comments]);
      setNewComment("");
      
      toast({
        title: "Comment posted!",
        description: "Your comment has been added",
      });
    } catch (error: any) {
      console.error('Error posting comment:', error);
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
    return profile.display_name || 
           profile.first_name || 
           profile.username || 
           "Unknown User";
  };

  const getInitials = (profile: any) => {
    const name = getDisplayName(profile);
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Comments</DialogTitle>
          <DialogDescription>
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'} on this splik
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          {/* Comments list */}
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
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={comment.profile?.avatar_url} />
                      <AvatarFallback>{getInitials(comment.profile)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm">
                          {getDisplayName(comment.profile)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Comment input */}
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
              <Button
                type="submit"
                size="icon"
                disabled={!newComment.trim() || submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
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