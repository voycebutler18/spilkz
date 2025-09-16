import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Heart, 
  Sparkles,
  User,
  MapPin,
  Camera,
  Upload,
  Play,
  Mic,
  X,
  Plus,
  Star,
  Zap,
  Globe,
  Shield,
  Users,
  Calendar,
  Coffee,
  Music2,
  Palette,
  BookOpen,
  Gamepad2,
  Dumbbell,
  Plane,
  ChefHat,
  PawPrint,
  Car,
  Briefcase,
  GraduationCap,
  Mountain
} from "lucide-react";

// Mock supabase - replace with real import
const supabase = {
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'user123', email: 'user@example.com' } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
  },
  from: (table) => ({
    select: (fields) => ({
      eq: (field, value) => ({
        maybeSingle: () => {
          if (table === 'profiles') {
            return Promise.resolve({ 
              data: {
                id: 'user123',
                username: 'real_user',
                display_name: 'Real User',
                first_name: 'Real',
                last_name: 'User',
                dob: '1995-06-15',
                city: 'San Francisco',
                avatar_url: null
              }, 
              error: null 
            });
          }
          return Promise.resolve({ data: null, error: null });
        }
      })
    }),
    upsert: () => Promise.resolve({ error: null })
  })
};

const GENDER_IDENTITIES = [
  { id: "man", label: "Man", icon: "👨" },
  { id: "woman", label: "Woman", icon: "👩" },
  { id: "non_binary", label: "Non-binary", icon: "🌟" },
  { id: "trans_man", label: "Trans man", icon: "🏳️‍⚧️" },
  { id: "trans_woman", label: "Trans woman", icon: "🏳️‍⚧️" },
  { id: "genderfluid", label: "Genderfluid", icon: "🌊" },
  { id: "other", label: "Other", icon: "✨" }
];

const ORIENTATIONS = [
  { id: "straight", label: "Straight", color: "bg-blue-500/20 border-blue-500/40 text-blue-300" },
  { id: "gay", label: "Gay", color: "bg-rainbow-500/20 border-rainbow-500/40 text-rainbow-300" },
  { id: "lesbian", label: "Lesbian", color: "bg-pink-500/20 border-pink-500/40 text-pink-300" },
  { id: "bisexual", label: "Bisexual", color: "bg-purple-500/20 border-purple-500/40 text-purple-300" },
  { id: "pansexual", label: "Pansexual", color: "bg-yellow-500/20 border-yellow-500/40 text-yellow-300" },
  { id: "asexual", label: "Asexual", color: "bg-gray-500/20 border-gray-500/40 text-gray-300" },
  { id: "queer", label: "Queer", color: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" },
  { id: "questioning", label: "Questioning", color: "bg-orange-500/20 border-orange-500/40 text-orange-300" }
];

const SEEKING_GENDERS = [
  "Men", "Women", "Non-binary folks", "Trans men", "Trans women", "Everyone"
];

const RELATIONSHIP_TYPES = [
  { 
    id: "long_term", 
    label: "Long-term relationship", 
    desc: "Looking for something serious and meaningful",
    icon: Heart,
    gradient: "from-red-500/20 to-pink-500/20 border-red-500/30"
  },
  { 
    id: "short_term", 
    label: "Short-term dating", 
    desc: "Casual dating, see what happens naturally",
    icon: Coffee,
    gradient: "from-orange-500/20 to-yellow-500/20 border-orange-500/30"
  },
  { 
    id: "friends", 
    label: "New friends", 
    desc: "Building genuine platonic connections",
    icon: Users,
    gradient: "from-blue-500/20 to-cyan-500/20 border-blue-500/30"
  },
  { 
    id: "networking", 
    label: "Professional networking", 
    desc: "Career connections and opportunities",
    icon: Briefcase,
    gradient: "from-purple-500/20 to-indigo-500/20 border-purple-500/30"
  },
  { 
    id: "unsure", 
    label: "Open to possibilities", 
    desc: "Still figuring it out, open to connections",
    icon: Star,
    gradient: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30"
  }
];

const FAITHS = [
  { id: "christian", label: "Christian", desc: "Following Christ's teachings" },
  { id: "muslim", label: "Muslim", desc: "Following Islamic faith" },
  { id: "jewish", label: "Jewish", desc: "Part of Jewish tradition" },
  { id: "hindu", label: "Hindu", desc: "Following Hindu dharma" },
  { id: "buddhist", label: "Buddhist", desc: "Following Buddhist path" },
  { id: "spiritual", label: "Spiritual", desc: "Spiritual but not religious" },
  { id: "agnostic", label: "Agnostic", desc: "Open to possibilities" },
  { id: "atheist", label: "Atheist", desc: "Non-religious worldview" },
  { id: "other", label: "Other faith", desc: "Different spiritual path" },
  { id: "prefer_not_say", label: "Prefer not to say", desc: "Private about faith" }
];

const INTEREST_CATEGORIES = [
  {
    name: "Creative",
    items: [
      { id: "music", label: "Music", icon: Music2 },
      { id: "art", label: "Art", icon: Palette },
      { id: "photography", label: "Photography", icon: Camera },
      { id: "writing", label: "Writing", icon: BookOpen },
      { id: "dancing", label: "Dancing", icon: Users }
    ]
  },
  {
    name: "Active",
    items: [
      { id: "fitness", label: "Fitness", icon: Dumbbell },
      { id: "outdoors", label: "Outdoors", icon: Mountain },
      { id: "sports", label: "Sports", icon: Users },
      { id: "hiking", label: "Hiking", icon: Mountain },
      { id: "yoga", label: "Yoga", icon: Users }
    ]
  },
  {
    name: "Social",
    items: [
      { id: "foodie", label: "Foodie", icon: ChefHat },
      { id: "coffee", label: "Coffee", icon: Coffee },
      { id: "travel", label: "Travel", icon: Plane },
      { id: "nightlife", label: "Nightlife", icon: Users },
      { id: "cooking", label: "Cooking", icon: ChefHat }
    ]
  },
  {
    name: "Digital",
    items: [
      { id: "gaming", label: "Gaming", icon: Gamepad2 },
      { id: "tech", label: "Tech", icon: Zap },
      { id: "movies", label: "Movies", icon: Play },
      { id: "podcasts", label: "Podcasts", icon: Mic },
      { id: "streaming", label: "Streaming", icon: Play }
    ]
  }
];

function calcAge(dobISO) {
  if (!dobISO) return null;
  const d = new Date(dobISO + (dobISO.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

const DatingOnboardingWizard = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [totalSteps] = useState(7);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [showVideoUpload, setShowVideoUpload] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    city: "",
    age: null,
    bio: "",
    gender: "",
    pronouns: "",
    orientation: "",
    seeking: [],
    relationshipType: "",
    faith: "",
    denomination: "",
    interests: [],
    photos: [],
    videoIntro: null,
    showAge: true,
    verified: false
  });

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const progress = (currentStep / totalSteps) * 100;

  // Load real user data
  useEffect(() => {
    let mounted = true;

    const loadUserData = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (!mounted) return;
        
        const currentUser = authData.user;
        setUser(currentUser);

        if (currentUser) {
          // Get profile data
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id, username, display_name, first_name, last_name, avatar_url, city, dob")
            .eq("id", currentUser.id)
            .maybeSingle();

          if (mounted && profileData) {
            setProfile(profileData);
            const age = calcAge(profileData.dob);
            const fullName = [profileData.first_name, profileData.last_name].filter(Boolean).join(" ").trim();
            const displayName = profileData.display_name?.trim() || fullName || profileData.username?.trim() || "User";
            
            setFormData(prev => ({
              ...prev,
              name: displayName,
              city: profileData.city || "",
              age: age
            }));
          }

          // Check for existing dating profile
          const { data: datingProfile } = await supabase
            .from("dating_profiles")
            .select("*")
            .eq("user_id", currentUser.id)
            .maybeSingle();

          if (mounted && datingProfile) {
            setFormData(prev => ({
              ...prev,
              name: datingProfile.name || prev.name,
              city: datingProfile.city || prev.city,
              bio: datingProfile.intro || "",
              gender: datingProfile.gender_identity || "",
              pronouns: datingProfile.pronouns || "",
              orientation: datingProfile.orientation || "",
              seeking: Array.isArray(datingProfile.seeking_genders) ? datingProfile.seeking_genders : [],
              faith: datingProfile.faith || "",
              denomination: datingProfile.denomination || "",
              interests: Array.isArray(datingProfile.interests) ? datingProfile.interests : [],
              showAge: datingProfile.show_age ?? true,
              videoIntro: datingProfile.video_intro_url || null
            }));
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadUserData();

    return () => {
      mounted = false;
    };
  }, []);

  // Read prefill from localStorage
  useEffect(() => {
    const raw = localStorage.getItem("dating_prefill");
    if (raw) {
      try {
        const prefill = JSON.parse(raw);
        setFormData(prev => ({
          ...prev,
          name: prefill.name || prev.name,
          bio: prefill.bio || prev.bio
        }));
      } catch {}
      localStorage.removeItem("dating_prefill");
    }
  }, []);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayItem = (field, item) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(item) 
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item]
    }));
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handlePhotoUpload = async (file) => {
    setUploadingPhoto(true);
    // Mock upload delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    const newPhoto = {
      id: Date.now(),
      url: URL.createObjectURL(file),
      file
    };
    setFormData(prev => ({
      ...prev,
      photos: [...prev.photos, newPhoto]
    }));
    setUploadingPhoto(false);
  };

  const removePhoto = (photoId) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter(p => p.id !== photoId)
    }));
  };

  const saveProfile = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: formData.name.trim(),
        intro: formData.bio.trim() || null,
        city: formData.city.trim() || null,
        gender_identity: formData.gender || null,
        pronouns: formData.pronouns || null,
        orientation: formData.orientation || null,
        seeking_genders: formData.seeking,
        faith: formData.faith || null,
        denomination: formData.denomination || null,
        interests: formData.interests,
        show_age: formData.showAge,
        video_intro_url: formData.videoIntro,
        published: true,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("dating_profiles")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      // Success - redirect or show success
      console.log("Profile saved successfully!");
      
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setSaving(false);
    }
  };

  const StepIndicator = () => (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-zinc-400">
          Step {currentStep} of {totalSteps}
        </div>
        <div className="text-sm text-zinc-400">
          {Math.round(progress)}% complete
        </div>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <div 
          className="bg-gradient-to-r from-fuchsia-500 to-purple-500 h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );

  const StepCard = ({ children, title, subtitle }) => (
    <Card className="w-full max-w-4xl mx-auto bg-zinc-950 border-zinc-800 shadow-2xl">
      <CardHeader className="text-center border-b border-zinc-800 pb-6">
        <CardTitle className="text-2xl font-bold text-white mb-2">{title}</CardTitle>
        {subtitle && <p className="text-zinc-400">{subtitle}</p>}
      </CardHeader>
      <CardContent className="p-8">
        {children}
      </CardContent>
    </Card>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepCard 
            title="Let's start with the basics" 
            subtitle="Tell us a bit about yourself"
          >
            <div className="space-y-6">
              {/* Profile Photo Upload */}
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <Avatar className="h-32 w-32 ring-4 ring-fuchsia-500/30 cursor-pointer">
                    <AvatarImage src={profile?.avatar_url} />
                    <AvatarFallback className="bg-zinc-800 text-2xl text-zinc-300">
                      {formData.name.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    className="absolute bottom-0 right-0 bg-fuchsia-500 rounded-full p-2 text-white hover:bg-fuchsia-600 transition-colors"
                    onClick={() => document.getElementById('avatar-upload')?.click()}
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                    }}
                  />
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-zinc-300 text-sm font-medium">Your name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="mt-2 bg-zinc-900 border-zinc-700 text-white text-lg h-12"
                    placeholder="What should people call you?"
                  />
                </div>
                <div>
                  <Label className="text-zinc-300 text-sm font-medium">City</Label>
                  <div className="relative mt-2">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
                    <Input
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="pl-10 bg-zinc-900 border-zinc-700 text-white text-lg h-12"
                      placeholder="Where are you based?"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-zinc-300 text-sm font-medium">Tell us about yourself</Label>
                <Textarea
                  value={formData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value.slice(0, 500))}
                  className="mt-2 bg-zinc-900 border-zinc-700 text-white min-h-[120px] resize-none"
                  placeholder="Share your vibe, interests, what makes you unique..."
                />
                <div className="text-xs text-zinc-500 mt-2 text-right">
                  {formData.bio.length}/500
                </div>
              </div>

              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">Show my age</div>
                    <div className="text-zinc-400 text-sm">Age: {formData.age || 'Not set'}</div>
                  </div>
                  <button
                    onClick={() => handleInputChange('showAge', !formData.showAge)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.showAge ? 'bg-fuchsia-500' : 'bg-zinc-600'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.showAge ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Video Upload Option */}
              <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium flex items-center gap-2">
                      <Camera className="h-5 w-5 text-fuchsia-400" />
                      3-Second Video Intro
                    </div>
                    <div className="text-zinc-400 text-sm">Show your personality instantly</div>
                  </div>
                  <Button
                    onClick={() => setShowVideoUpload(true)}
                    className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
                  >
                    {formData.videoIntro ? 'Update Video' : 'Add Video'}
                  </Button>
                </div>
              </div>
            </div>
          </StepCard>
        );

      case 2:
        return (
          <StepCard 
            title="Your identity matters" 
            subtitle="Help us understand who you are"
          >
            <div className="space-y-8">
              <div>
                <Label className="text-zinc-300 text-lg font-medium mb-4 block">Gender identity</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {GENDER_IDENTITIES.map(gender => (
                    <button
                      key={gender.id}
                      onClick={() => handleInputChange('gender', gender.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        formData.gender === gender.id
                          ? 'border-fuchsia-500 bg-fuchsia-500/10'
                          : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                      }`}
                    >
                      <div className="text-2xl mb-2">{gender.icon}</div>
                      <div className="text-white font-medium">{gender.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-zinc-300 text-lg font-medium mb-4 block">Pronouns</Label>
                <div className="flex flex-wrap gap-3">
                  {['he/him', 'she/her', 'they/them', 'he/they', 'she/they', 'ze/zir'].map(pronoun => (
                    <button
                      key={pronoun}
                      onClick={() => handleInputChange('pronouns', pronoun)}
                      className={`px-6 py-3 rounded-full border transition-all ${
                        formData.pronouns === pronoun
                          ? 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      {pronoun}
                    </button>
                  ))}
                </div>
                <Input
                  value={formData.pronouns.includes('/') ? '' : formData.pronouns}
                  onChange={(e) => handleInputChange('pronouns', e.target.value)}
                  className="mt-3 bg-zinc-900 border-zinc-700 text-white"
                  placeholder="Or enter custom pronouns..."
                />
              </div>
            </div>
          </StepCard>
        );

      case 3:
        return (
          <StepCard 
            title="Sexual orientation" 
            subtitle="How do you identify?"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {ORIENTATIONS.map(orientation => (
                <button
                  key={orientation.id}
                  onClick={() => handleInputChange('orientation', orientation.id)}
                  className={`p-6 rounded-xl border-2 transition-all text-center ${
                    formData.orientation === orientation.id
                      ? 'border-fuchsia-500 bg-fuchsia-500/10'
                      : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-white font-medium text-lg">{orientation.label}</div>
                </button>
              ))}
            </div>
          </StepCard>
        );

      case 4:
        return (
          <StepCard 
            title="Who would you like to meet?" 
            subtitle="Select all that apply"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {SEEKING_GENDERS.map(gender => (
                <button
                  key={gender}
                  onClick={() => toggleArrayItem('seeking', gender)}
                  className={`p-6 rounded-xl border-2 transition-all text-center ${
                    formData.seeking.includes(gender)
                      ? 'border-fuchsia-500 bg-fuchsia-500/10'
                      : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-white font-medium">{gender}</div>
                </button>
              ))}
            </div>
            
            {formData.seeking.length > 0 && (
              <div className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <p className="text-green-300 text-sm">
                  Perfect! We'll show you profiles that match your preferences and might be interested in connecting with you.
                </p>
              </div>
            )}
          </StepCard>
        );

      case 5:
        return (
          <StepCard 
            title="What are you looking for?" 
            subtitle="Your relationship goals help us find better matches"
          >
            <div className="space-y-4">
              {RELATIONSHIP_TYPES.map(type => {
                const IconComponent = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => handleInputChange('relationshipType', type.id)}
                    className={`w-full p-6 rounded-xl border-2 transition-all text-left bg-gradient-to-r ${
                      formData.relationshipType === type.id
                        ? 'border-fuchsia-500 bg-fuchsia-500/10'
                        : `border-zinc-700 bg-zinc-900 hover:border-zinc-600 ${type.gradient}`
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-white/5">
                        <IconComponent className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <div className="text-white font-medium text-lg mb-1">{type.label}</div>
                        <div className="text-zinc-400 text-sm">{type.desc}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </StepCard>
        );

      case 6:
        return (
          <StepCard 
            title="Your interests make you unique" 
            subtitle="Select what you're passionate about"
          >
            <div className="space-y-8">
              {INTEREST_CATEGORIES.map(category => (
                <div key={category.name}>
                  <h3 className="text-white font-medium text-lg mb-4">{category.name}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {category.items.map(interest => {
                      const IconComponent = interest.icon;
                      return (
                        <button
                          key={interest.id}
                          onClick={() => toggleArrayItem('interests', interest.id)}
                          className={`p-4 rounded-xl border transition-all text-center ${
                            formData.interests.includes(interest.id)
                              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600'
                          }`}
                        >
                          <IconComponent className="h-6 w-6 mx-auto mb-2" />
                          <div className="text-sm font-medium">{interest.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              <div>
                <Input
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim())
