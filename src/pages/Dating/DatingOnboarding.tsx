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

// Mock data - replace with real Supabase calls
const mockBaseProfile = {
  id: "123",
  username: "johndoe",
  display_name: "John Doe",
  first_name: "John",
  last_name: "Doe",
  dob: "1995-06-15",
  city: "San Francisco",
  avatar_url: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face"
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

const DatingOnboardingWizard = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [totalSteps] = useState(7);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "John Doe",
    city: "San Francisco",
    age: 28,
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
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  const progress = (currentStep / totalSteps) * 100;

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
              <div className="flex justify-center mb-6">
                <Avatar className="h-32 w-32 ring-4 ring-fuchsia-500/30">
                  <AvatarImage src={mockBaseProfile.avatar_url} />
                  <AvatarFallback className="bg-zinc-800 text-2xl text-zinc-300">
                    {formData.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
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
                    <div className="text-zinc-400 text-sm">Age: {formData.age}</div>
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
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      const newInterest = e.target.value.trim();
                      if (!formData.interests.includes(newInterest)) {
                        handleInputChange('interests', [...formData.interests, newInterest]);
                      }
                      e.target.value = '';
                    }
                  }}
                  className="bg-zinc-900 border-zinc-700 text-white"
                  placeholder="Type a custom interest and press Enter..."
                />
              </div>

              {formData.interests.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.interests.map(interest => (
                    <Badge
                      key={interest}
                      className="bg-zinc-800 text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                      onClick={() => toggleArrayItem('interests', interest)}
                    >
                      {interest} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </StepCard>
        );

      case 7:
        return (
          <StepCard 
            title="Add photos and create your video intro" 
            subtitle="Show your personality - video intros get 3x more matches!"
          >
            <div className="space-y-8">
              {/* Photo Upload Section */}
              <div>
                <h3 className="text-white font-medium text-lg mb-4">Photos (2-6 recommended)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {formData.photos.map((photo, index) => (
                    <div key={photo.id} className="relative group">
                      <img
                        src={photo.url}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-48 object-cover rounded-xl"
                      />
                      <button
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      {index === 0 && (
                        <div className="absolute top-2 left-2 bg-fuchsia-500 text-white text-xs px-2 py-1 rounded-full">
                          Main
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {formData.photos.length < 6 && (
                    <label className="border-2 border-dashed border-zinc-700 rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer hover:border-zinc-600 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files[0] && handlePhotoUpload(e.target.files[0])}
                        className="hidden"
                      />
                      {uploadingPhoto ? (
                        <Loader2 className="h-8 w-8 text-fuchsia-500 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-8 w-8 text-zinc-500 mb-2" />
                          <span className="text-zinc-400 text-sm">Add photo</span>
                        </>
                      )}
                    </label>
                  )}
                </div>
              </div>

              {/* Video Intro Section */}
              <div>
                <h3 className="text-white font-medium text-lg mb-4">
                  3-Second Video Intro 
                  <Badge className="ml-2 bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white">
                    <Star className="h-3 w-3 mr-1" />
                    Recommended
                  </Badge>
                </h3>
                
                {!formData.videoIntro ? (
                  <div className="border-2 border-dashed border-fuchsia-500/50 rounded-xl p-8 text-center">
                    <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Camera className="h-8 w-8 text-white" />
                    </div>
                    <h4 className="text-white font-medium mb-2">Create your signature 3-second intro</h4>
                    <p className="text-zinc-400 text-sm mb-4">
                      Show your personality! Profiles with video intros get 3x more matches.
                    </p>
                    <Button 
                      className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
                      disabled={recordingVideo}
                    >
                      {recordingVideo ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Recording...
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4 mr-2" />
                          Record video
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-lg flex items-center justify-center">
                        <Play className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">Video intro ready!</p>
                        <p className="text-zinc-400 text-sm">3.2 seconds • Click to preview</p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleInputChange('videoIntro', null)}
                      >
                        Re-record
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </StepCard>
        );

      default:
        return null;
    }
  };

  const NavigationButtons = () => (
    <div className="flex justify-between items-center w-full max-w-4xl mx-auto mt-8">
      <Button
        variant="outline"
        onClick={prevStep}
        disabled={currentStep === 1}
        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {currentStep === totalSteps ? (
        <Button
          onClick={() => setSaving(true)}
          disabled={saving}
          className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 px-8"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Publishing your profile...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Publish my profile
            </>
          )}
        </Button>
      ) : (
        <Button
          onClick={nextStep}
          className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 px-8"
        >
          Continue
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      )}
    </div>
  );

  const ProfilePreview = () => (
    <div className="fixed right-4 top-4 w-80 max-h-[80vh] overflow-y-auto hidden xl:block">
      <Card className="bg-zinc-950/95 backdrop-blur-sm border-zinc-800 shadow-2xl">
        <CardHeader className="border-b border-zinc-800">
          <CardTitle className="text-white text-sm">Live Preview</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Profile Header */}
            <div className="text-center">
              <Avatar className="h-20 w-20 mx-auto mb-3 ring-2 ring-fuchsia-500/30">
                <AvatarImage src={formData.photos[0]?.url || mockBaseProfile.avatar_url} />
                <AvatarFallback className="bg-zinc-800 text-zinc-300 text-lg">
                  {formData.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <h3 className="text-white font-semibold">
                {formData.name || 'Your name'}{formData.showAge && formData.age ? `, ${formData.age}` : ''}
              </h3>
              <p className="text-zinc-400 text-sm flex items-center justify-center gap-1">
                <MapPin className="h-3 w-3" />
                {formData.city || 'Your city'}
              </p>
            </div>

            {/* Bio */}
            {formData.bio && (
              <div className="text-sm text-zinc-300 bg-zinc-900 rounded-lg p-3">
                {formData.bio}
              </div>
            )}

            {/* Identity */}
            {(formData.gender || formData.pronouns) && (
              <div className="text-xs text-zinc-400">
                {[
                  formData.gender ? GENDER_IDENTITIES.find(g => g.id === formData.gender)?.label : null,
                  formData.pronouns
                ].filter(Boolean).join(' • ')}
              </div>
            )}

            {/* Relationship Type */}
            {formData.relationshipType && (
              <div className="text-xs text-zinc-400">
                Looking for: <span className="text-zinc-300">
                  {RELATIONSHIP_TYPES.find(t => t.id === formData.relationshipType)?.label}
                </span>
              </div>
            )}

            {/* Interests */}
            {formData.interests.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-2">Interests</p>
                <div className="flex flex-wrap gap-1">
                  {formData.interests.slice(0, 6).map(interest => (
                    <Badge key={interest} className="bg-zinc-800 text-zinc-300 text-xs">
                      {interest}
                    </Badge>
                  ))}
                  {formData.interests.length > 6 && (
                    <Badge className="bg-zinc-800 text-zinc-300 text-xs">
                      +{formData.interests.length - 6} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Photo Count */}
            {formData.photos.length > 0 && (
              <div className="text-xs text-zinc-500 text-center">
                {formData.photos.length} photo{formData.photos.length !== 1 ? 's' : ''}
                {formData.videoIntro && ' • Video intro'}
              </div>
            )}

            {/* Completion Status */}
            <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${progress >= 100 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-sm text-white font-medium">
                  {progress >= 100 ? 'Ready to publish!' : 'Keep going...'}
                </span>
              </div>
              <div className="text-xs text-zinc-400">
                Profile strength: {Math.round(progress)}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-fuchsia-500 mx-auto mb-4" />
          <p className="text-zinc-300">Loading your details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-fuchsia-900/20 via-purple-900/10 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-cyan-900/20 via-blue-900/10 to-transparent" />
      
      {/* Header */}
      <div className="relative z-10 border-b border-zinc-800/50 bg-black/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
              <Heart className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Splikz Dating</h1>
              <p className="text-sm text-zinc-400">Create your perfect dating profile</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        <StepIndicator />
        
        <div className="flex gap-6">
          <div className="flex-1">
            {renderStep()}
            <NavigationButtons />
          </div>
        </div>
      </div>

      {/* Live Preview Sidebar */}
      <ProfilePreview />

      {/* Success Modal */}
      {saving && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="bg-zinc-950 border-zinc-700 w-full max-w-md">
            <CardContent className="p-8 text-center">
              <div className="h-16 w-16 bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Publishing your profile...</h3>
              <p className="text-zinc-400 mb-6">
                We're setting up your dating profile and finding your perfect matches.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <Check className="h-4 w-4 text-green-500" />
                  Profile information saved
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <Check className="h-4 w-4 text-green-500" />
                  Photos uploaded
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" />
                  Finding compatible matches...
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DatingOnboardingWizard;
