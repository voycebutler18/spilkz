// src/pages/Dating/DatingOnboarding.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "lucide-react";

/**
 * This onboarding page is 3 simple steps:
 * 1) Bio (typing is fully controlled and stable)
 * 2) Media (photos + optional 3s video)
 * 3) Preview + Publish
 *
 * It expects "dating_signup_data" in localStorage (written by the redesigned
 * SplikzDatingHome). If it’s missing we send people back to /dating.
 */

type SignupData = {
  name: string;
  age: string;
  gender: string;
  seeking: string;
  location: string; // or "lat,lng"
  city?: string;
};

type TempPhoto = { id: number; url: string; file?: File };
type TempVideo = { url: string; file?: File };

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const DatingOnboarding: React.FC = () => {
  const navigate = useNavigate();

  // ---- seed from localStorage written by dating home ----
  const [seed, setSeed] = useState<SignupData | null>(null);

  // ---- local form state (kept minimal & stable) ----
  const [bio, setBio] = useState("");
  const [photos, setPhotos] = useState<TempPhoto[]>([]);
  const [videoIntro, setVideoIntro] = useState<TempVideo | null>(null);

  // UX state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // load seed or bounce back
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dating_signup_data");
      if (!raw) {
        navigate("/dating", { replace: true });
        return;
      }
      const parsed = JSON.parse(raw) as SignupData;
      setSeed(parsed);
    } catch {
      navigate("/dating", { replace: true });
    }
  }, [navigate]);

  // -------- helpers (photos / video) --------
  const addPhoto = async (file: File) => {
    if (photos.length >= 6) return;
    setUploading(true);
    const url = URL.createObjectURL(file);
    setPhotos((prev) => [...prev, { id: Date.now(), url, file }]);
    setUploading(false);
  };
  const removePhoto = (id: number) =>
    setPhotos((prev) => prev.filter((p) => p.id !== id));

  const addVideoIntro = (file: File) => {
    const url = URL.createObjectURL(file);
    setVideoIntro({ url, file });
  };
  const removeVideoIntro = () => setVideoIntro(null);

  // -------- step validation (memo so it doesn’t thrash focus) --------
  const canContinue = useMemo(() => {
    if (step === 1) return bio.trim().length >= 20;
    if (step === 2) return photos.length > 0 || !!videoIntro;
    return true;
  }, [step, bio, photos.length, videoIntro]);

  const progress = useMemo(() => (step / 3) * 100, [step]);

  const next = () => (step < 3 ? setStep((s) => (clamp(s + 1, 1, 3) as 1 | 2 | 3)) : publish());
  const prev = () => (step > 1 ? setStep((s) => (clamp(s - 1, 1, 3) as 1 | 2 | 3)) : navigate("/dating"));

  // -------- publish (fake save -> go discover) --------
  async function publish() {
    if (!seed) return;
    setSaving(true);

    // In your real app, upload the files to Supabase here, then upsert the
    // dating_profiles row. We only simulate it to keep typing buttery-smooth.
    const payload = {
      ...seed,
      bio,
      photos: photos.map((p) => p.url),
      videoIntro: videoIntro?.url || null,
      completed_at: new Date().toISOString(),
    };
    localStorage.setItem("dating_profile", JSON.stringify(payload));

    // simulate network
    await new Promise((r) => setTimeout(r, 1200));
    navigate("/dating/discover", { replace: true });
  }

  if (!seed) {
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
                <p className="text-sm text-zinc-400">Step {step} of 3</p>
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
                    Write a short bio (minimum 20 characters). No auto-focus or scroll
                    jumps here—type freely.
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
                      <div className="text-white font-semibold">{seed.name}</div>
                      <div className="text-zinc-400 text-sm flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {seed.city || seed.location || "Your location"}
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
                      placeholder="Share your vibe, interests, and what you’re looking for…"
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
                          Upload a short clip; we’ll trim it to exactly 3 seconds.
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
                    Final check before going live.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-xl p-6 text-center">
                    <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">You’re all set!</h3>
                    <p className="text-zinc-300 mb-6">
                      Your profile is ready to start matching with amazing people nearby.
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
                        <div className="text-cyan-400 font-semibold">✓ Basics</div>
                        <div className="text-zinc-400">{seed.gender} • seeking {seed.seeking}</div>
                      </div>
                    </div>
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
                    Publishing…
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

          {/* Live Preview (sticky, lightweight so it won’t steal focus) */}
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
                          {seed.name}
                          {seed.age ? `, ${seed.age}` : ""}
                        </h3>
                        <p className="text-zinc-400 text-sm flex items-center justify-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {seed.city || seed.location || "Nearby"}
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
