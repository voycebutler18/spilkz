import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import FollowButton from "@/components/FollowButton";

interface FollowersListProps {
  profileId: string;
  isOpen: boolean;
  onClose: () => void;
  type: 'followers' | 'following';
  count: number;
  isPrivate?: boolean;
  isOwnProfile?: boolean;
}

interface User {
  id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
}

export function FollowersList({ 
  profileId, 
  isOpen, 
  onClose, 
  type, 
  count,
  isPrivate = false,
  isOwnProfile = false
}: FollowersListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (isOpen && profileId) {
      fetchUsers();
    }
  }, [isOpen, profileId, type]);

  const fetchUsers = async () => {
    // If private and not own profile, don't fetch
    if (isPrivate && !isOwnProfile) {
      setUsers([]);
      return;
    }

    setLoading(true);
    try {
      const functionName = type === 'followers' ? 'get_user_followers' : 'get_user_following';
      const { data, error } = await supabase.rpc(functionName, { profile_id: profileId });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error(`Error fetching ${type}:`, error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const title = type === 'followers' 
    ? `Followers${isPrivate && !isOwnProfile ? ' (Private)' : ''} (${count})`
    : `Following${isPrivate && !isOwnProfile ? ' (Private)' : ''} (${count})`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isPrivate && !isOwnProfile ? (
            <div className="text-center py-8 text-muted-foreground">
              This list is private
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No {type} yet
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between">
                  <Link 
                    to={`/creator/${user.username || user.id}`}
                    className="flex items-center gap-3 flex-1 hover:bg-accent rounded-lg p-2 transition-colors"
                    onClick={onClose}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url} />
                      <AvatarFallback>
                        {user.display_name?.[0] || user.username?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {user.display_name || user.username || 'Unknown'}
                      </p>
                      {user.username && (
                        <p className="text-xs text-muted-foreground">@{user.username}</p>
                      )}
                    </div>
                  </Link>
                  {currentUserId && currentUserId !== user.id && (
                    <FollowButton
                      profileId={user.id}
                      username={user.username}
                      size="sm"
                      variant="outline"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default FollowersList;