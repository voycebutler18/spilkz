import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import VideoGrid from "@/components/dashboard/VideoGrid";
import VideoUploadModal from "@/components/dashboard/VideoUploadModal";
import { Switch } from "@/components/ui/switch";
import { 
  BarChart3, 
  Video, 
  Eye, 
  Users, 
  TrendingUp,
  Settings,
  User,
  Plus,
  Bookmark,
  Lock,
  Unlock
} from "lucide-react";
import { toast } from "sonner";

interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  followers_count: number;
  following_count: number;
  spliks_count: number;
  followers_private?: boolean;
  following_private?: boolean;
}

interface DashboardStats {
  totalViews: number;
  totalSpliks: number;
  followers: number;
  engagementRate: number;
}

const CreatorDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [spliks, setSpliks] = useState<any[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalViews: 0,
    totalSpliks: 0,
    followers: 0,
    engagementRate: 0
  });
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    bio: '',
    avatar_url: ''
  });

  useEffect(() => {
    checkAuth();
    setupRealtimeUpdates();
  }, []);

  const setupRealtimeUpdates = () => {
    // Update stats every 5 seconds
    const interval = setInterval(() => {
      if (profile) {
        fetchStats();
      }
    }, 5000);

    // Subscribe to realtime changes
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'spliks'
        },
        () => {
          fetchSpliks();
          fetchStats();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          const newProfile = payload.new as Profile;
          if (newProfile && newProfile.id === profile?.id) {
            setProfile(newProfile);
            updateStatsFromProfile(newProfile);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  };

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate('/login');
      return;
    }

    await fetchProfile(user.id);
    await fetchSpliks();
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setFormData({
          username: data.username || '',
          display_name: data.display_name || '',
          bio: data.bio || '',
          avatar_url: data.avatar_url || ''
        });
        updateStatsFromProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatsFromProfile = (profileData: Profile) => {
    setStats(prev => ({
      ...prev,
      followers: profileData.followers_count,
      totalSpliks: profileData.spliks_count
    }));
  };

  const fetchSpliks = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // First fetch spliks
      const { data: spliksData, error: spliksError } = await supabase
        .from('spliks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (spliksError) throw spliksError;

      // Then fetch the profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile for spliks:', profileError);
      }

      // Combine the data
      const data = spliksData?.map(splik => ({
        ...splik,
        profiles: profileData || null
      })) || [];

      setSpliks(data || []);
      
      // Calculate total views
      const totalViews = data?.reduce((acc, splik) => acc + (splik.views || 0), 0) || 0;
      const totalInteractions = data?.reduce((acc, splik) => 
        acc + (splik.likes_count || 0) + (splik.comments_count || 0), 0) || 0;
      
      setStats(prev => ({
        ...prev,
        totalViews,
        totalSpliks: data?.length || 0,
        engagementRate: totalViews > 0 ? Math.round((totalInteractions / totalViews) * 100) : 0
      }));
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
  };

  const fetchStats = async () => {
    await fetchSpliks();
  };

  const handleProfileUpdate = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: formData.username,
          display_name: formData.display_name,
          bio: formData.bio,
          avatar_url: formData.avatar_url
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
      setEditingProfile(false);
      fetchProfile(user.id);
    } catch (error: any) {
      if (error.message?.includes('duplicate key')) {
        toast.error('Username already taken');
      } else {
        toast.error('Failed to update profile');
      }
    }
  };

  const togglePrivacy = async (field: 'followers_private' | 'following_private') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !profile) return;

    const newValue = !profile[field];
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: newValue })
        .eq('id', user.id);

      if (error) throw error;

      setProfile({ ...profile, [field]: newValue });
      toast.success(`${field === 'followers_private' ? 'Followers' : 'Following'} privacy updated`);
    } catch (error) {
      console.error('Error updating privacy:', error);
      toast.error('Failed to update privacy settings');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);
    
    if (!error) {
      toast.success('Comment deleted');
      fetchSpliks();
    }
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Creator Dashboard
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/dashboard/favorites')}>
              <Bookmark className="mr-2 h-4 w-4" />
              My Favorites
            </Button>
            <Button onClick={() => setUploadModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Upload Video
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Videos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{stats.totalSpliks}</div>
                <Video className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Videos uploaded</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Views
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{stats.totalViews}</div>
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Views across all videos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Followers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{stats.followers}</div>
                <Users className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Build your community</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Engagement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{stats.engagementRate}%</div>
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Average engagement rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="videos" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="videos">My Videos</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="profile">Profile Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="mt-6">
            {spliks.length > 0 ? (
              <VideoGrid 
                spliks={spliks} 
              />
            ) : (
              <Card className="p-12 text-center">
                <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No videos uploaded yet</p>
                <Button onClick={() => setUploadModalOpen(true)}>
                  Upload Your First Video
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Overview</CardTitle>
                <CardDescription>Track your content performance and growth</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-accent/50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">This Week's Views</p>
                      <p className="text-2xl font-bold">{stats.totalViews}</p>
                    </div>
                    <Badge variant="secondary">Live</Badge>
                  </div>
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4" />
                    <p>Detailed analytics coming soon</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Manage your creator profile</CardDescription>
              </CardHeader>
              <CardContent>
                {editingProfile ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        placeholder="@username"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        This will be your unique identifier
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="display_name">Display Name</Label>
                      <Input
                        id="display_name"
                        value={formData.display_name}
                        onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                        placeholder="Your display name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea
                        id="bio"
                        value={formData.bio}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                        placeholder="Tell us about yourself"
                        rows={4}
                      />
                    </div>
                    <div>
                      <Label htmlFor="avatar_url">Avatar URL</Label>
                      <Input
                        id="avatar_url"
                        value={formData.avatar_url}
                        onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                        placeholder="https://example.com/avatar.jpg"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleProfileUpdate}>Save Changes</Button>
                      <Button variant="outline" onClick={() => setEditingProfile(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Username</p>
                      <p className="font-medium">@{profile?.username || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Display Name</p>
                      <p className="font-medium">{profile?.display_name || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Bio</p>
                      <p className="font-medium">{profile?.bio || 'No bio yet'}</p>
                    </div>
                    {profile?.username && (
                      <div>
                        <p className="text-sm text-muted-foreground">Public Profile</p>
                        <a 
                          href={`/creator/${profile.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          View Public Profile
                        </a>
                      </div>
                    )}
                    
                    {/* Privacy Settings */}
                    <div className="border-t pt-4 mt-4 space-y-4">
                      <h3 className="font-semibold text-sm">Privacy Settings</h3>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {profile?.followers_private ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                          <div>
                            <p className="font-medium text-sm">Followers List</p>
                            <p className="text-xs text-muted-foreground">
                              {profile?.followers_private ? 'Private - Only you can see' : 'Public - Anyone can see'}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={profile?.followers_private || false}
                          onCheckedChange={() => togglePrivacy('followers_private')}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {profile?.following_private ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                          <div>
                            <p className="font-medium text-sm">Following List</p>
                            <p className="text-xs text-muted-foreground">
                              {profile?.following_private ? 'Private - Only you can see' : 'Public - Anyone can see'}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={profile?.following_private || false}
                          onCheckedChange={() => togglePrivacy('following_private')}
                        />
                      </div>
                    </div>
                    
                    <Button onClick={() => setEditingProfile(true)}>
                      <Settings className="mr-2 h-4 w-4" />
                      Edit Profile
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <VideoUploadModal 
        open={uploadModalOpen} 
        onClose={() => setUploadModalOpen(false)}
        onUploadComplete={() => {
          fetchSpliks();
          setUploadModalOpen(false);
        }}
      />

      <Footer />
    </div>
  );
};

export default CreatorDashboard;