import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { MoreVertical, Trash2, MessageCircle, Clock, User } from "lucide-react";
import { toast } from "sonner";

type Row = {
  thread_key: string;
  last_message_id: string;
  sender_id: string;
  recipient_id: string;
  last_body: string;
  last_created_at: string;
};

type ProfileLite = { 
  id: string; 
  display_name: string | null; 
  username: string | null; 
  avatar_url: string | null; 
};

export default function MessagesInbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<{ otherId: string; otherName: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const refreshUnread = async (myId: string, others: string[]) => {
    if (!others.length) return setUnreadIds(new Set());
    const { data, error } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("recipient_id", myId)
      .is("read_at", null)
      .in("sender_id", others);
    if (!error) setUnreadIds(new Set((data || []).map(d => d.sender_id)));
  };

  const loadConversations = async () => {
    if (!me) return;
    
    const { data, error } = await supabase
      .from("latest_dm_threads")
      .select("*")
      .order("last_created_at", { ascending: false });
    
    if (error) {
      toast.error("Failed to load conversations");
      return;
    }
    
    const mine = (data || []).filter((r: Row) => r.sender_id === me || r.recipient_id === me);
    setRows(mine);

    const ids = Array.from(new Set(mine.map(r => r.sender_id === me ? r.recipient_id : r.sender_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", ids);
      const map: Record<string, ProfileLite> = {};
      (profs || []).forEach(p => map[p.id] = p);
      setProfiles(map);
      refreshUnread(me, ids);
    }
  };

  const deleteConversation = async (otherId: string) => {
    if (!me || !otherId) return;
    
    setIsDeleting(true);
    try {
      // Delete messages where I'm the sender and they're the recipient
      const { error: error1 } = await supabase
        .from("messages")
        .delete()
        .eq("sender_id", me)
        .eq("recipient_id", otherId);
      
      if (error1) throw error1;
      
      // Delete messages where they're the sender and I'm the recipient  
      const { error: error2 } = await supabase
        .from("messages")
        .delete()
        .eq("sender_id", otherId)
        .eq("recipient_id", me);
      
      if (error2) throw error2;
      
      toast.success("Conversation deleted successfully");
      
      // Remove the conversation from local state immediately
      setRows(prevRows => prevRows.filter(r => {
        const otherUserId = r.sender_id === me ? r.recipient_id : r.sender_id;
        return otherUserId !== otherId;
      }));
      
      // Remove from profiles
      setProfiles(prev => {
        const newProfiles = { ...prev };
        delete newProfiles[otherId];
        return newProfiles;
      });
      
      // Remove from unread
      setUnreadIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(otherId);
        return newSet;
      });
      
    } catch (error) {
      console.error("Error deleting conversation:", error);
      toast.error("Failed to delete conversation");
      // Refresh the list in case of error to get correct state
      await loadConversations();
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInHours * 60);
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 48) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString();
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  useEffect(() => {
    if (me) loadConversations();

    if (!me) return;
    const channel = supabase
      .channel(`inbox-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" },
        () => {
          const others = Object.keys(profiles);
          if (others.length) refreshUnread(me, others);
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [me]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-primary/10">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              Messages
            </h1>
          </div>
          <p className="text-muted-foreground">
            Stay connected with your conversations
          </p>
        </div>

        {/* Conversations List */}
        <div className="space-y-4">
          {rows.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-muted/50">
                  <MessageCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-2">No conversations yet</h3>
                  <p className="text-muted-foreground">
                    Start a conversation to see it here
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            rows.map(r => {
              const otherId = r.sender_id === me ? r.recipient_id : r.sender_id;
              const other = profiles[otherId];
              const hasUnread = unreadIds.has(otherId);
              const displayName = other?.display_name || other?.username || "User";
              
              return (
                <Card key={r.thread_key} className={`group hover:shadow-md transition-all duration-200 border ${hasUnread ? 'border-primary/20 bg-primary/5' : 'hover:border-primary/20'}`}>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <Link 
                        to={`/messages/${otherId}`} 
                        className="flex items-center gap-4 flex-1 min-w-0"
                      >
                        <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                          <AvatarImage src={other?.avatar_url || undefined} />
                          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-medium">
                            {getInitials(displayName)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className={`font-semibold truncate ${hasUnread ? 'text-primary' : ''}`}>
                              {displayName}
                            </h3>
                            {hasUnread && (
                              <Badge variant="default" className="h-2 w-2 p-0 rounded-full" />
                            )}
                          </div>
                          <p className={`text-sm truncate ${hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                            {r.last_body}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(r.last_created_at)}
                            </span>
                          </div>
                        </div>
                      </Link>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setConversationToDelete({ otherId, otherName: displayName });
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete conversation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your conversation with{' '}
              <span className="font-medium">{conversationToDelete?.otherName}</span>?
              This action cannot be undone and all messages will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => conversationToDelete && deleteConversation(conversationToDelete.otherId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
}
