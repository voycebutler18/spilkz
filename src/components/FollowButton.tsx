import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FollowButtonProps {
  profileId: string;
  username?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

export function FollowButton({ 
  profileId, 
  username,
  size = "default", 
  variant,
  className 
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    console.log('FollowButton: Initializing for profileId:', profileId);
    checkFollowStatus();

    // Subscribe to real-time updates for follower changes
    const channel = supabase
      .channel(`follow-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'followers',
          filter: `following_id=eq.${profileId}`
        },
        () => {
          checkFollowStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId]);

  const checkFollowStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    console.log('FollowButton: Current user:', user?.id, 'Profile ID:', profileId);
    setCurrentUser(user);
    setIsInitialized(true);
    
    if (!user) {
      setIsFollowing(false);
      setIsOwnProfile(false);
      return;
    }

    // Check if this is the user's own profile
    setIsOwnProfile(user.id === profileId);

    // Don't check follow status for own profile
    if (user.id === profileId) {
      setIsFollowing(false);
      return;
    }

    const { data, error } = await supabase
      .from('followers')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', profileId)
      .maybeSingle();

    setIsFollowing(!!data && !error);
  };

  const handleFollow = async () => {
    if (!currentUser) {
      toast.error('Please sign in to follow creators');
      return;
    }

    // Don't allow following yourself
    if (currentUser.id === profileId) {
      return;
    }

    setLoading(true);

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from('followers')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', profileId);

        if (!error) {
          setIsFollowing(false);
          toast.success(username ? `Unfollowed @${username}` : 'Unfollowed successfully');
        } else {
          toast.error('Failed to unfollow');
        }
      } else {
        const { error } = await supabase
          .from('followers')
          .insert({
            follower_id: currentUser.id,
            following_id: profileId
          });

        if (!error) {
          setIsFollowing(true);
          toast.success(username ? `Following @${username}` : 'Following successfully');
        } else {
          toast.error('Failed to follow');
        }
      }
    } catch (error) {
      console.error('Follow error:', error);
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Don't render until initialized
  if (!isInitialized) {
    return null;
  }

  // Don't show button if user is viewing their own profile
  if (isOwnProfile) {
    console.log('FollowButton: Hiding - own profile');
    return null;
  }

  // Show follow button for non-logged in users
  if (!currentUser) {
    return (
      <Button
        size={size}
        variant={variant || "default"}
        className={className}
        onClick={() => {
          toast.error('Please sign in to follow creators');
        }}
      >
        <UserPlus className={`${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} ${size !== 'sm' ? 'mr-1' : ''}`} />
        {size !== 'sm' ? 'Follow' : ''}
      </Button>
    );
  }

  return (
    <Button
      onClick={handleFollow}
      variant={isFollowing ? "outline" : "default"}
      size={size}
      className={className}
      disabled={loading}
    >
      {loading ? (
        <span className="animate-spin">⏳</span>
      ) : isFollowing ? (
        <>
          <UserMinus className={`${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} ${size !== 'sm' ? 'mr-1' : ''}`} />
          {size !== 'sm' ? 'Following' : ''}
        </>
      ) : (
        <>
          <UserPlus className={`${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} ${size !== 'sm' ? 'mr-1' : ''}`} />
          {size !== 'sm' ? 'Follow' : ''}
        </>
      )}
    </Button>
  );
}

export default FollowButton;