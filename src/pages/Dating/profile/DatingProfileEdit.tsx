// src/pages/Dating/DatingProfileEdit.tsx
import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Heart,
  Camera,
  Upload,
  X,
  Plus,
  Save,
  ChevronLeft,
  Loader2,
  MapPin,
  Trash2,
  Edit3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

type ProfileData = {
  user_id: string;
  name: string;
  age: number;
  bio: string | null;
  photos: string[] | null;
  video_intro_url: string | null;
  city: string | null;
  gender: string | null;
  seeking: string[] | null;
  relationship_goal?: string | null;
  has_kids?: string | null;
  wants_kids?: string | null;
  height?: string | null;
  body_type?: string | null;
  education?: string | null;
  religion?: string | null;
  drinking?: string | null;
  smoking?: string | null;
  exercise?: string | null;
  pets?: string | null;
  interests?: string[] | null;
  hobbies?: string[] | null;
  max_distance?: number | null;
  min_age?: number | null;
  max_age?: number | null;
};

const SEEKING_OPTIONS = [
  "Men", "Women", "Non-binary folks", "Trans men", "Trans women", "Everyone"
];

const DROPDOWN_OPTIONS = {
  relationship_goal: ["Casual dating", "Serious relationship", "Long-term relationship", "Marriage", "Friends first", "Not sure yet"],
  has_kids: ["No", "Yes - and they live with me", "Yes - but they don't live with me", "Prefer not to say"],
  wants_kids: ["Want children", "Don't want children", "Open to children", "Not sure", "Have children and want more"],
  height: ["Under 5'0\"", "5'0\"", "5'1\"", "5'2\"", "5'3\"", "5'4\"", "5'5\"", "5'6\"", "5'7\"", "5'8\"", "5'9\"", "5'10\"", "5'11\"", "6'0\"", "6'1\"", "6'2\"", "6'3\"", "6'4\"", "Over 6'4\""],
  body_type: ["Slim", "Athletic", "Average", "Curvy", "Full-figured", "Muscular", "Prefer not to say"],
  education: ["High school", "Some college", "Bachelor's degree", "Master's degree", "PhD/Doctorate", "Trade school", "Other"],
  religion: ["Christian", "Catholic", "Jewish", "Muslim", "Buddhist", "Hindu", "Spiritual", "Agnostic", "Atheist", "Other", "Prefer not to say"],
  drinking: ["Never", "Rarely", "Socially", "Regularly", "Prefer not to say"],
  smoking: ["Never", "Socially", "Regularly", "Trying to quit", "Prefer not to say"],
  exercise: ["Never", "Rarely", "Sometimes", "Regularly", "Daily", "Fitness enthusiast"],
  pets: ["Dog lover", "Cat lover", "Both dogs and cats", "Other pets", "No pets", "Allergic to pets"],
};

const DatingProfileEdit: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [seeking, setSeeking] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState("");
  const [newHobby, setNewHobby] = useState("");

  // Extended fields
  const [extendedFields, setExtendedFields] = useState<Record<string, string>>({});
  const [interests, setInterests] = useState<string[]>([]);
  const [hobbies, setHobbies] = useState<string[]>([]);

  // Settings
  const [maxDistance, setMaxDistance] = useState(50);
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 50]);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      setCurrentUser(user);

      const { data: profileData, error } = await supabase
        .from("dating_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error loading profile:", error);
        toast({
          title: "Error loading profile",
          description: "Could not load your profile data.",
          variant: "destructive",
        });
        return;
      }

      setProfile(profileData);
      
      // Populate form fields
      setName(profileData.name || "");
      setAge(profileData.age?.toString() || "");
      setBio(profileData.bio || "");
      setSeeking(profileData.seeking || []);
      setInterests(profileData.interests || []);
      setHobbies(profileData.hobbies || []);
      setMaxDistance(profileData.max_distance || 50);
      setAgeRange([profileData.min_age || 18, profileData.max_age || 50]);

      // Set extended fields
      setExtendedFields({
        relationship_goal: profileData.relationship_goal || "",
        has_kids: profileData.has_kids || "",
        wants_kids: profileData.wants_kids || "",
        height: profileData.height || "",
        body_type: profileData.body_type || "",
        education: profileData.education || "",
        religion: profileData.religion || "",
        drinking: profileData.drinking || "",
        smoking: profileData.smoking || "",
        exercise: profileData.exercise || "",
        pets: profileData.pets || "",
      });

    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "Something went wrong loading your profile.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!currentUser || !profile) return;

    setSaving(true);
    try {
      const updates = {
        name: name.trim(),
        age: parseInt(age),
        bio: bio.trim(),
        seeking,
        interests,
        hobbies,
        max_distance: maxDistance,
        min_age: ageRange[0],
        max_age: ageRange[1],
        updated_at: new Date().toISOString(),
        ...extendedFields,
      };

      const { error } = await supabase
        .from("dating_profiles")
        .update(updates)
        .eq("user_id", currentUser.id);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your changes have been saved successfully.",
      });

      navigate("/dating/discover");
    } catch (error) {
      console.error("Save error:", error);
      toast({
        title: "Save failed",
        description: "Could not save your changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const addInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest("");
    }
  };

  const addHobby = () => {
    if (newHobby.trim() && !hobbies.includes(newHobby.trim())) {
      setHobbies([...hobbies, newHobby.trim()]);
      setNewHobby("");
    }
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter(i => i !== interest));
  };

  const removeHobby = (hobby: string) => {
    setHobbies(hobbies.filter(h => h !== hobby));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-fuchsia-500 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900 flex items-center justify-center">
        <Card className="bg-black/40 border-zinc-700 backdrop-blur p-8">
          <p className="text-white text-center">Profile not found</p>
          <Link to="/dating/discover">
            <Button className="mt-4 w-full">Back to Dating</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900">
      {/* Header */}
      <div className="border-b border-zinc-800/50 bg-black/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/dating/discover">
                <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
                <Edit3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Edit Profile</h1>
                <p className="text-sm text-zinc-400">Update your dating information</p>
              </div>
            </div>

            <Button
              onClick={saveProfile}
              disabled={saving}
              className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Edit Form */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Basic Info */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Name</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-zinc-900 border-zinc-600 text-white"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Age</label>
                    <Input
                      type="number"
                      min={18}
                      max={100}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="bg-zinc-900 border-zinc-600 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Bio</label>
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 500))}
                    className="bg-zinc-900 border-zinc-600 text-white min-h-[120px]"
                    placeholder="Tell people about yourself..."
                  />
                  <div className="text-right text-sm text-zinc-500 mt-1">{bio.length}/500</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Looking for</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SEEKING_OPTIONS.map((option) => (
                      <button
                        key={option}
                        onClick={() =>
                          setSeeking((prev) =>
                            prev.includes(option)
                              ? prev.filter((x) => x !== option)
                              : [...prev, option]
                          )
                        }
                        className={`p-3 rounded-lg text-sm text-left transition-colors ${
                          seeking.includes(option)
                            ? "bg-gradient-to-r from-fuchsia-600/20 to-purple-600/20 border-fuchsia-500 text-fuchsia-200 border"
                            : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600 border"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Extended Profile */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Additional Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(DROPDOWN_OPTIONS).map(([field, options]) => (
                    <div key={field}>
                      <label className="block text-sm font-medium text-zinc-300 mb-2 capitalize">
                        {field.replace(/_/g, ' ')}
                      </label>
                      <select
                        value={extendedFields[field] || ""}
                        onChange={(e) => setExtendedFields(prev => ({ ...prev, [field]: e.target.value }))}
                        className="w-full p-3 bg-zinc-900 border border-zinc-600 text-white rounded-lg"
                      >
                        <option value="">Select...</option>
                        {options.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Interests & Hobbies */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Interests & Hobbies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Interests */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Interests</label>
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={newInterest}
                      onChange={(e) => setNewInterest(e.target.value)}
                      className="bg-zinc-900 border-zinc-600 text-white"
                      placeholder="Add an interest..."
                      onKeyPress={(e) => e.key === 'Enter' && addInterest()}
                    />
                    <Button onClick={addInterest} size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {interests.map((interest, i) => (
                      <span key={i} className="bg-fuchsia-600/20 border border-fuchsia-500/50 text-fuchsia-200 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        {interest}
                        <button onClick={() => removeInterest(interest)} className="hover:text-white">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Hobbies */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Hobbies</label>
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={newHobby}
                      onChange={(e) => setNewHobby(e.target.value)}
                      className="bg-zinc-900 border-zinc-600 text-white"
                      placeholder="Add a hobby..."
                      onKeyPress={(e) => e.key === 'Enter' && addHobby()}
                    />
                    <Button onClick={addHobby} size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hobbies.map((hobby, i) => (
                      <span key={i} className="bg-purple-600/20 border border-purple-500/50 text-purple-200 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        {hobby}
                        <button onClick={() => removeHobby(hobby)} className="hover:text-white">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Discovery Settings */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Discovery Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Maximum Distance: {maxDistance} miles
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={200}
                    value={maxDistance}
                    onChange={(e) => setMaxDistance(parseInt(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Age Range: {ageRange[0]} - {ageRange[1]}
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-zinc-400">Min Age</label>
                      <Input
                        type="number"
                        min={18}
                        max={100}
                        value={ageRange[0]}
                        onChange={(e) => setAgeRange([parseInt(e.target.value), ageRange[1]])}
                        className="bg-zinc-900 border-zinc-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400">Max Age</label>
                      <Input
                        type="number"
                        min={18}
                        max={100}
                        value={ageRange[1]}
                        onChange={(e) => setAgeRange([ageRange[0], parseInt(e.target.value)])}
                        className="bg-zinc-900 border-zinc-600 text-white"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Profile Preview */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <Card className="bg-black/40 border-zinc-700 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="h-20 w-20 mx-auto mb-3 ring-2 ring-fuchsia-500/30 rounded-full overflow-hidden">
                        {profile.photos?.[0] ? (
                          <img
                            src={profile.photos[0]}
                            className="h-full w-full object-cover"
                            alt="Profile"
                          />
                        ) : (
                          <Avatar className="h-20 w-20">
                            <AvatarImage />
                            <AvatarFallback className="bg-zinc-800 text-zinc-300">
                              {name.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>

                      <h3 className="text-white font-semibold">
                        {name || "Your Name"}, {age || "?"}
                      </h3>
                      <p className="text-zinc-400 text-sm flex items-center justify-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {profile.city || "Location"}
                      </p>
                    </div>

                    {bio && (
                      <div className="text-sm text-zinc-300 bg-zinc-800/60 rounded-lg p-3">
                        {bio}
                      </div>
                    )}

                    {interests.length > 0 && (
                      <div className="text-sm">
                        <div className="text-zinc-400 mb-2">Interests</div>
                        <div className="flex flex-wrap gap-1">
                          {interests.slice(0, 3).map((interest, i) => (
                            <span key={i} className="bg-fuchsia-600/20 text-fuchsia-200 px-2 py-1 rounded text-xs">
                              {interest}
                            </span>
                          ))}
                          {interests.length > 3 && (
                            <span className="text-zinc-400 text-xs">+{interests.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatingProfileEdit;
