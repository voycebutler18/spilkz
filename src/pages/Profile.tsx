import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, MapPin, Calendar, Play, Heart, Users, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import VideoGrid from "@/components/dashboard/VideoGrid";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
import FollowButton from "@/components/FollowButton";

const Profile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [spliks, setSpliks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [spliksLoading, setSpliksLoading] = useState(false);
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  const fetchProfile = async () => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        toast({
          title: "Profile not found",
          description: "This user profile doesn't exist",
          variant: "destructive",
        });
        return;
      }

      // Redirect to creator profile if username exists
      if (profileData.username) {
        navigate(`/creator/${profileData.username}`, { replace: true });
        return;
      }

      setProfile(profileData);
      
      // Check if this is the current user's profile
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      setIsOwnProfile(user?.id === profileData.id);
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSpliks = async () => {
    if (!id) return;
    
    setSpliksLoading(true);
    try {
      const { data, error } = await supabase
        .from('spliks')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSpliks(data || []);
    } catch (error: any) {
      console.error('Error fetching spliks:', error);
      toast({
        title: "Error",
        description: "Failed to load videos",
        variant: "destructive",
      });
    } finally {
      setSpliksLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchProfile();
      fetchSpliks();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <h2 className="text-2xl font-bold mb-4">Profile not found</h2>
          <Link to="/">
            <Button variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const getInitials = () => {
    const firstName = profile?.first_name || '';
    const lastName = profile?.last_name || '';
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'U';
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Profile Header */}
        <div className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                {isOwnProfile ? (
                  <ProfilePictureUpload
                    profileId={profile.id}
                    currentAvatarUrl={profile.avatar_url}
                    displayName={`${profile.first_name || ''} ${profile.last_name || ''}`}
                    onUploadComplete={(url) => {
                      setProfile({ ...profile, avatar_url: url });
                    }}
                  />
                ) : (
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profile.avatar_url} />
                    <AvatarFallback className="text-2xl">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                )}
                
                <div className="flex-1 text-center md:text-left">
                  <h1 className="text-3xl font-bold mb-2">
                    {profile.display_name || profile.username || 
                     (isOwnProfile && profile.first_name && profile.last_name ? 
                      `${profile.first_name} ${profile.last_name}` : 
                      'Anonymous User')}
                  </h1>
                  
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-muted-foreground mb-4">
                    {isOwnProfile && profile.city && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{profile.city}</span>
                      </div>
                    )}
                    {isOwnProfile && profile.age && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{profile.age} years old</span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap gap-8 justify-center md:justify-start mb-4">
                    <div className="text-center min-w-[80px]">
                      <div className="text-2xl font-bold">{spliks.length}</div>
                      <div className="text-sm text-muted-foreground">Videos</div>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <div className="text-2xl font-bold">{profile.followers_count || 0}</div>
                      <div className="text-sm text-muted-foreground">Followers</div>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <div className="text-2xl font-bold">{profile.following_count || 0}</div>
                      <div className="text-sm text-muted-foreground">Following</div>
                    </div>
                  </div>

                  {/* Follow Button */}
                  {!isOwnProfile && (
                    <FollowButton 
                      profileId={profile.id}
                      username={profile.username}
                      variant="default"
                      size="lg"
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="videos" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto">
            <TabsTrigger value="videos">Videos</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="liked">Liked</TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Videos</CardTitle>
                <CardDescription>
                  All videos from this creator
                </CardDescription>
              </CardHeader>
              <CardContent>
                {spliksLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : spliks.length > 0 ? (
                  <VideoGrid 
                    spliks={spliks} 
                    onDelete={() => {}}
                    hideActions={true}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Play className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No videos yet</h3>
                    <p className="text-muted-foreground">
                      This creator hasn't uploaded any videos
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="about" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
                <CardDescription>
                  Information about this creator
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {profile.display_name || profile.username ? (
                    <div>
                      <h4 className="font-medium mb-1">Display Name</h4>
                      <p className="text-muted-foreground">
                        {profile.display_name || profile.username}
                      </p>
                    </div>
                  ) : null}
                  {isOwnProfile && profile.first_name && profile.last_name && (
                    <div>
                      <h4 className="font-medium mb-1">Name</h4>
                      <p className="text-muted-foreground">
                        {profile.first_name} {profile.last_name}
                      </p>
                    </div>
                  )}
                  {isOwnProfile && profile.city && (
                    <div>
                      <h4 className="font-medium mb-1">Location</h4>
                      <p className="text-muted-foreground">{profile.city}</p>
                    </div>
                  )}
                  {isOwnProfile && profile.age && (
                    <div>
                      <h4 className="font-medium mb-1">Age</h4>
                      <p className="text-muted-foreground">{profile.age} years old</p>
                    </div>
                  )}
                  <div>
                    <h4 className="font-medium mb-1">Member Since</h4>
                    <p className="text-muted-foreground">
                      {new Date(profile.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="liked" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Liked Videos</CardTitle>
                <CardDescription>
                  Videos this creator has liked
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Heart className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No liked videos</h3>
                  <p className="text-muted-foreground">
                    Liked videos will appear here
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
};

export default Profile;