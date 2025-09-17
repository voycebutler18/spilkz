import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Heart, 
  MapPin, 
  User, 
  Calendar,
  Users,
  Coffee,
  Music,
  Camera,
  Gamepad2,
  Book,
  Plane,
  Dumbbell,
  Palette,
  Mountain,
  Baby,
  GraduationCap,
  Ruler,
  Wine,
  Cigarette,
  ChevronDown,
  Play,
  Sparkles,
  ArrowRight,
  Lock,
  Shield,
  Zap,
  MessageCircle,
  Star,
  X
} from 'lucide-react';

const SplikzDatingHome = () => {
  const navigate = useNavigate();
  const [showSignup, setShowSignup] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  
  // Signup form state
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: '',
    seeking: '',
    location: '',
    locationEnabled: false,
    searchDistance: 25,
    ageRangeMin: 21,
    ageRangeMax: 35,
    relationshipGoal: '',
    hasKids: '',
    wantsKids: '',
    height: '',
    bodyType: '',
    education: '',
    religion: '',
    drinking: '',
    smoking: '',
    exercise: '',
    pets: '',
    interests: [],
    hobbies: []
  });

  const INTERESTS = [
    { id: 'music', label: 'Music', icon: Music },
    { id: 'travel', label: 'Travel', icon: Plane },
    { id: 'fitness', label: 'Fitness', icon: Dumbbell },
    { id: 'art', label: 'Art', icon: Palette },
    { id: 'gaming', label: 'Gaming', icon: Gamepad2 },
    { id: 'reading', label: 'Reading', icon: Book },
    { id: 'coffee', label: 'Coffee', icon: Coffee },
    { id: 'outdoors', label: 'Outdoors', icon: Mountain }
  ];

  const HOBBIES = [
    'Cooking', 'Photography', 'Dancing', 'Hiking', 'Yoga', 'Writing',
    'Movies', 'Sports', 'Concerts', 'Museums', 'Volunteering', 'Gardening'
  ];

  const requestLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({ 
            ...prev, 
            locationEnabled: true,
            location: `${position.coords.latitude}, ${position.coords.longitude}`
          }));
        },
        (error) => {
          alert('Location access is required to find matches near you.');
        }
      );
    }
  };

  const toggleInterest = (interest) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const toggleHobby = (hobby) => {
    setFormData(prev => ({
      ...prev,
      hobbies: prev.hobbies.includes(hobby)
        ? prev.hobbies.filter(h => h !== hobby)
        : [...prev.hobbies, hobby]
    }));
  };

  const canSubmit = formData.name && formData.age && formData.gender && 
                   formData.seeking && formData.locationEnabled && 
                   formData.relationshipGoal && formData.height && 
                   formData.bodyType && formData.drinking && 
                   formData.smoking && formData.exercise;

  const handleSubmit = () => {
    if (canSubmit) {
      // Save form data and navigate to photo upload
      localStorage.setItem('dating_signup_data', JSON.stringify(formData));
      navigate('/dating/onboarding');
    }
  };

  if (showSignup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center">
                <Heart className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-white">Join Splikz Dating</h1>
            </div>
            <p className="text-zinc-300">Find your perfect match with our smart compatibility system</p>
          </div>

          <div className="space-y-8">
            {/* Basic Info */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Basic Information
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Name *</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="bg-zinc-900 border-zinc-600 text-white"
                      placeholder="Your first name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Age *</label>
                    <Input
                      type="number"
                      value={formData.age}
                      onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                      className="bg-zinc-900 border-zinc-600 text-white"
                      placeholder="25"
                      min="18"
                      max="99"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">I am *</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select gender</option>
                      <option value="man">Man</option>
                      <option value="woman">Woman</option>
                      <option value="non-binary">Non-binary</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Looking for *</label>
                    <select
                      value={formData.seeking}
                      onChange={(e) => setFormData(prev => ({ ...prev, seeking: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select preference</option>
                      <option value="men">Men</option>
                      <option value="women">Women</option>
                      <option value="everyone">Everyone</option>
                    </select>
                  </div>
                </div>

                {/* Location */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Location *</label>
                  {!formData.locationEnabled ? (
                    <Button
                      onClick={requestLocation}
                      className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      Enable Location Access
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 text-green-400">
                      <MapPin className="h-4 w-4" />
                      Location enabled
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Search Preferences */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Search Preferences
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Distance</label>
                    <select
                      value={formData.searchDistance}
                      onChange={(e) => setFormData(prev => ({ ...prev, searchDistance: parseInt(e.target.value) }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value={10}>10 miles</option>
                      <option value={25}>25 miles</option>
                      <option value={50}>50 miles</option>
                      <option value={100}>100 miles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Age Range</label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={formData.ageRangeMin}
                        onChange={(e) => setFormData(prev => ({ ...prev, ageRangeMin: parseInt(e.target.value) }))}
                        className="bg-zinc-900 border-zinc-600 text-white"
                        min="18"
                        max="99"
                      />
                      <span className="text-white self-center">to</span>
                      <Input
                        type="number"
                        value={formData.ageRangeMax}
                        onChange={(e) => setFormData(prev => ({ ...prev, ageRangeMax: parseInt(e.target.value) }))}
                        className="bg-zinc-900 border-zinc-600 text-white"
                        min="18"
                        max="99"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Looking for *</label>
                    <select
                      value={formData.relationshipGoal}
                      onChange={(e) => setFormData(prev => ({ ...prev, relationshipGoal: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select goal</option>
                      <option value="marriage">Marriage</option>
                      <option value="relationship">Long-term relationship</option>
                      <option value="dating">Dating</option>
                      <option value="casual">Something casual</option>
                      <option value="open">Open to anything</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Personal Details */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Personal Details</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Kids</label>
                    <select
                      value={formData.hasKids}
                      onChange={(e) => setFormData(prev => ({ ...prev, hasKids: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select option</option>
                      <option value="none">Don't have kids</option>
                      <option value="have">Have kids</option>
                      <option value="want">Want kids</option>
                      <option value="dont-want">Don't want kids</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Height *</label>
                    <select
                      value={formData.height}
                      onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select height</option>
                      <option value="4'11\"">4'11"</option>
                      <option value="5'0\"">5'0"</option>
                      <option value="5'1\"">5'1"</option>
                      <option value="5'2\"">5'2"</option>
                      <option value="5'3\"">5'3"</option>
                      <option value="5'4\"">5'4"</option>
                      <option value="5'5\"">5'5"</option>
                      <option value="5'6\"">5'6"</option>
                      <option value="5'7\"">5'7"</option>
                      <option value="5'8\"">5'8"</option>
                      <option value="5'9\"">5'9"</option>
                      <option value="5'10\"">5'10"</option>
                      <option value="5'11\"">5'11"</option>
                      <option value="6'0\"">6'0"</option>
                      <option value="6'1\"">6'1"</option>
                      <option value="6'2\"">6'2"</option>
                      <option value="6'3\"">6'3"</option>
                      <option value="6'4\"">6'4"</option>
                      <option value="6'5\"+">6'5"+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Body Type *</label>
                    <select
                      value={formData.bodyType}
                      onChange={(e) => setFormData(prev => ({ ...prev, bodyType: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select body type</option>
                      <option value="slim">Slim</option>
                      <option value="athletic">Athletic</option>
                      <option value="average">Average</option>
                      <option value="curvy">Curvy</option>
                      <option value="plus-size">Plus size</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Education</label>
                    <select
                      value={formData.education}
                      onChange={(e) => setFormData(prev => ({ ...prev, education: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select education</option>
                      <option value="high-school">High School</option>
                      <option value="some-college">Some College</option>
                      <option value="bachelors">Bachelor's Degree</option>
                      <option value="masters">Master's Degree</option>
                      <option value="phd">PhD/Doctorate</option>
                      <option value="prefer-not-say">Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Religion</label>
                    <select
                      value={formData.religion}
                      onChange={(e) => setFormData(prev => ({ ...prev, religion: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select religion</option>
                      <option value="christian">Christian</option>
                      <option value="muslim">Muslim</option>
                      <option value="jewish">Jewish</option>
                      <option value="hindu">Hindu</option>
                      <option value="buddhist">Buddhist</option>
                      <option value="spiritual">Spiritual</option>
                      <option value="agnostic">Agnostic</option>
                      <option value="atheist">Atheist</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-say">Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Pets</label>
                    <select
                      value={formData.pets}
                      onChange={(e) => setFormData(prev => ({ ...prev, pets: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select option</option>
                      <option value="dog">Dog lover</option>
                      <option value="cat">Cat lover</option>
                      <option value="both">Love both</option>
                      <option value="other">Other pets</option>
                      <option value="none">No pets</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lifestyle */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Lifestyle</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Drinking *</label>
                    <select
                      value={formData.drinking}
                      onChange={(e) => setFormData(prev => ({ ...prev, drinking: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select option</option>
                      <option value="never">Never</option>
                      <option value="socially">Socially</option>
                      <option value="occasionally">Occasionally</option>
                      <option value="regularly">Regularly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Smoking *</label>
                    <select
                      value={formData.smoking}
                      onChange={(e) => setFormData(prev => ({ ...prev, smoking: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select option</option>
                      <option value="never">Never</option>
                      <option value="socially">Socially</option>
                      <option value="regularly">Regularly</option>
                      <option value="trying-to-quit">Trying to quit</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Exercise *</label>
                    <select
                      value={formData.exercise}
                      onChange={(e) => setFormData(prev => ({ ...prev, exercise: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-md px-3 py-2 text-white"
                    >
                      <option value="">Select option</option>
                      <option value="daily">Daily</option>
                      <option value="few-times-week">Few times a week</option>
                      <option value="weekly">Weekly</option>
                      <option value="occasionally">Occasionally</option>
                      <option value="never">Never</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Interests */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Interests (Optional)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {INTERESTS.map(interest => {
                    const Icon = interest.icon;
                    const isSelected = formData.interests.includes(interest.id);
                    return (
                      <button
                        key={interest.id}
                        onClick={() => toggleInterest(interest.id)}
                        className={`p-3 rounded-lg border transition-all ${
                          isSelected 
                            ? 'border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-300' 
                            : 'border-zinc-600 hover:border-zinc-500 text-zinc-300'
                        }`}
                      >
                        <Icon className="h-5 w-5 mx-auto mb-1" />
                        <div className="text-sm">{interest.label}</div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Hobbies */}
            <Card className="bg-black/40 border-zinc-700 backdrop-blur">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Hobbies (Optional)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {HOBBIES.map(hobby => {
                    const isSelected = formData.hobbies.includes(hobby);
                    return (
                      <button
                        key={hobby}
                        onClick={() => toggleHobby(hobby)}
                        className={`p-3 rounded-lg border transition-all text-sm ${
                          isSelected 
                            ? 'border-purple-500 bg-purple-500/20 text-purple-300' 
                            : 'border-zinc-600 hover:border-zinc-500 text-zinc-300'
                        }`}
                      >
                        {hobby}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="text-center">
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white px-8 py-3 text-lg disabled:opacity-50"
              >
                Continue to Photo Upload
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              {!canSubmit && (
                <p className="text-zinc-400 text-sm mt-2">
                  Please fill in all required fields marked with *
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main landing page
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-fuchsia-900/20" />
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 left-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-40 right-20 w-96 h-96 bg-fuchsia-500/10 rounded-full blur-3xl animate-pulse delay-700" />
          <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>
      </div>

      <div className="relative z-10">
        {/* Hero Section */}
        <div className="container mx-auto px-4 py-12 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center min-h-screen lg:min-h-0">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Heart className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-white to-fuchsia-200 bg-clip-text text-transparent">
                      Splikz Dating
                    </h1>
                    <p className="text-zinc-400 text-lg">3-second connections that matter</p>
                  </div>
                </div>

                <h2 className="text-5xl lg:text-7xl font-bold leading-tight">
                  Find love in{' '}
                  <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                    3 seconds
                  </span>
                </h2>

                <p className="text-xl lg:text-2xl text-zinc-300 leading-relaxed">
                  Skip the endless swiping. Connect through authentic 3-second video intros and 
                  discover people who match your energy and vibe.
                </p>
              </div>

              {/* Stats */}
              <div className="flex gap-8 py-6">
                <div className="text-center">
                  <div className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">3s</div>
                  <div className="text-zinc-400">Video intros</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">AI</div>
                  <div className="text-zinc-400">Smart matching</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-fuchsia-400 bg-clip-text text-transparent">Free</div>
                  <div className="text-zinc-400">To get started</div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={() => setShowSignup(true)}
                  size="lg"
                  className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 h-16 px-8 text-lg font-semibold shadow-xl"
                >
                  <Sparkles className="mr-2 h-5 w-5" />
                  Start Dating for Free
                </Button>
                <Button
                  variant="outline"
                  size="lg" 
                  className="h-16 px-8 text-lg border-white/20 text-white hover:bg-white/10 backdrop-blur"
                >
                  Watch Demo
                  <Play className="ml-2 h-5 w-5" />
                </Button>
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-400">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-400" />
                  <span>Verified profiles</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-blue-400" />
                  <span>Privacy protected</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-fuchsia-400" />
                  <span>Instant connections</span>
                </div>
              </div>
            </div>

            {/* Right - Phone Mockup */}
            <div className="relative lg:flex justify-center">
              <div className="relative">
                {/* Phone Frame */}
                <div className="relative bg-zinc-900 rounded-[3rem] p-2 shadow-2xl border border-zinc-700 max-w-sm mx-auto">
                  <div className="bg-black rounded-[2.5rem] overflow-hidden">
                    {/* Status Bar */}
                    <div className="flex justify-between items-center px-6 py-3 text-white text-sm">
                      <span className="font-medium">9:41</span>
                      <div className="flex gap-1">
                        <div className="w-4 h-2 bg-white rounded-sm" />
                        <div className="w-4 h-2 bg-white rounded-sm" />
                        <div className="w-4 h-2 bg-white/50 rounded-sm" />
                      </div>
                    </div>

                    {/* App Content */}
                    <div className="px-4 pb-6">
                      {/* Profile Card */}
                      <div className="relative rounded-2xl overflow-hidden h-[400px] mb-4 bg-gradient-to-br from-fuchsia-500/20 to-purple-500/20">
                        <img
                          src="https://images.unsplash.com/photo-1494790108755-2616c96b2131?w=400&h=600&fit=crop&crop=face"
                          alt="Dating profile example"
                          className="w-full h-full object-cover"
                        />
                        
                        {/* Video Play Overlay */}
                        <div className="absolute inset-0 bg-black/20">
                          <button
                            onClick={() => setIsVideoPlaying(!isVideoPlaying)}
                            className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-full p-2 hover:bg-black/70 transition-colors"
                          >
                            {isVideoPlaying ? (
                              <div className="h-4 w-4 text-white animate-pulse">♪</div>
                            ) : (
                              <Play className="h-4 w-4 text-white" />
                            )}
                          </button>

                          <div className="absolute top-4 left-4 bg-fuchsia-500/90 backdrop-blur-sm rounded-full px-3 py-1 animate-pulse">
                            <span className="text-white text-xs font-bold">3s</span>
                          </div>
                        </div>

                        {/* Profile Info Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                          <h3 className="text-white font-bold text-xl">Emma, 24</h3>
                          <p className="text-white/90 text-sm flex items-center gap-1 mb-2">
                            <MapPin className="h-3 w-3" />
                            1.2 miles away
                          </p>
                          <div className="flex gap-2">
                            <span className="text-xs bg-white/20 backdrop-blur rounded-full px-2 py-1 text-white">
                              Photography
                            </span>
                            <span className="text-xs bg-white/20 backdrop-blur rounded-full px-2 py-1 text-white">
                              Travel
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-center gap-4">
                        <button className="h-14 w-14 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center hover:bg-zinc-700 transition-colors">
                          <X className="h-6 w-6 text-zinc-400" />
                        </button>
                        <button className="h-16 w-16 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 flex items-center justify-center shadow-xl shadow-fuchsia-500/25 hover:shadow-fuchsia-500/40 transition-all transform hover:scale-105">
                          <Heart className="h-7 w-7 text-white" />
                        </button>
                        <button className="h-14 w-14 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center hover:bg-zinc-700 transition-colors">
                          <Star className="h-6 w-6 text-zinc-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Elements */}
                <div className="absolute -top-4 -left-4 bg-green-500 rounded-full p-3 animate-bounce">
                  <MessageCircle className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-4 -right-4 bg-purple-500 rounded-full p-3 animate-pulse">
                  <Heart className="h-5 w-5 text-white" />
                </div>
                <div className="absolute top-1/3 -right-6 bg-cyan-500 rounded-full p-2 animate-ping">
                  <Zap className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="container mx-auto px-4 py-20 border-t border-zinc-800/50">
          <div className="text-center mb-16">
            <h3 className="text-4xl font-bold text-white mb-4">
              Why Splikz Dating Works
            </h3>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Revolutionary features designed to help you find genuine connections faster than ever
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-zinc-900/50 border-zinc-700/50 backdrop-blur hover:bg-zinc-900/70 transition-all">
              <CardContent className="p-8 text-center">
                <div className="h-16 w-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center">
                  <Camera className="h-8 w-8 text-white" />
                </div>
                <h4 className="text-xl font-bold text-white mb-4">3-Second Video Intros</h4>
                <p className="text-zinc-400">
                  Show your real personality instantly. No more guessing what someone is really like from photos alone.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-700/50 backdrop-blur hover:bg-zinc-900/70 transition-all">
              <CardContent className="p-8 text-center">
                <div className="h-16 w-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500 to-cyan-600 flex items-center justify-center">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <h4 className="text-xl font-bold text-white mb-4">AI-Powered Matching</h4>
                <p className="text-zinc-400">
                  Our smart algorithm learns your preferences and connects you with highly compatible matches nearby.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-700/50 backdrop-blur hover:bg-zinc-900/70 transition-all">
              <CardContent className="p-8 text-center">
                <div className="h-16 w-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-fuchsia-600 flex items-center justify-center">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <h4 className="text-xl font-bold text-white mb-4">Safe & Verified</h4>
                <p className="text-zinc-400">
                  Every profile is verified. Advanced safety features and community guidelines keep you protected.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-zinc-800/50 py-12">
          <div className="container mx-auto px-4 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center">
                <Heart className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-bold text-white">Splikz Dating</span>
            </div>
            <p className="text-zinc-400 mb-6">Find your perfect match in 3 seconds</p>
            <div className="flex justify-center gap-6 text-sm text-zinc-500">
              <a href="#" className="hover:text-zinc-300 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-zinc-300 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-zinc-300 transition-colors">Support</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SplikzDatingHome;
