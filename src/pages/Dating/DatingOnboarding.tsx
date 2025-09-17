// src/pages/Dating/DatingOnboarding.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Heart,
  Camera,
  Upload,
  X,
  Plus,
  Sparkles,
  ArrowRight,
  MapPin,
  Loader2,
  Play,
  CheckCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

/**
 * This onboarding page is 3 simple steps with proper validation:
 * 1) Bio (typing is fully controlled and stable)
 * 2) Media (photos + optional 3s video) - REAL UPLOADS
 * 3) Preview + Publish
 *
 * Now includes:
 * - Age restriction (18+ only)
 * - Browser geolocation
 * - Real file uploads to Supabase
 * - Dating-specific user filtering
 */

type SignupData = {
  name: string;
  age: string;
  gender: string;
  seeking: string;
  location: string; // or "lat,lng"
  city?: string;
};

type TempPhoto = { id: number; url: string; file: File };
type TempVideo = { url: string; file: File };

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const DatingOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // ---- seed from localStorage written by dating home ----
  const [seed, setSeed] = useState<SignupData | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // ---- local form state (kept minimal & stable) ----
  const [bio, setBio] = useState("");
  const [photos, setPhotos] = useState<TempPhoto[]>([]);
  const [videoIntro, setVideoIntro] = useState<TempVideo | null>(null);

  // Location state
  const [locationPermission, setLocationPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [locationError, setLocationError] = useState<string>("");

  // UX state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load seed and verify age
  useEffect(() => {
    const loadSeed = async () => {
      try {
        const raw = localStorage.getItem("dating_signup_data");
        if (!raw) {
          navigate("/dating", { replace: true });
          return;
        }
        const parsed = JSON.parse(raw) as SignupData;
        
        // Age verification - must be 18+
        const age = parseInt(parsed.age);
        if (isNaN(age) || age < 18) {
          toast({
            title: "Age Restriction",
            description: "You must be 18 or older to use the dating feature.",
            variant: "destructive",
          });
          navigate("/dating", { replace: true });
          return;
        }
        
        setSeed(parsed);
        setAgeVerified(true);
        
        // Auto-request location permission
        requestLocation();
      } catch {
        navigate("/dating", { replace: true });
      }
    };
    
    loadSeed();
  }, [navigate, toast]);

  // Request browser geolocation
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser.");
      setLocationPermission('denied');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationPermission('granted');
        toast({
          title: "Location enabled",
          description: "We'll show you people nearby!",
        });
      },
      (error) => {
        let message = "Location access denied.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = "Location access denied. Enable location to see people nearby.";
            break;
          case error.POSITION_UNAVAILABLE:
            message = "Location information unavailable.";
            break;
          case error.TIMEOUT:
            message = "Location request timed out.";
            break;
        }
        setLocationError(message);
        setLocationPermission('denied');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      }
    );
  };

  // Upload file to Supabase storage
  const uploadFile = async (file: File, isVideo: boolean = false): Promise<string> => {
    const bucket = isVideo ? 'dating_videos' : 'dating_photos';
    if (!currentUser) throw new Error("Must be logged in to upload");
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);
    
    if (uploadError) throw uploadError;
    
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);
    
    return data.publicUrl;
  };

  // -------- helpers (photos / video) --------
  const addPhoto = async (file: File) => {
    if (photos.length >= 6) {
      toast({
        title: "Photo limit reached",
        description: "You can upload up to 6 photos.",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload image files only (JPG, PNG, WEBP, GIF).",
        variant: "destructive",
      });
      return;
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Images must be under 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const url = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { id: Date.now(), url, file }]);
      toast({
        title: "Photo added",
        description: "Photo will be uploaded when you publish your profile.",
      });
    } catch (error) {
      toast({
        title: "Error adding photo",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (id: number) => {
    setPhotos((prev) => {
      const photo = prev.find(p => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.url);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const addVideoIntro = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload video files only (MP4, MOV, WebM).",
        variant: "destructive",
      });
      return;
    }

    // Check file size (50MB limit)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Videos must be under 50MB.",
        variant: "destructive",
      });
      return;
    }

    if (videoIntro) {
      URL.revokeObjectURL(videoIntro.url);
    }

    const url = URL.createObjectURL(file);
    setVideoIntro({ url, file });
    toast({
      title: "Video added",
      description: "Video will be processed to 3 seconds when you publish.",
    });
  };

  const removeVideoIntro = () => {
    if (videoIntro) {
      URL.revokeObjectURL(videoIntro.url);
      setVideoIntro(null);
    }
  };

  // -------- step validation (memo so it doesn't thrash focus) --------
  const canContinue = useMemo(() => {
    if (step === 1) return bio.trim().length >= 20;
    if (step === 2) return photos.length > 0 || !!videoIntro;
    return true;
  }, [step, bio, photos.length, videoIntro]);

  const progress = useMemo(() => (step / 3) * 100, [step]);

  const next = () => (step < 3 ? setStep((s) => (clamp(s + 1, 1, 3) as 1 | 2 | 3)) : publish());
  const prev = () => (step > 1 ? setStep((s) => (clamp(s - 1, 1, 3) as 1 | 2 | 3)) : navigate("/dating"));

  // -------- publish (REAL save with uploads) --------
  async function publish() {
    if (!seed || !currentUser || !ageVerified) return;
    
    setSaving(true);

    try {
      // Upload all photos
      const uploadedPhotos: string[] = [];
      for (const photo of photos) {
        try {
          const photoUrl = await uploadFile(photo.file, false);
          uploadedPhotos.push(photoUrl);
        } catch (error) {
          console.error("Failed to upload photo:", error);
          toast({
            title: "Photo upload failed",
            description: "Some photos couldn't be uploaded. Continuing anyway.",
            variant: "destructive",
          });
        }
      }

      // Upload video if present
      let videoUrl: string | null = null;
      if (videoIntro) {
        try {
          videoUrl = await uploadFile(videoIntro.file, true);
        } catch (error) {
          console.error("Failed to upload video:", error);
          toast({
            title: "Video upload failed",
            description: "Video couldn't be uploaded. Profile will be saved without it.",
            variant: "destructive",
          });
        }
      }

      // Create dating profile
      const profileData = {
        user_id: currentUser.id,
        name: seed.name,
        age: parseInt(seed.age),
        gender: seed.gender,
        seeking: Array.isArray(seed.seeking) ? seed.seeking : [seed.seeking], // Ensure it's an array
        bio: bio.trim(),
        photos: uploadedPhotos,
        video_intro_url: videoUrl,
        location_lat: coordinates?.lat || null,
        location_lng: coordinates?.lng || null,
        city: seed.city || null,
        location_string: seed.location || null,
        is_active: true,
        last_active: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Insert into dating_profiles table
      const { error: profileError } = await supabase
        .from('dating_profiles')
        .upsert(profileData);

      if (profileError) throw profileError;

      // Update user's dating_enabled flag if it exists
      try {
        await supabase
          .from('profiles')
          .update({ dating_enabled: true })
          .eq('id', currentUser.id);
      } catch (error) {
        console.warn("Could not update dating_enabled flag:", error);
      }

      // Clean up localStorage
      localStorage.removeItem("dating_signup_data");

      toast({
        title: "Profile created successfully!",
        description: "Welcome to Splikz Dating! Start discovering amazing people.",
      });

      navigate("/dating/discover", { replace: true });

    } catch (error: any) {
      console.error("Profile creation error:", error);
      toast({
        title: "Profile creation failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // Loading state
  if (!seed || !ageVerified) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-fuchsia-500 animate-spin" />
      </div>
    );
  }

  const initials = (seed.name || "?").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900">
      {/* Header */}
      <div className="border-b border-zinc-800/50 bg-black/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
                <Heart className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Complete Your Profile</h1>
                <p className="text-sm text-zinc-400">Step {step} of 3 • Ages 18+</p>
              </div>
            </div>

            <div className="text-sm text-zinc-400">{Math.round(progress)}% complete</div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-zinc-800 rounded-full h-2 mt-4">
            <div
              className="bg-gradient-to-r from-fuchsia-500 to-purple-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Location Permission Alert */}
      {locationPermission === 'denied' && (
        <div className="container mx-auto px-4 pt-4 max-w-5xl">
          <Alert className="border-yellow-500/20 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <div>
                  <strong>Location access denied:</strong> {locationError}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={requestLocation}
                  className="ml-4"
                >
                  Try Again
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main */}
          <div className="lg:col-span-2 space-y-8">
            {step === 1 && (
              <Card className="bg-black/40 border-zinc-700 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-2xl text-white">
                    Tell us about yourself
                  </CardTitle>
                  <p className="text-zinc-400">
                    Write a short bio (minimum 20 characters). This helps people get to know you.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full ring-2 ring-fuchsia-500/40 overflow-hidden">
                      {photos[0]?.url ? (
                        <img
                          src={photos[0].url}
                          className="h-full w-full object-cover"
                          alt="avatar"
                        />
                      ) : (
                        <Avatar className="h-16 w-16">
                          <AvatarImage />
                          <AvatarFallback className="bg-zinc-800 text-zinc-300">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                    <div>
                      <div className="text-white font-semibold">{seed.name}, {seed.age}</div>
                      <div className="text-zinc-400 text-sm flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {locationPermission === 'granted' ? 'Location enabled' : 
                         seed.city || seed.location || "Location pending"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Your bio (min 20 chars)
                    </label>
                    <Textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, 500))}
                      className="bg-zinc-900 border-zinc-600 text-white min-h-[160px] resize-none text-base leading-relaxed"
                      placeholder="Share your vibe, interests, and what you're looking for…"
                    />
                    <div className="flex justify-between text-sm mt-2">
                      <span className={bio.length < 20 ? "text-red-400" : "text-green-400"}>
                        {bio.length < 20
                          ? `${20 - bio.length} more characters needed`
                          : "Looks great!"}
                      </span>
                      <span className="text-zinc-500">{bio.length}/500</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <Card className="bg-black/40 border-zinc-700 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-2xl text-white">Add photos & 3-sec intro</CardTitle>
                  <p className="text-zinc-400">
                    Add at least one photo. Video intro is optional but highly recommended.
                  </p>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Video */}
                  <div>
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Play className="h-5 w-5 text-fuchsia-500" />
                      3-Second Video Intro
                      <span className="ml-2 bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs px-2 py-1 rounded-full">
                        Recommended
                      </span>
                    </h3>

                    {!videoIntro ? (
                      <div className="border-2 border-dashed border-fuchsia-500/50 rounded-xl p-6 text-center bg-gradient-to-br from-fuchsia-500/5 to-purple-500/5">
                        <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Camera className="h-7 w-7 text-white" />
                        </div>
                        <p className="text-zinc-300 mb-4">
                          Upload a short clip; we'll trim it to exactly 3 seconds.
                        </p>
                        <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg cursor-pointer">
                          <Upload className="h-4 w-4" />
                          Upload video
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && addVideoIntro(e.target.files[0])}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
                        <div className="flex items-center gap-4">
                          <div className="w-20 h-20 bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-lg overflow-hidden">
                            <video
                              src={videoIntro.url}
                              className="h-full w-full object-cover"
                              autoPlay
                              muted
                              loop
                              playsInline
                            />
                          </div>
                          <div className="flex-1">
                            <p className="text-white font-medium">Video intro ready</p>
                            <p className="text-zinc-400 text-sm">Will be trimmed to 3s</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={removeVideoIntro}
                            className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Photos */}
                  <div>
                    <h3 className="text-white font-semibold mb-3">Photos ({photos.length}/6)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {photos.map((p, i) => (
                        <div key={p.id} className="relative group">
                          <img
                            src={p.url}
                            alt={`Photo ${i + 1}`}
                            className="w-full h-40 object-cover rounded-xl"
                          />
                          <button
                            onClick={() => removePhoto(p.id)}
                            className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          {i === 0 && (
                            <div className="absolute top-2 left-2 bg-fuchsia-500 text-white text-xs px-2 py-1 rounded-full">
                              Main
                            </div>
                          )}
                        </div>
                      ))}

                      {photos.length < 6 && (
                        <label className="border-2 border-dashed border-zinc-600 rounded-xl h-40 flex flex-col items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors bg-zinc-900/20">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])}
                            className="hidden"
                          />
                          {uploading ? (
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
                    <p className="text-zinc-500 text-sm mt-2">
                      Tip: Clear, well-lit photos get more matches.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 3 && (
              <Card className="bg-black/40 border-zinc-700 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-2xl text-white flex items-center gap-2">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                    Profile preview
                  </CardTitle>
                  <p className="text-zinc-400">
                    Final check before going live. Only dating users will see your profile.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-xl p-6 text-center">
                    <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">You're all set!</h3>
                    <p className="text-zinc-300 mb-6">
                      Your profile will be visible only to other dating users nearby.
                    </p>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-black/20 rounded-lg p-3">
                        <div className="text-fuchsia-400 font-semibold">✓ Bio</div>
                        <div className="text-zinc-400">{bio.length} characters</div>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3">
                        <div className="text-purple-400 font-semibold">✓ Photos</div>
                        <div className="text-zinc-400">{photos.length} added</div>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3">
                        <div className={videoIntro ? "text-green-400 font-semibold" : "text-zinc-500"}>
                          {videoIntro ? "✓ Video Intro" : "○ Video Intro"}
                        </div>
                        <div className="text-zinc-400">{videoIntro ? "Added" : "Optional"}</div>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3">
                        <div className={locationPermission === 'granted' ? "text-green-400 font-semibold" : "text-yellow-400 font-semibold"}>
                          {locationPermission === 'granted' ? "✓ Location" : "⚠ Location"}
                        </div>
                        <div className="text-zinc-400">
                          {locationPermission === 'granted' ? "Enabled" : "Optional"}
                        </div>
                      </div>
                    </div>

                    {locationPermission === 'denied' && (
                      <Alert className="mt-4 border-blue-500/20 bg-blue-500/10">
                        <Info className="h-4 w-4 text-blue-500" />
                        <AlertDescription className="text-sm">
                          Without location, you'll see profiles from a wider area. You can enable it later in settings.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={prev}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                disabled={saving}
              >
                {step === 1 ? "Back to Home" : "Previous"}
              </Button>

              <Button
                onClick={next}
                disabled={!canContinue || saving}
                className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 px-8 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating profile…
                  </>
                ) : step === 3 ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start matching
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Live Preview (sticky, lightweight so it won't steal focus) */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <Card className="bg-black/40 border-zinc-700 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Live Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-zinc-900 rounded-xl p-4">
                      <div className="text-center mb-4">
                        <div className="h-20 w-20 mx-auto mb-3 ring-2 ring-fuchsia-500/30 rounded-full overflow-hidden">
                          {videoIntro ? (
                            <video
                              src={videoIntro.url}
                              className="h-full w-full object-cover"
                              autoPlay
                              muted
                              loop
                              playsInline
                            />
                          ) : photos[0] ? (
                            <img
                              src={photos[0].url}
                              className="h-full w-full object-cover"
                              alt="Profile"
                            />
                          ) : (
                            <Avatar className="h-20 w-20 mx-auto">
                              <AvatarImage />
                              <AvatarFallback className="bg-zinc-800 text-zinc-300">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>

                        <h3 className="text-white font-semibold">
                          {seed.name}, {seed.age}
                        </h3>
                        <p className="text-zinc-400 text-sm flex items-center justify-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {locationPermission === 'granted' ? 'Nearby' :
                           seed.city || seed.location || "Location pending"}
                        </p>
                      </div>

                      {bio && (
                        <div className="text-sm text-zinc-300 bg-zinc-800/60 rounded-lg p-3">
                          {bio}
                        </div>
                      )}
                    </div>
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

export default DatingOnboarding;
