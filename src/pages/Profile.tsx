import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {Home, MapPin, Calendar, Play, Heart, Users, Loader2, MessageSquare } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import VideoGrid from "@/components/dashboard/VideoGrid";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
import FollowButton from "@/components/FollowButton";

const Profile = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    display_name: "",
    bio: "",
    location: "",
    joined_date: "",
    profile_image_url: "",
  });
  const [videoCounts, setVideoCounts] = useState({
    live: 0,
    vod: 0,
    clips: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Get current user
        const { data: authData } = await supabase.auth.getUser();
        setCurrentUser(authData.user);

        // Fetch profile data
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", id)
          .single();

        if (profileError) throw profileError;
        setProfile(profileData);

        // Initialize form data
        setFormData({
          display_name: profileData.display_name || "",
          bio: profileData.bio || "",
          location: profileData.location || "",
          joined_date: profileData.joined_date || "",
          profile_image_url: profileData.profile_image_url || "",
        });

        // Fetch video counts
        const { data: contentData, error: contentError } = await supabase
          .from("content")
          .select("content_type")
          .eq("creator_id", id);

        if (contentError) throw contentError;

        const counts = contentData?.reduce((acc: any, item: any) => {
          if (item.content_type === "live") acc.live++;
          if (item.content_type === "vod") acc.vod++;
          if (item.content_type === "clip") acc.clips++;
          return acc;
        }, { live: 0, vod: 0, clips: 0 }) || { live: 0, vod: 0, clips: 0 };

        setVideoCounts(counts);
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast({
          title: "Error",
          description: "Failed to load profile. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id, toast]);

  const isOwnProfile = currentUser?.id === profile?.id;

  const handleSave = async () => {
    try {
      setIsSaving(true);

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: formData.display_name,
          bio: formData.bio,
          location: formData.location,
          joined_date: formData.joined_date,
          profile_image_url: formData.profile_image_url,
        })
        .eq("id", profile.id);

      if (error) throw error;

      setProfile({
        ...profile,
        display_name: formData.display_name,
        bio: formData.bio,
        location: formData.location,
        joined_date: formData.joined_date,
        profile_image_url: formData.profile_image_url,
      });

      setIsEditing(false);

      toast({
        title: "Success",
        description: "Your profile has been updated.",
      });
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error",
        description: "Failed to save profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Profile Not Found</CardTitle>
              <CardDescription>The requested profile could not be found.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/">Go back home</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Profile Info */}
          <div className="lg:col-span-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center">
                  <div className="mb-4">
                    {isOwnProfile ? (
                      <ProfilePictureUpload
                        url={formData.profile_image_url}
                        onUpload={(url) => setFormData({ ...formData, profile_image_url: url })}
                      />
                    ) : (
                      <Avatar className="h-32 w-32">
                        <AvatarImage src={profile.profile_image_url || ""} />
                        <AvatarFallback className="text-2xl">
                          {profile.display_name?.[0]?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>

                  {!isEditing ? (
                    <>
                      <h2 className="text-2xl font-bold mb-1">{profile.display_name || "Unnamed User"}</h2>
                      <p className="text-muted-foreground mb-4">@{profile.username}</p>

                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <MapPin className="h-4 w-4" />
                        <span>{profile.location || "Unknown location"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground mb-6">
                        <Calendar className="h-4 w-4" />
                        <span>Joined {profile.joined_date || "Unknown date"}</span>
                      </div>

                      <p className="text-center mb-6">{profile.bio || "No bio provided."}</p>

                      {isOwnProfile ? (
                        <Button onClick={() => setIsEditing(true)} className="w-full">Edit Profile</Button>
                      ) : (
                        <div className="flex flex-col gap-2 w-full">
                          <Button asChild className="w-full">
                            <Link to={`/creator/${profile.username}`}>
                              <Home className="h-4 w-4 mr-2" />
                              View Creator Page
                            </Link>
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="w-full space-y-4">
                        <div>
                          <label className="text-sm font-medium">Display Name</label>
                          <input
                            type="text"
                            value={formData.display_name}
                            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                            className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Username</label>
                          <input
                            type="text"
                            value={profile.username}
                            disabled
                            className="w-full mt-1 px-3 py-2 border rounded-md bg-muted text-muted-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Location</label>
                          <input
                            type="text"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                            className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Joined Date</label>
                          <input
                            type="text"
                            value={formData.joined_date}
                            onChange={(e) => setFormData({ ...formData, joined_date: e.target.value })}
                            className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Bio</label>
                          <textarea
                            value={formData.bio}
                            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                            className="w-full mt-1 px-3 py-2 border rounded-md bg-background min-h-[120px]"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Save Changes"
                            )}
                          </Button>
                          <Button variant="outline" onClick={() => setIsEditing(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Stats Card */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Stats</CardTitle>
                <CardDescription>Your content performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{videoCounts.live}</div>
                    <div className="text-sm text-muted-foreground">Live</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{videoCounts.vod}</div>
                    <div className="text-sm text-muted-foreground">VODs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{videoCounts.clips}</div>
                    <div className="text-sm text-muted-foreground">Clips</div>
                  </div>
                </div>

                {/* Follow + Message actions for visitors */}
                {!isOwnProfile && (
                  <div className="mt-6 flex items-center gap-2 justify-center md:justify-start">
                    <FollowButton 
                      profileId={profile.id}
                      username={profile.username}
                      variant="default"
                      size="lg"
                    />
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => navigate(`/messages/${profile.id}`)}
                      className="flex items-center gap-2"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Message
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Content Tabs */}
          <div className="lg:col-span-8">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{isOwnProfile ? "Your Content" : `${profile.display_name || profile.username}'s Content`}</CardTitle>
                    <CardDescription>Explore videos and streams</CardDescription>
                  </div>
                  {isOwnProfile && (
                    <div className="flex gap-2">
                      <Button asChild variant="outline">
                        <Link to="/studio/upload">
                          <Play className="h-4 w-4 mr-2" />
                          Upload Video
                        </Link>
                      </Button>
                      <Button asChild>
                        <Link to="/studio/live">
                          Go Live
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="vod">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="vod" className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      VODs
                    </TabsTrigger>
                    <TabsTrigger value="live" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Live
                    </TabsTrigger>
                    <TabsTrigger value="clips" className="flex items-center gap-2">
                      <Heart className="h-4 w-4" />
                      Clips
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="vod" className="mt-4">
                    <VideoGrid creatorId={profile.id} type="vod" />
                  </TabsContent>
                  <TabsContent value="live" className="mt-4">
                    <VideoGrid creatorId={profile.id} type="live" />
                  </TabsContent>
                  <TabsContent value="clips" className="mt-4">
                    <VideoGrid creatorId={profile.id} type="clip" />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Profile;
