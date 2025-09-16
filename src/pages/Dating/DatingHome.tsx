import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Heart, 
  Play, 
  Star, 
  Shield, 
  Zap, 
  Users, 
  MessageCircle,
  Camera,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Globe,
  Lock,
  Mic,
  Video,
  Coffee,
  Music,
  MapPin,
  Calendar,
  Palette,
  X,
  ChevronDown,
  Eye,
  EyeOff,
  Volume2
} from "lucide-react";

// Mock data - replace with real Supabase calls
const mockProfile = {
  id: "123",
  username: "johndoe",
  display_name: "John Doe",
  first_name: "John",
  last_name: "Doe",
  avatar_url: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face"
};

const mockUser = { id: "123", email: "john@example.com" };

const SplikzDatingHome = () => {
  const [user, setUser] = useState(mockUser); // Set to null for signed-out state
  const [profile, setProfile] = useState(mockProfile);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [previewName, setPreviewName] = useState("John Doe");
  const [previewBio, setPreviewBio] = useState("");
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);

  const nameFor = (p) => {
    if (!p) return "Friend";
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return p.display_name?.trim() || full || p.username?.trim() || "Friend";
  };

  const avatarInitial = profile?.display_name?.[0] || profile?.username?.[0] || user?.email?.[0] || "U";

  const handleNavigateToOnboarding = () => {
    // Store prefill data and navigate to onboarding
    localStorage.setItem("dating_prefill", JSON.stringify({ 
      name: previewName, 
      bio: previewBio 
    }));
    // In real app: navigate("/dating/onboarding");
    alert("Navigating to onboarding wizard...");
  };

  const handleSignUp = () => {
    // In real app: navigate("/signup");
    alert("Navigating to sign up...");
  };

  const handleSignIn = () => {
    // In real app: navigate("/login");
    alert("Navigating to sign in...");
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-fuchsia-900/20 to-cyan-900/30" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_rgba(120,119,198,0.3),_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,_rgba(255,119,198,0.3),_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,_rgba(120,219,255,0.2),_transparent_50%)]" />
        
        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          />
        ))}
      </div>

      {/* Hero Section */}
      <section className="relative z-10 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-4 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              {/* Brand Header */}
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/25">
                  <Heart className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-white via-fuchsia-200 to-purple-200 bg-clip-text text-transparent">
                    Splikz Dating
                  </h1>
                  <p className="text-zinc-400 text-lg">The 3-second connection revolution</p>
                </div>
              </div>

              {/* Main Headline */}
              <div className="space-y-6">
                <h2 className="text-5xl lg:text-6xl font-bold leading-tight">
                  Find your
                  <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                    {" "}perfect match{" "}
                  </span>
                  in 3 seconds
                </h2>
                
                <p className="text-xl text-zinc-300 leading-relaxed max-w-2xl">
                  Skip the endless scrolling. Share your authentic self through 3-second video intros 
                  and connect with people who truly vibe with your energy.
                </p>

                {/* Key Features */}
                <div className="flex gap-8 pt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-fuchsia-400">3s</div>
                    <div className="text-sm text-zinc-400">Video intros</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">AI</div>
                    <div className="text-sm text-zinc-400">Powered matching</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-cyan-400">100%</div>
                    <div className="text-sm text-zinc-400">Free to start</div>
                  </div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                {!user ? (
                  <>
                    <Button 
                      size="lg" 
                      className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 h-14 px-8 text-lg font-semibold shadow-lg shadow-fuchsia-500/25"
                      onClick={handleSignUp}
                    >
                      Start dating for free
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                    <Button 
                      size="lg" 
                      variant="outline" 
                      className="h-14 px-8 text-lg border-white/20 text-white hover:bg-white/10 backdrop-blur-sm"
                      onClick={handleSignIn}
                    >
                      Sign in
                    </Button>
                  </>
                ) : (
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 h-14 px-8 text-lg font-semibold shadow-lg shadow-fuchsia-500/25"
                    onClick={() => setShowQuickStart(true)}
                  >
                    Create my dating profile
                    <Sparkles className="ml-2 h-5 w-5" />
                  </Button>
                )}
              </div>

              {/* Trust Indicators */}
              {!user && (
                <div className="flex items-center gap-6 pt-6 text-sm text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-400" />
                    <span>Verified profiles</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-blue-400" />
                    <span>End-to-end encrypted</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-fuchsia-400" />
                    <span>100% free to start</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Content - Interactive Demo */}
            <div className="relative">
              <div className="relative max-w-sm mx-auto">
                {/* Phone Frame */}
                <div className="relative bg-zinc-900 rounded-[3rem] p-4 shadow-2xl border border-zinc-700">
                  <div className="bg-black rounded-[2.5rem] overflow-hidden">
                    {/* Status Bar */}
                    <div className="flex justify-between items-center px-6 py-4 text-white text-sm">
                      <span className="font-medium">9:41</span>
                      <div className="flex gap-1">
                        <div className="w-4 h-2 bg-white rounded-sm"></div>
                        <div className="w-4 h-2 bg-white rounded-sm"></div>
                        <div className="w-4 h-2 bg-white/50 rounded-sm"></div>
                      </div>
                    </div>

                    {/* App Content */}
                    <div className="px-4 pb-8">
                      {/* Profile Card */}
                      <div className="relative rounded-2xl overflow-hidden h-96 mb-4">
                        <img
                          src="https://images.unsplash.com/photo-1494790108755-2616c96b2131?w=400&h=600&fit=crop&crop=face"
                          alt="Dating profile"
                          className="w-full h-full object-cover"
                        />
                        
                        {/* Video Play Overlay */}
                        <div className="absolute inset-0 bg-black/20">
                          <button
                            onClick={() => setIsVideoPlaying(!isVideoPlaying)}
                            className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-full p-2"
                          >
                            {isVideoPlaying ? 
                              <Volume2 className="h-4 w-4 text-white" /> : 
                              <Play className="h-4 w-4 text-white" />
                            }
                          </button>
                          
                          {/* 3-second indicator */}
                          <div className="absolute top-4 left-4 bg-fuchsia-500/90 backdrop-blur-sm rounded-full px-3 py-1">
                            <span className="text-white text-xs font-medium">3s</span>
                          </div>
                        </div>

                        {/* Profile Info Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                          <h3 className="text-white font-semibold text-lg">Sarah, 28</h3>
                          <p className="text-white/80 text-sm flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            2 miles away
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-center gap-4">
                        <button className="h-14 w-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                          <X className="h-6 w-6 text-white" />
                        </button>
                        <button className="h-16 w-16 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/25">
                          <Heart className="h-7 w-7 text-white" />
                        </button>
                        <button className="h-14 w-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                          <Star className="h-6 w-6 text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Elements */}
                <div className="absolute -top-4 -left-4 bg-green-500 rounded-full p-3 animate-pulse">
                  <MessageCircle className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-4 -right-4 bg-fuchsia-500 rounded-full p-3 animate-bounce">
                  <Heart className="h-5 w-5 text-white" />
                </div>
                <div className="absolute top-1/2 -right-8 bg-cyan-500 rounded-full p-2">
                  <Zap className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      {!user && (
        <section className="relative z-10 py-20 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-4">Why Splikz Dating is different</h2>
              <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
                We've reimagined online dating from the ground up
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Video,
                  title: "3-Second Video Intros",
                  description: "Skip the small talk. Show your personality instantly with authentic video moments that capture your real energy.",
                  gradient: "from-fuchsia-500/20 to-purple-500/20",
                  border: "border-fuchsia-500/30"
                },
                {
                  icon: Zap,
                  title: "Instant Chemistry",
                  description: "Our AI matches you based on energy compatibility, not just photos. Find people who truly vibe with you.",
                  gradient: "from-cyan-500/20 to-blue-500/20",
                  border: "border-cyan-500/30"
                },
                {
                  icon: Shield,
                  title: "Verified & Safe",
                  description: "Every profile is verified. Report inappropriate behavior instantly. Your safety is our top priority.",
                  gradient: "from-green-500/20 to-emerald-500/20",
                  border: "border-green-500/30"
                }
              ].map((feature, index) => {
                const IconComponent = feature.icon;
                return (
                  <Card key={index} className={`bg-gradient-to-br ${feature.gradient} border ${feature.border} backdrop-blur-sm hover:scale-105 transition-transform duration-300`}>
                    <CardHeader className="text-center pb-4">
                      <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                        <IconComponent className="h-8 w-8 text-white" />
                      </div>
                      <CardTitle className="text-white text-xl">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-zinc-300 text-center leading-relaxed">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Quick Start Modal */}
      {user && showQuickStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-2xl bg-zinc-900/95 backdrop-blur-sm border-zinc-700 shadow-2xl">
            <CardHeader className="border-b border-zinc-800 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl text-white">Quick start your dating profile</CardTitle>
                  <p className="text-zinc-400 mt-1">We'll prefill from your Splikz profile</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQuickStart(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="p-8">
              <div className="space-y-6">
                {/* Profile Preview */}
                <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-xl">
                  <Avatar className="h-16 w-16 ring-2 ring-fuchsia-500/30">
                    <AvatarImage src={profile?.avatar_url} alt={nameFor(profile)} />
                    <AvatarFallback className="bg-zinc-700 text-white text-lg">
                      {avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-white font-semibold text-lg">{nameFor(profile)}</h3>
                    <p className="text-zinc-400">@{profile?.username || user?.email?.split("@")[0] || "you"}</p>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-zinc-300 font-medium">Dating display name</Label>
                    <Input
                      value={previewName}
                      onChange={(e) => setPreviewName(e.target.value)}
                      className="mt-2 bg-zinc-800 border-zinc-700 text-white h-12"
                      placeholder="How should people know you?"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-300 font-medium">Location</Label>
                    <div className="relative mt-2">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <Input
                        className="pl-10 bg-zinc-800 border-zinc-700 text-white h-12"
                        placeholder="Your city"
                        defaultValue="San Francisco, CA"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-zinc-300 font-medium">Quick bio</Label>
                  <Textarea
                    value={previewBio}
                    onChange={(e) => setPreviewBio(e.target.value)}
                    className="mt-2 bg-zinc-800 border-zinc-700 text-white min-h-[100px] resize-none"
                    placeholder="Share your vibe, interests, what makes you unique..."
                  />
                </div>

                {/* Premium Features Teaser */}
                <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-500 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <h4 className="text-white font-medium">Complete onboarding for:</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>3-second video intro</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>Smart compatibility matching</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>Advanced preferences</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>Priority profile visibility</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-4">
                  <Button
                    size="lg"
                    className="flex-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 h-12"
                    onClick={handleNavigateToOnboarding}
                  >
                    Continue to full setup
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setShowQuickStart(false)}
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-12"
                  >
                    Maybe later
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Success Stories Section */}
      {!user && (
        <section className="relative z-10 py-20">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-4">Real connections, real stories</h2>
              <p className="text-xl text-zinc-400">Join thousands who found love through 3-second moments</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&h=300&fit=crop&crop=face",
                  name: "Emma & Jake",
                  story: "Matched through our 3-second video intros. His laugh in that tiny clip told me everything I needed to know.",
                  time: "Together 8 months"
                },
                {
                  image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop&crop=face",
                  name: "Marcus & Riley",
                  story: "The energy matching feature is incredible. We both love late-night coffee runs and jazz music.",
                  time: "Engaged!"
                },
                {
                  image: "https://images.unsplash.com/photo-1494790108755-2616c96b2131?w=300&h=300&fit=crop&crop=face",
                  name: "Sarah & Alex",
                  story: "Finally, a dating app that shows personality first. We connected over our shared love for hiking.",
                  time: "Together 1 year"
                }
              ].map((story, index) => (
                <Card key={index} className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm hover:bg-zinc-900/80 transition-colors">
                  <CardContent className="p-6 text-center">
                    <img
                      src={story.image}
                      alt={story.name}
                      className="w-20 h-20 rounded-full mx-auto mb-4 object-cover ring-2 ring-fuchsia-500/30"
                    />
                    <h3 className="text-white font-semibold text-lg mb-2">{story.name}</h3>
                    <p className="text-zinc-300 mb-3">"{story.story}"</p>
                    <Badge className="bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30">
                      {story.time}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      {!user && (
        <section className="relative z-10 py-20 border-t border-white/5">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-5xl font-bold mb-6">
              Your perfect match is 
              <span className="bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">
                {" "}3 seconds away
              </span>
            </h2>
            <p className="text-xl text-zinc-300 mb-8 max-w-2xl mx-auto">
              Join millions who've discovered that authentic connections happen in moments, not messages.
            </p>
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 h-16 px-12 text-xl font-semibold shadow-lg shadow-fuchsia-500/25"
              onClick={handleSignUp}
            >
              Start your love story today
              <Heart className="ml-3 h-6 w-6" />
            </Button>
            <p className="text-sm text-zinc-500 mt-4">Free to join • No credit card required</p>
          </div>
        </section>
      )}
    </div>
  );
};

export default SplikzDatingHome;
