// src/pages/Dating/DatingHome.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import {
  Heart, Play, Star, Shield, Zap, MessageCircle, Camera, Sparkles, ArrowRight,
  CheckCircle, Lock, MapPin, X, Volume2, Video, Upload
} from "lucide-react";

// ---- helpers ---------------------------------------------------------------
const nameFor = (p?: any) => {
  if (!p) return "Friend";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "Friend";
};

const SplikzDatingHome: React.FC = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [hasDatingProfile, setHasDatingProfile] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [showVideoUpload, setShowVideoUpload] = useState(false);
  const [previewName, setPreviewName] = useState("");
  const [previewBio, setPreviewBio] = useState("");
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [loading, setLoading] = useState(true);

  // Load user + profile + whether a dating profile exists
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;

        const currentUser = data.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          const { data: p } = await supabase
            .from("profiles")
            .select("id, username, display_name, first_name, last_name, avatar_url, city")
            .eq("id", currentUser.id)
            .maybeSingle();

          if (mounted && p) {
            setProfile(p);
            setPreviewName(nameFor(p));
          }

          const { data: dp } = await supabase
            .from("dating_profiles")
            .select("user_id")
            .eq("user_id", currentUser.id)
            .maybeSingle();

          if (mounted) setHasDatingProfile(Boolean(dp));
        } else {
          setProfile(null);
          setPreviewName("");
          setPreviewBio("");
          setHasDatingProfile(false);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // ✅ Auto-redirect when ready
  useEffect(() => {
    if (loading) return;
    if (user && hasDatingProfile) {
      navigate("/dating/discover", { replace: true });
    }
  }, [loading, user, hasDatingProfile, navigate]);

  const avatarInitial =
    profile?.display_name?.[0] ||
    profile?.username?.[0] ||
    user?.email?.[0] ||
    "U";

  // navigation helpers
  const handleNavigateToOnboarding = () => {
    localStorage.setItem(
      "dating_prefill",
      JSON.stringify({ name: previewName, bio: previewBio })
    );
    navigate("/dating/onboarding");
  };

  const handleSignUp = () => navigate("/signup");
  const handleSignIn = () => navigate("/login");

  // While deciding where to send the user, avoid flashing the hero
  if (!user && loading) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* decorative background must not block clicks */}
      <div className="pointer-events-none fixed inset-0 -z-10 select-none" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-fuchsia-900/20 to-cyan-900/30" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_rgba(120,119,198,0.3),_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,_rgba(255,119,198,0.3),_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,_rgba(120,219,255,0.2),_transparent_50%)]" />
      </div>

      {/* hero --------------------------------------------------------------- */}
      <section className="relative z-10 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-4 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left column */}
            <div className="space-y-8">
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

              <div className="space-y-6">
                <h2 className="text-5xl lg:text-6xl font-bold leading-tight">
                  Find your{" "}
                  <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                    perfect match
                  </span>{" "}
                  in 3 seconds
                </h2>

                <p className="text-xl text-zinc-300 leading-relaxed max-w-2xl">
                  Skip the endless scrolling. Share your authentic self through
                  3-second video intros and connect with people who truly vibe with your energy.
                </p>

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

              {/* CTAs */}
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
                ) : hasDatingProfile ? (
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 h-14 px-8 text-lg font-semibold"
                    onClick={() => navigate("/dating/discover")}
                  >
                    Go to Discover
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
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

              {/* trust indicators */}
              {!user && (
                <div className="flex items-center gap-6 pt-6 text-sm text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-400" />
                    <span>Verified profiles</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-blue-400" />
                    <span>Privacy-first</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-fuchsia-400" />
                    <span>100% free to start</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right phone demo (decorative) */}
            <div className="relative">
              <div className="relative max-w-sm mx-auto">
                <div className="relative bg-zinc-900 rounded-[3rem] p-4 shadow-2xl border border-zinc-700">
                  <div className="bg-black rounded-[2.5rem] overflow-hidden">
                    <div className="flex justify-between items-center px-6 py-4 text-white text-sm">
                      <span className="font-medium">9:41</span>
                      <div className="flex gap-1">
                        <div className="w-4 h-2 bg-white rounded-sm" />
                        <div className="w-4 h-2 bg-white rounded-sm" />
                        <div className="w-4 h-2 bg-white/50 rounded-sm" />
                      </div>
                    </div>

                    <div className="px-4 pb-8">
                      <div className="relative rounded-2xl overflow-hidden h-96 mb-4">
                        <img
                          src="https://images.unsplash.com/photo-1494790108755-2616c96b2131?w=400&h=600&fit=crop&crop=face"
                          alt="Dating profile"
                          className="w-full h-full object-cover"
                        />

                        <div className="absolute inset-0 bg-black/20">
                          <button
                            onClick={() => setIsVideoPlaying(!isVideoPlaying)}
                            className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-full p-2"
                          >
                            {isVideoPlaying ? (
                              <Volume2 className="h-4 w-4 text-white" />
                            ) : (
                              <Play className="h-4 w-4 text-white" />
                            )}
                          </button>

                          <div className="absolute top-4 left-4 bg-fuchsia-500/90 backdrop-blur-sm rounded-full px-3 py-1">
                            <span className="text-white text-xs font-medium">3s</span>
                          </div>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                          <h3 className="text-white font-semibold text-lg">Sarah, 28</h3>
                          <p className="text-white/80 text-sm flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            2 miles away
                          </p>
                        </div>
                      </div>

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

      {/* Quick Start modal */}
      {user && !hasDatingProfile && showQuickStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-2xl bg-zinc-900/95 backdrop-blur-sm border-zinc-700 shadow-2xl">
            <CardHeader className="border-b border-zinc-800 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl text-white">
                    Quick start your dating profile
                  </CardTitle>
                  <p className="text-zinc-400 mt-1">We’ll prefill from your Splikz profile</p>
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
                <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-xl">
                  <Avatar className="h-16 w-16 ring-2 ring-fuchsia-500/30">
                    <AvatarImage src={profile?.avatar_url} alt={nameFor(profile)} />
                    <AvatarFallback className="bg-zinc-700 text-white text-lg">
                      {avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-white font-semibold text-lg">{nameFor(profile)}</h3>
                    <p className="text-zinc-400">
                      @{profile?.username || user?.email?.split("@")[0] || "you"}
                    </p>
                  </div>
                </div>

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
                        defaultValue={profile?.city || ""}
                      />
                    </div>
                  </div>
                </div>

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

                <div className="space-y-3">
                  <Button
                    size="lg"
                    className="w-full bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 h-12"
                    onClick={() => {
                      setShowQuickStart(false);
                      setShowVideoUpload(true);
                    }}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Add 3-second intro first
                  </Button>

                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-12"
                    onClick={handleNavigateToOnboarding}
                  >
                    Skip video, continue setup
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowQuickStart(false)}
                    className="w-full text-zinc-500 hover:text-zinc-300"
                  >
                    Maybe later
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Video upload modal */}
      {showVideoUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-lg bg-zinc-900/95 backdrop-blur-sm border-zinc-700 shadow-2xl">
            <CardHeader className="border-b border-zinc-800 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-white flex items-center gap-2">
                    <Camera className="h-5 w-5 text-fuchsia-500" />
                    Add your 3-second intro
                  </CardTitle>
                  <p className="text-zinc-400 mt-1">Show your personality in 3 seconds</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowVideoUpload(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="border-2 border-dashed border-fuchsia-500/50 rounded-xl p-8 text-center bg-gradient-to-br from-fuchsia-500/5 to-purple-500/5">
                  <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Camera className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-white font-medium mb-2">Upload your 3-second intro</h3>
                  <p className="text-zinc-400 text-sm mb-4">
                    MP4, MOV, WebM supported. We’ll automatically trim to 3 seconds.
                  </p>

                  <div className="flex flex-col gap-3">
                    <Button className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500">
                      <Upload className="h-4 w-4 mr-2" />
                      Choose video file
                    </Button>

                    <div className="text-zinc-500 text-xs">or</div>

                    <Button variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-800">
                      <Video className="h-4 w-4 mr-2" />
                      Record with camera
                    </Button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    onClick={() => setShowVideoUpload(false)}
                  >
                    Skip for now
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
                    onClick={() => {
                      setShowVideoUpload(false);
                      handleNavigateToOnboarding();
                    }}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SplikzDatingHome;
