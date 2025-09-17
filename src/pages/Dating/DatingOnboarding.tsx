// src/pages/Dating/DatingOnboarding.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  MapPin,
  Camera,
  Upload,
  X,
  Plus,
  Star,
  Users,
  Coffee,
  Music2,
  Palette,
  BookOpen,
  Gamepad2,
  Dumbbell,
  Plane,
  ChefHat,
  Mountain,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* constants */
const GENDER_IDENTITIES = [
  { id: "man", label: "Man", icon: "👨" },
  { id: "woman", label: "Woman", icon: "👩" },
  { id: "non_binary", label: "Non-binary", icon: "🌟" },
  { id: "trans_man", label: "Trans man", icon: "🏳️‍⚧️" },
  { id: "trans_woman", label: "Trans woman", icon: "🏳️‍⚧️" },
  { id: "genderfluid", label: "Genderfluid", icon: "🌊" },
  { id: "other", label: "Other", icon: "✨" },
];

const ORIENTATIONS = [
  { id: "straight", label: "Straight" },
  { id: "gay", label: "Gay" },
  { id: "lesbian", label: "Lesbian" },
  { id: "bisexual", label: "Bisexual" },
  { id: "pansexual", label: "Pansexual" },
  { id: "asexual", label: "Asexual" },
  { id: "queer", label: "Queer" },
  { id: "questioning", label: "Questioning" },
];

const SEEKING_GENDERS = [
  "Men",
  "Women",
  "Non-binary folks",
  "Trans men",
  "Trans women",
  "Everyone",
];

const RELATIONSHIP_TYPES = [
  { id: "long_term", label: "Long-term relationship", desc: "Looking for something serious and meaningful" },
  { id: "short_term", label: "Short-term dating", desc: "Casual dating, see what happens naturally" },
  { id: "friends", label: "New friends", desc: "Building genuine platonic connections" },
  { id: "networking", label: "Professional networking", desc: "Career connections and opportunities" },
  { id: "unsure", label: "Open to possibilities", desc: "Still figuring it out, open to connections" },
];

/* interests */
const INTEREST_CATEGORIES = [
  {
    name: "Creative",
    items: [
      { id: "music", label: "Music", icon: Music2 },
      { id: "art", label: "Art", icon: Palette },
      { id: "photography", label: "Photography", icon: Camera },
      { id: "writing", label: "Writing", icon: BookOpen },
      { id: "dancing", label: "Dancing", icon: Users },
    ],
  },
  {
    name: "Active",
    items: [
      { id: "fitness", label: "Fitness", icon: Dumbbell },
      { id: "outdoors", label: "Outdoors", icon: Mountain },
      { id: "sports", label: "Sports", icon: Users },
      { id: "hiking", label: "Hiking", icon: Mountain },
      { id: "yoga", label: "Yoga", icon: Users },
    ],
  },
  {
    name: "Social",
    items: [
      { id: "foodie", label: "Foodie", icon: ChefHat },
      { id: "coffee", label: "Coffee", icon: Coffee },
      { id: "travel", label: "Travel", icon: Plane },
      { id: "nightlife", label: "Nightlife", icon: Users },
      { id: "cooking", label: "Cooking", icon: ChefHat },
    ],
  },
  {
    name: "Digital",
    items: [
      { id: "gaming", label: "Gaming", icon: Gamepad2 },
      { id: "tech", label: "Tech", icon: Mountain },
      { id: "movies", label: "Movies", icon: BookOpen },
      { id: "podcasts", label: "Podcasts", icon: Music2 },
      { id: "streaming", label: "Streaming", icon: Music2 },
    ],
  },
];

/* DOB helpers */
const today = new Date();
const MAX_YEAR = today.getFullYear() - 18;
const MIN_YEAR = 1900;
const MONTHS = [
  { v: "01", n: "Jan" }, { v: "02", n: "Feb" }, { v: "03", n: "Mar" },
  { v: "04", n: "Apr" }, { v: "05", n: "May" }, { v: "06", n: "Jun" },
  { v: "07", n: "Jul" }, { v: "08", n: "Aug" }, { v: "09", n: "Sep" },
  { v: "10", n: "Oct" }, { v: "11", n: "Nov" }, { v: "12", n: "Dec" },
];

const ageFromISO = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  let a = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
  return a < 0 || Number.isNaN(a) ? "" : String(a);
};

function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}

/* storage helper */
async function uploadToBucket(
  bucket: string,
  file: File,
  folder: string
): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = `${folder}/${fileName}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

const DatingOnboardingWizard: React.FC = () => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 7;

  const [formData, setFormData] = useState({
    name: "",
    city: "",
    age: "",
    dob: "",
    bio: "",
    gender: "",
    pronouns: "",
    orientation: "",
    seeking: [] as string[],
    relationshipType: "",
    interests: [] as string[],
    photos: [] as { id: number; url: string; file?: File }[],
    videoIntro: null as null | { url: string; file?: File },
    showAge: true,
  });

  // --- SIMPLIFIED KEY HANDLING - ONLY PREVENT SPECIFIC SHORTCUTS ---
  const rootRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only prevent specific problematic shortcuts that might interfere with the form
      // Don't interfere with normal typing in input fields
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      
      // If user is typing in an input field, let them type normally
      if (isInputField) {
        return;
      }
      
      // Only prevent specific navigation shortcuts when NOT in input fields
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
      }
    };
    
    // Use normal event listener, not capture
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);
  // -------------------------------------------------------

  // DOB parts
  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");

  // redirect if user already has a dating profile
  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id;
      if (!uid) return;
      const { data: dp } = await supabase
        .from("dating_profiles")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle();
      if (dp) {
        navigate("/dating/discover", { replace: true });
      }
    })();
  }, [navigate]);

  // prefill (name/bio) from localStorage
  useEffect(() => {
    const raw = localStorage.getItem("dating_prefill");
    if (raw) {
      const pre = JSON.parse(raw);
      setFormData((p) => ({
        ...p,
        name: pre.name ?? p.name,
        bio: pre.bio ?? p.bio,
      }));
    }
  }, []);

  // keep dob and age in sync
  useEffect(() => {
    if (dobYear && dobMonth && dobDay) {
      const iso = `${dobYear}-${dobMonth}-${dobDay}`;
      setFormData((p) => ({ ...p, dob: iso, age: ageFromISO(iso) }));
    }
  }, [dobYear, dobMonth, dobDay]);

  const handleInput = (field: string, value: any) =>
    setFormData((p) => ({ ...p, [field]: value }));

  const toggleArrayItem = (field: "seeking" | "interests", val: string) =>
    setFormData((p) => ({
      ...p,
      [field]: p[field].includes(val)
        ? p[field].filter((x) => x !== val)
        : [...p[field], val],
    }));

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const addPhoto = async (file: File) => {
    setUploadError(null);
    setUploadingPhoto(true);
    const url = URL.createObjectURL(file);
    setFormData((p) => ({
      ...p,
      photos: [...p.photos, { id: Date.now(), url, file }],
    }));
    setUploadingPhoto(false);
  };
  const removePhoto = (id: number) =>
    setFormData((p) => ({ ...p, photos: p.photos.filter((ph) => ph.id !== id) }));
  const addVideoIntro = async (file: File) => {
    const url = URL.createObjectURL(file);
    setFormData((p) => ({ ...p, videoIntro: { url, file } }));
  };

  // ---------- validation ----------
  const stepError: string | null = useMemo(() => {
    switch (currentStep) {
      case 1: {
        if (!formData.name.trim()) return "Please enter your name.";
        if (!formData.city.trim()) return "Please enter your city.";
        if (!(dobYear && dobMonth && dobDay)) return "Please enter your full date of birth.";
        const age = Number(formData.age);
        if (!age || age < 18) return "You must be 18 or older.";
        return null;
      }
      case 2:
        if (!formData.gender) return "Please choose your gender identity.";
        if (!formData.pronouns.trim()) return "Please choose or enter your pronouns.";
        return null;
      case 3:
        if (!formData.orientation) return "Please select your orientation.";
        return null;
      case 4:
        if (formData.seeking.length < 1) return "Pick at least one option for who you want to meet.";
        return null;
      case 5:
        if (!formData.relationshipType) return "Choose what you're looking for.";
        return null;
      case 6:
        if (formData.interests.length < 1) return "Add at least one interest.";
        return null;
      case 7:
        if (!(formData.photos.length > 0 || formData.videoIntro))
          return "Add at least one photo or a 3-second video.";
        return null;
      default:
        return null;
    }
  }, [currentStep, formData, dobYear, dobMonth, dobDay]);

  const nextStep = () => {
    if (!stepError) setCurrentStep((s) => Math.min(totalSteps, s + 1));
  };
  const prevStep = () => {
    if (currentStep === 1) navigate("/dating");
    else setCurrentStep((s) => Math.max(1, s - 1));
  };

  // -------- PUBLISH ----------
  const publishProfile = async () => {
    if (stepError) return;
    try {
      setSaving(true);
      const { data: au } = await supabase.auth.getUser();
      const user = au?.user;
      if (!user) {
        setSaving(false);
        navigate("/login");
        return;
      }

      // upload media (if any)
      let photoUrls: string[] = [];
      for (const ph of formData.photos) {
        if (ph.file) {
          const u = await uploadToBucket("dating_photos", ph.file, user.id);
          photoUrls.push(u);
        }
      }
      let videoUrl: string | null = null;
      if (formData.videoIntro?.file) {
        videoUrl = await uploadToBucket("dating_videos", formData.videoIntro.file, user.id);
      }

      const { error } = await supabase.from("dating_profiles").upsert(
        {
          user_id: user.id,
          display_name: formData.name || null,
          city: formData.city || null,
          dob: formData.dob || null,
          show_age: formData.showAge,
          bio: formData.bio || null,
          gender: formData.gender || null,
          pronouns: formData.pronouns || null,
          orientation: formData.orientation || null,
          seeking: formData.seeking,
          relationship_type: formData.relationshipType || null,
          interests: formData.interests,
          avatar_url: photoUrls[0] || null,
          photo_urls: photoUrls,
          video_intro_url: videoUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;

      navigate("/dating/discover", { replace: true });
    } catch (e) {
      console.error(e);
      setSaving(false);
      alert("Could not publish profile. Please try again.");
    }
  };

  const progress = Math.round((currentStep / totalSteps) * 100);

  const StepIndicator = () => (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-zinc-400">
          Step {currentStep} of {totalSteps}
        </div>
        <div className="text-sm text-zinc-400">{progress}% complete</div>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <div
          className="bg-gradient-to-r from-fuchsia-500 to-purple-500 h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );

  const StepCard: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle, children }) => (
    <Card className="w-full max-w-4xl mx-auto bg-zinc-950 border-zinc-800 shadow-2xl">
      <CardHeader className="text-center border-b border-zinc-800 pb-6">
        <CardTitle className="text-2xl font-bold text-white mb-2">{title}</CardTitle>
        {subtitle && <p className="text-zinc-400">{subtitle}</p>}
      </CardHeader>
      <CardContent className="p-8">{children}</CardContent>
    </Card>
  );

  const NavigationButtons = () => (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 w-full max-w-4xl mx-auto mt-8">
      <Button variant="outline" onClick={prevStep} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
        <ArrowLeft className="h-4 w-4 mr-2" />
        {currentStep === 1 ? "Exit" : "Back"}
      </Button>

      {stepError && <div className="text-sm text-red-400">{stepError}</div>}

      {currentStep === totalSteps ? (
        <Button
          onClick={publishProfile}
          disabled={saving || Boolean(stepError)}
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
          disabled={Boolean(stepError)}
          className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 px-8 disabled:opacity-60"
        >
          Continue
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      )}
    </div>
  );

  const ProfilePreview = React.memo(() => (
    <div className="fixed right-4 top-4 w-80 max-h-[80vh] overflow-y-auto hidden xl:block">
      <Card className="bg-zinc-950/95 backdrop-blur-sm border-zinc-800 shadow-2xl">
        <CardHeader className="border-b border-zinc-800">
          <CardTitle className="text-white text-sm">Live Preview</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-4">
            <div className="text-center">
              <div className="h-20 w-20 mx-auto mb-3 ring-2 ring-fuchsia-500/30 rounded-full overflow-hidden relative">
                {formData.videoIntro?.url ? (
                  <video src={formData.videoIntro.url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
                ) : formData.photos[0]?.url ? (
                  <img src={formData.photos[0].url} className="h-full w-full object-cover" alt="main" />
                ) : (
                  <Avatar className="h-20 w-20 mx-auto">
                    <AvatarImage />
                    <AvatarFallback className="bg-zinc-800 text-zinc-300 text-lg">
                      {formData.name ? formData.name.charAt(0) : "?"}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>

              <h3 className="text-white font-semibold">
                {formData.name || "Your name"}
                {formData.showAge && formData.age ? `, ${formData.age}` : ""}
              </h3>
              <p className="text-zinc-400 text-sm flex items-center justify-center gap-1">
                <MapPin className="h-3 w-3" />
                {formData.city || "Your city"}
              </p>
            </div>

            {formData.bio && <div className="text-sm text-zinc-300 bg-zinc-900 rounded-lg p-3">{formData.bio}</div>}

            {(formData.photos.length > 0 || formData.videoIntro) && (
              <div className="text-xs text-zinc-500 text-center">
                {formData.photos.length} photo{formData.photos.length !== 1 ? "s" : ""}
                {formData.videoIntro && " • Video intro"}
              </div>
            )}

            <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${progress >= 100 ? "bg-green-500" : "bg-yellow-500"}`} />
                <span className="text-sm text-white font-medium">
                  {progress >= 100 ? "Ready to publish!" : "Keep going..."}
                </span>
              </div>
              <div className="text-xs text-zinc-400">Profile strength: {progress}%</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  ));

  /* steps */
  const renderStep = () => {
    switch (currentStep) {
      case 1: {
        const maxDays = (dobYear && dobMonth ? daysInMonth(parseInt(dobYear), parseInt(dobMonth)) : 31) || 31;
        const days = Array.from({ length: maxDays }, (_, i) => String(i + 1).padStart(2, "0"));
        return (
          <StepCard title="Let's start with the basics" subtitle="Tell us a bit about yourself">
            <div className="space-y-6">
              {/* Avatar / video */}
              <div className="flex flex-col items-center gap-4">
                <div className="h-32 w-32 rounded-full ring-4 ring-fuchsia-500/30 overflow-hidden relative bg-zinc-900">
                  {formData.videoIntro?.url ? (
                    <video src={formData.videoIntro.url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
                  ) : formData.photos[0]?.url ? (
                    <img src={formData.photos[0].url} className="h-full w-full object-cover" alt="main" />
                  ) : (
                    <Avatar className="h-32 w-32">
                      <AvatarImage />
                      <AvatarFallback className="bg-zinc-800 text-zinc-300 text-2xl">
                        {formData.name ? formData.name.charAt(0) : "?"}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 cursor-pointer hover:border-zinc-600">
                    <Upload className="h-4 w-4" />
                    <span>Upload photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])} />
                  </label>

                  <label className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white cursor-pointer hover:from-fuchsia-500 hover:to-purple-500">
                    <Camera className="h-4 w-4" />
                    <span>Add 3-sec video</span>
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && addVideoIntro(e.target.files[0])} />
                  </label>

                  {formData.videoIntro && (
                    <Button variant="outline" size="sm" className="h-10 border-zinc-700 text-zinc-300" onClick={() => handleInput("videoIntro", null)}>
                      <X className="h-4 w-4 mr-1" />
                      Remove video
                    </Button>
                  )}
                </div>

                {uploadingPhoto && (
                  <div className="text-sm text-zinc-400 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Adding photo…
                  </div>
                )}
                {uploadError && <div className="text-sm text-red-400">{uploadError}</div>}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-zinc-300 text-sm font-medium">Your name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleInput("name", e.target.value)}
                    className="mt-2 bg-zinc-900 border-zinc-700 text-white text-lg h-12"
                    placeholder="What should people call you?"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <Label className="text-zinc-300 text-sm font-medium">City</Label>
                  <div className="relative mt-2">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
                    <Input
                      value={formData.city}
                      onChange={(e) => handleInput("city", e.target.value)}
                      className="pl-10 bg-zinc-900 border-zinc-700 text-white text-lg h-12"
                      placeholder="Where are you based?"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>

              {/* DOB + Age */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-zinc-300 text-sm font-medium">Date of birth</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <select
                      className="bg-zinc-900 border border-zinc-700 text-white h-12 rounded-lg px-3"
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                    >
                      <option value="">Month</option>
                      {MONTHS.map((m) => (
                        <option key={m.v} value={m.v}>
                          {m.n}
                        </option>
                      ))}
                    </select>
                    <select
                      className="bg-zinc-900 border border-zinc-700 text-white h-12 rounded-lg px-3"
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                    >
                      <option value="">Day</option>
                      {days.map((d) => (
                        <option key={d} value={d}>
                          {parseInt(d, 10)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="bg-zinc-900 border border-zinc-700 text-white h-12 rounded-lg px-3"
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                    >
                      <option value="">Year</option>
                      {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => String(MAX_YEAR - i)).map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-zinc-300 text-sm font-medium">Age</Label>
                  <Input
                    inputMode="numeric"
                    value={formData.age}
                    onChange={(e) => handleInput("age", e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    className="mt-2 bg-zinc-900 border-zinc-700 text-white h-12"
                    placeholder="Your age"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">Show my age</div>
                    <div className="text-zinc-400 text-sm">Age shown: {formData.age || "—"}</div>
                  </div>
                  <button
                    onClick={() => handleInput("showAge", !formData.showAge)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.showAge ? "bg-fuchsia-500" : "bg-zinc-600"
                    }`}
                    type="button"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.showAge ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-zinc-300 text-sm font-medium">Tell us about yourself</Label>
                <Textarea
                  value={formData.bio}
                  onChange={(e) => handleInput("bio", e.target.value.slice(0, 500))}
                  className="mt-2 bg-zinc-900 border-zinc-700 text-white min-h-[120px] resize-none"
                  placeholder="Share your vibe, interests, what makes you unique..."
                  autoComplete="off"
                />
                <div className="text-xs text-zinc-500 mt-2 text-right">{formData.bio.length}/500</div>
              </div>
            </div>
          </StepCard>
        );
      }

      case 2:
        return (
          <StepCard title="Your identity matters" subtitle="Help us understand who you are">
            <div className="space-y-8">
              <div>
                <Label className="text-zinc-300 text-lg font-medium mb-4 block">Gender identity</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {GENDER_IDENTITIES.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => handleInput("gender", g.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        formData.gender === g.id ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                      }`}
                      type="button"
                    >
                      <div className="text-2xl mb-2">{g.icon}</div>
                      <div className="text-white font-medium">{g.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-zinc-300 text-lg font-medium mb-4 block">Pronouns</Label>
                <div className="flex flex-wrap gap-3">
                  {["he/him", "she/her", "they/them", "he/they", "she/they", "ze/zir"].map((p) => (
                    <button
                      key={p}
                      onClick={() => handleInput("pronouns", p)}
                      className={`px-6 py-3 rounded-full border transition-all ${
                        formData.pronouns === p
                          ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-300"
                          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
                      }`}
                      type="button"
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <Input
                  value={
                    ["he/him", "she/her", "they/them", "he/they", "she/they", "ze/zir"].includes(formData.pronouns)
                      ? ""
                      : formData.pronouns
                  }
                  onChange={(e) => handleInput("pronouns", e.target.value)}
                  className="mt-3 bg-zinc-900 border-zinc-700 text-white"
                  placeholder="Or enter custom pronouns..."
                  autoComplete="off"
                />
              </div>
            </div>
          </StepCard>
        );

      case 3:
        return (
          <StepCard title="Sexual orientation" subtitle="How do you identify?">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {ORIENTATIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => handleInput("orientation", o.id)}
                  className={`p-6 rounded-xl border-2 transition-all text-center ${
                    formData.orientation === o.id ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                  }`}
                  type="button"
                >
                  <div className="text-white font-medium text-lg">{o.label}</div>
                </button>
              ))}
            </div>
          </StepCard>
        );

      case 4:
        return (
          <StepCard title="Who would you like to meet?" subtitle="Select all that apply">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {SEEKING_GENDERS.map((g) => (
                <button
                  key={g}
                  onClick={() => toggleArrayItem("seeking", g)}
                  className={`p-6 rounded-xl border-2 transition-all text-center ${
                    formData.seeking.includes(g) ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                  }`}
                  type="button"
                >
                  <div className="text-white font-medium">{g}</div>
                </button>
              ))}
            </div>
          </StepCard>
        );

      case 5:
        return (
          <StepCard title="What are you looking for?" subtitle="Your relationship goals help us find better matches">
            <div className="space-y-4">
              {RELATIONSHIP_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleInput("relationshipType", t.id)}
                  className={`w-full p-6 rounded-xl border-2 transition-all text-left ${
                    formData.relationshipType === t.id ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                  }`}
                  type="button"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-white/5">
                      <Star className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-white font-medium text-lg mb-1">{t.label}</div>
                      <div className="text-zinc-400 text-sm">{t.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </StepCard>
        );

      case 6:
        return (
          <StepCard title="Your interests make you unique" subtitle="Select what you're passionate about">
            <div className="space-y-8">
              {INTEREST_CATEGORIES.map((cat) => (
                <div key={cat.name}>
                  <h3 className="text-white font-medium text-lg mb-4">{cat.name}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {cat.items.map((i) => {
                      const Icon = i.icon;
                      return (
                        <button
                          key={i.id}
                          onClick={() => toggleArrayItem("interests", i.id)}
                          className={`p-4 rounded-xl border transition-all text-center ${
                            formData.interests.includes(i.id)
                              ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                              : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
                          }`}
                          type="button"
                        >
                          <Icon className="h-6 w-6 mx-auto mb-2" />
                          <div className="text-sm font-medium">{i.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <Input
                  onKeyDown={(e) => {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (e.key === "Enter" && v) {
                      if (!formData.interests.includes(v)) {
                        handleInput("interests", [...formData.interests, v]);
                      }
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                  className="bg-zinc-900 border-zinc-700 text-white"
                  placeholder="Type a custom interest and press Enter..."
                  autoComplete="off"
                />
              </div>

              {formData.interests.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.interests.map((i) => (
                    <Badge key={i} className="bg-zinc-800 text-zinc-200 hover:bg-zinc-700 cursor-pointer" onClick={() => toggleArrayItem("interests", i)}>
                      {i} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </StepCard>
        );

      case 7:
        return (
          <StepCard title="Add photos and create your video intro" subtitle="Show your personality - video intros get 3x more matches!">
            <div className="space-y-8">
              <div>
                <h3 className="text-white font-medium text-lg mb-4">Photos (2–6 recommended)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {formData.photos.map((photo, idx) => (
                    <div key={photo.id} className="relative group">
                      <img src={photo.url} alt={`Photo ${idx + 1}`} className="w-full h-48 object-cover rounded-xl" />
                      <button
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        type="button"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      {idx === 0 && (
                        <div className="absolute top-2 left-2 bg-fuchsia-500 text-white text-xs px-2 py-1 rounded-full">Main</div>
                      )}
                    </div>
                  ))}
                  {formData.photos.length < 6 && (
                    <label className="border-2 border-dashed border-zinc-700 rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer hover:border-zinc-600 transition-colors">
                      <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])} className="hidden" />
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

              <div>
                <h3 className="text-white font-medium text-lg mb-4">
                  3-Second Video Intro{" "}
                  <Badge className="ml-2 bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white">
                    <Star className="h-3 w-3 mr-1" />
                    Recommended
                  </Badge>
                </h3>

                {!formData.videoIntro ? (
                  <label className="border-2 border-dashed border-fuchsia-500/50 rounded-xl p-8 text-center cursor-pointer hover:border-fuchsia-500/70 transition-colors">
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && addVideoIntro(e.target.files[0])} />
                    <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Camera className="h-8 w-8 text-white" />
                    </div>
                    <h4 className="text-white font-medium mb-2">Create your signature 3-second intro</h4>
                    <p className="text-zinc-400 text-sm">We'll trim to exactly 3 seconds when you publish.</p>
                  </label>
                ) : (
                  <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-lg flex items-center justify-center overflow-hidden">
                        <video src={formData.videoIntro.url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">Video intro ready!</p>
                        <p className="text-zinc-400 text-sm">Will be trimmed to 3s</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleInput("videoIntro", null)} className="border-zinc-700">
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

  return (
    <div ref={rootRef} className="min-h-screen bg-black text-white relative">
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

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        <StepIndicator />
        <div className="flex gap-6">
          <div className="flex-1">
            {renderStep()}
            <NavigationButtons />
          </div>
        </div>
      </div>

      <ProfilePreview />

      {saving && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="bg-zinc-950 border-zinc-700 w-full max-w-md">
            <CardContent className="p-8 text-center">
              <div className="h-16 w-16 bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Publishing your profile...</h3>
              <p className="text-zinc-400 mb-6">We're saving your info and will trim your video to exactly 3 seconds.</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <Check className="h-4 w-4 text-green-500" />
                  Profile information saved
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <Check className="h-4 w-4 text-green-500" />
                  Photos added
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" />
                  Processing your 3-sec intro…
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
