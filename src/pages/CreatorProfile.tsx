import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { VideoGrid } from "@/components/VideoGrid";
import FollowButton from "@/components/FollowButton";
import FollowersList from "@/components/FollowersList";
import { MapPin, Calendar, Film, Users, Eye } from "lucide-react";
import { toast } from "sonner";

interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  city: string;
  followers_count: number;
  following_count: number;
  spliks_count: number;
  is_private: boolean;
  created_at: string;
  followers_private?: boolean;
  following_private?: boolean;
}

export function CreatorProfile() {
  const { username } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [spliks, setSpliks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showFollowersList, setShowFollowersList] = useState(false);
  const [showFollowingList, setShowFollowingList] = useState(false);

  useEffect(() => {
    fetchProfile();
    setupRealtimeSubscription();

    // Get current user
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, [username]);

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('profile-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `username=eq.${username}`
        },
        (payload) => {
          if (payload.new) {
            setProfile(payload.new as Profile);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'spliks',
        },
        () => {
          fetchSpliks();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'followers',
        },
        (payload) => {
          // Refresh profile to update follower count
          if (payload.new || payload.old) {
            fetchProfile();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();

      if (error) throw error;
      setProfile(data);
      
      if (data) {
        fetchSpliks(data.id);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchSpliks = async (userId?: string) => {
    if (!profile && !userId) return;
    
    try {
      const { data, error } = await supabase
        .from('spliks')
        .select('*')
        .eq('user_id', userId || profile!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch profile data for each splik
      const spliksWithProfiles = await Promise.all(
        (data || []).map(async (splik) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', splik.user_id)
            .maybeSingle();
          
          return {
            ...splik,
            profiles: profileData || undefined
          };
        })
      );
      
      setSpliks(spliksWithProfiles);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Failed to load videos');
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Profile not found</h2>
          <Button onClick={() => window.location.href = '/'}>Go Home</Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="mb-8 p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="h-32 w-32">
              <AvatarImage src={profile.avatar_url || ''} />
              <AvatarFallback className="text-3xl">
                {profile.display_name?.charAt(0) || profile.username?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-foreground">
                    {profile.display_name || profile.username}
                  </h1>
                  <p className="text-muted-foreground">@{profile.username}</p>
                </div>
                
                {currentUserId !== profile.id && (
                  <FollowButton 
                    profileId={profile.id}
                    username={profile.username}
                    className="ml-4"
                  />
                )}
              </div>
              
              {profile.bio && (
                <p className="text-foreground mb-4">{profile.bio}</p>
              )}
              
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                {profile.city && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {profile.city}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Joined {formatDate(profile.created_at)}
                </div>
              </div>
              
              <div className="flex gap-8">
                <div className="text-center min-w-[80px]">
                  <p className="text-2xl font-bold text-foreground">{profile.spliks_count || 0}</p>
                  <p className="text-sm text-muted-foreground">Videos</p>
                </div>
                <button 
                  onClick={() => setShowFollowersList(true)}
                  className="text-center min-w-[80px] hover:bg-accent rounded-lg p-2 -m-2 transition-colors"
                >
                  <p className="text-2xl font-bold text-foreground">
                    {profile.followers_private && currentUserId !== profile.id ? 0 : (profile.followers_count || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Followers</p>
                </button>
                <button 
                  onClick={() => setShowFollowingList(true)}
                  className="text-center min-w-[80px] hover:bg-accent rounded-lg p-2 -m-2 transition-colors"
                >
                  <p className="text-2xl font-bold text-foreground">
                    {profile.following_private && currentUserId !== profile.id ? 0 : (profile.following_count || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Following</p>
                </button>
              </div>
            </div>
          </div>
        </Card>
        
        <Tabs defaultValue="videos" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="videos">Videos</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="liked">Liked</TabsTrigger>
          </TabsList>
          
          <TabsContent value="videos" className="mt-6">
            {spliks.length > 0 ? (
              <VideoGrid 
                spliks={spliks}
                showCreatorInfo={false}
                onDeleteComment={currentUserId === profile.id ? async (commentId) => {
                  const { error } = await supabase
                    .from('comments')
                    .delete()
                    .eq('id', commentId);
                  
                  if (!error) {
                    toast.success('Comment deleted');
                  }
                } : undefined}
              />
            ) : (
              <Card className="p-12 text-center">
                <Film className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No videos yet</p>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="about" className="mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">About {profile.display_name || profile.username}</h3>
              <div className="space-y-4">
                {profile.bio && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Bio</p>
                    <p className="text-foreground">{profile.bio}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Stats</p>
                  <div className="flex gap-4">
                    <Badge variant="secondary">
                      <Film className="mr-1 h-3 w-3" />
                      {profile.spliks_count} Videos
                    </Badge>
                    <Badge variant="secondary">
                      <Users className="mr-1 h-3 w-3" />
                      {profile.followers_count} Followers
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Member Since</p>
                  <p className="text-foreground">{formatDate(profile.created_at)}</p>
                </div>
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="liked" className="mt-6">
            <Card className="p-12 text-center">
              <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Liked videos coming soon</p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      
      {/* Followers List Modal */}
      <FollowersList
        profileId={profile.id}
        isOpen={showFollowersList}
        onClose={() => setShowFollowersList(false)}
        type="followers"
        count={profile.followers_count}
        isPrivate={profile.followers_private || false}
        isOwnProfile={currentUserId === profile.id}
      />
      
      {/* Following List Modal */}
      <FollowersList
        profileId={profile.id}
        isOpen={showFollowingList}
        onClose={() => setShowFollowingList(false)}
        type="following"
        count={profile.following_count}
        isPrivate={profile.following_private || false}
        isOwnProfile={currentUserId === profile.id}
      />
      
      <Footer />
    </div>
  );
}

export default CreatorProfile;