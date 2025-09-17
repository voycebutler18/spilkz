// src/pages/Dating/DatingOnboarding.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Heart,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Star,
  Upload,
  X,
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

/* -------------------- constants -------------------- */
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

/* -------------------- DOB helpers -------------------- */
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

/* -------------------- storage helper -------------------- */
async function uploadToBucket(bucket: string, file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = `${folder}/${fileName}`;
  const { error } = await supabase.storage.from(bucket).upload(filePath, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

/* =========================================================
   Onboarding in a full-screen modal (focus + key guarded)
   ========================================================= */
const DatingOnboarding: React.FC = () => {
  const navigate = useNavigate();

  // ---------- overlay guards (stop global hotkeys from stealing focus) ----------
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stopIfInside = (e: Event) => {
      const node = overlayRef.current;
      if (!node) return;
      const target = e.target as Node | null;
      if (target && node.contains(target)) {
        // Let typing happen, just stop bubbling to header/router listeners
        e.stopPropagation();
        // @ts-ignore
        e.stopImmediatePropagation?.();
      }
    };
    const keepFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const isEditable =
        t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t as any).isContentEditable;
      if (isEditable) (t as any).focus?.({ preventScroll: true });
    };

    // capture on window (before any global listeners)
    window.addEventListener("keydown", stopIfInside, true);
    window.addEventListener("keypress", stopIfInside, true);
    window.addEventListener("keyup", stopIfInside, true);
    window.addEventListener("focusin", keepFocus, true);
    return () => {
      window.removeEventListener("keydown", stopIfInside, true);
      window.removeEventListener("keypress", stopIfInside, true);
      window.removeEventListener("keyup", stopIfInside, true);
      window.removeEventListener("focusin", keepFocus, true);
    };
  }, []);

  // ---------- auth + profile prefill ----------
  const [me, setMe] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      if (!user) {
        navigate("/login");
        return;
      }
      setMe({ id: user.id, email: user.email ?? undefined });

      const { data: p } = await supabase
        .from("profiles")
        .select("id, username, display_name, first_name, last_name, avatar_url, city")
        .eq("id", user.id)
        .maybeSingle();
      if (p) setProfile(p);
    })();
  }, [navigate]);

  // ---------- state ----------
  // step 0: Quick Start (modal header style you like)
  // then: 1..5 form steps
  const [step, setStep] = useState<number>(0);
  const totalSteps = 5;

  const [formData, setFormData] = useState({
    name: "",
    city: "",
    bio: "",
    dob: "",
    age: "",
    showAge: true,

    gender: "",
    pronouns: "",
    orientation: "",
    seeking: [] as string[],
    relationshipType: "",

    interests: [] as string[],
    photos: [] as { id: number; url: string; file?: File }[],
    videoIntro: null as null | { url: string; file?: File },
  });

  // prefill from profile + local storage
  useEffect(() => {
    setFormData((p) => ({
      ...p,
      name:
        p.name ||
        profile?.display_name ||
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
        profile?.username ||
        "",
      city: p.city || profile?.city || "",
    }));
    const raw = localStorage.getItem("dating_prefill");
    if (raw) {
      try {
        const pre = JSON.parse(raw);
        setFormData((p) => ({ ...p, name: pre.name ?? p.name, bio: pre.bio ?? p.bio }));
      } catch {}
    }
  }, [profile]);

  const handleInput = (field: string, value: any) =>
    setFormData((p) => ({ ...p, [field]: value }));

  const toggleArrayItem = (field: "seeking" | "interests", val: string) =>
    setFormData((p) => ({
      ...p,
      [field]: p[field].includes(val)
        ? p[field].filter((x) => x !== val)
        : [...p[field], val],
    }));

  // media helpers
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const addPhoto = async (file: File) => {
    setUploadingPhoto(true);
    const url = URL.createObjectURL(file);
    setFormData((p) => ({ ...p, photos: [...p.photos, { id: Date.now(), url, file }] }));
    setUploadingPhoto(false);
  };
  const removePhoto = (id: number) =>
    setFormData((p) => ({ ...p, photos: p.photos.filter((ph) => ph.id !== id) }));
  const addVideoIntro = async (file: File) => {
    const url = URL.createObjectURL(file);
    setFormData((p) => ({ ...p, videoIntro: { url, file } }));
  };

  // DOB controls (inside step 1)
  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  useEffect(() => {
    if (dobYear && dobMonth && dobDay) {
      const iso = `${dobYear}-${dobMonth}-${dobDay}`;
      handleInput("dob", iso);
      handleInput("age", ageFromISO(iso));
    }
  }, [dobYear, dobMonth, dobDay]);

  // ---------- validation ----------
  const errorText = useMemo(() => {
    if (step === 0) {
      if (!formData.name.trim()) return "Please enter your display name.";
      // city not strictly required here, user can add in step 1
      return null;
    }
    switch (step) {
      case 1: {
        if (!formData.city.trim()) return "Please enter your city.";
        if (!(dobYear && dobMonth && dobDay)) return "Please enter your full date of birth.";
        const age = Number(formData.age);
        if (!age || age < 18) return "You must be 18 or older.";
        return null;
      }
      case 2:
        if (!formData.gender) return "Choose at least one gender identity.";
        if (!formData.pronouns.trim()) return "Please choose or enter your pronouns.";
        return null;
      case 3:
        if (!formData.orientation) return "Select your orientation.";
        if (formData.seeking.length < 1) return "Pick at least one option for who you want to meet.";
        return null;
      case 4:
        if (!formData.relationshipType) return "Choose what you’re looking for.";
        return null;
      case 5:
        if (!(formData.photos.length > 0 || formData.videoIntro)) return "Add at least one photo or a 3-second video.";
        return null;
      default:
        return null;
    }
  }, [step, formData, dobYear, dobMonth, dobDay]);

  const next = () => !errorText && setStep((s) => Math.min(5, s + 1));
  const back = () => (step === 0 ? navigate("/dating") : setStep((s) => Math.max(0, s - 1)));

  // ---------- publish ----------
  const [saving, setSaving] = useState(false);
  const publish = async () => {
    if (errorText) return;
    try {
      setSaving(true);
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setSaving(false);
        navigate("/login");
        return;
      }

      // upload media
      const photoUrls: string[] = [];
      for (const ph of formData.photos) {
        if (ph.file) photoUrls.push(await uploadToBucket("dating_photos", ph.file, user.id));
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

  // ---------- pieces ----------
  const QuickStart = () => (
    <Card className="w-full max-w-2xl bg-zinc-900/95 backdrop-blur border-zinc-700 shadow-2xl">
      <CardHeader className="border-b border-zinc-800 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl text-white">Quick start your dating profile</CardTitle>
            <p className="text-zinc-400 mt-1">We’ll prefill from your Splikz profile</p>
          </div>
          <Button variant="ghost" className="text-zinc-400 hover:text-white" onClick={back}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-xl">
            <Avatar className="h-16 w-16 ring-2 ring-fuchsia-500/30">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
              <AvatarFallback className="bg-zinc-700 text-white text-lg">
                {(profile?.display_name?.[0] ||
                  profile?.username?.[0] ||
                  me?.email?.[0] ||
                  "U"
                ).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-white font-semibold text-lg">
                {profile?.display_name || profile?.username || "You"}
              </h3>
              <p className="text-zinc-400">@{profile?.username || me?.email?.split("@")[0] || "you"}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label className="text-zinc-300 font-medium">Dating display name</Label>
              <Input
                value={formData.name}
                onChange={(e) => handleInput("name", e.target.value)}
                className="mt-2 bg-zinc-800 border-zinc-700 text-white h-12"
                placeholder="How should people know you?"
              />
            </div>
            <div>
              <Label className="text-zinc-300 font-medium">Location</Label>
              <div className="relative mt-2">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  value={formData.city}
                  onChange={(e) => handleInput("city", e.target.value)}
                  className="pl-10 bg-zinc-800 border-zinc-700 text-white h-12"
                  placeholder="Your city"
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
              <div className="flex items-center gap-2"><Check className="h-4 w-4 text-green-400" /> 3-second video intro</div>
              <div className="flex items-center gap-2"><Check className="h-4 w-4 text-green-400" /> Smart compatibility matching</div>
              <div className="flex items-center gap-2"><Check className="h-4 w-4 text-green-400" /> Advanced preferences</div>
              <div className="flex items-center gap-2"><Check className="h-4 w-4 text-green-400" /> Priority profile visibility</div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="inline-flex w-full items-center justify-center gap-2 h-12 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white cursor-pointer hover:from-fuchsia-500 hover:to-purple-500">
              <Camera className="h-4 w-4" />
              <span>Add 3-second intro first</span>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addVideoIntro(f);
                }}
              />
            </label>

            <Button
              variant="outline"
              className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-12"
              onClick={() => setStep(1)}
            >
              Skip video, continue setup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dating")}
              className="w-full text-zinc-500 hover:text-zinc-300"
            >
              Maybe later
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const StepShell: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle, children }) => (
    <Card className="w-full max-w-3xl bg-zinc-900/95 backdrop-blur border-zinc-700 shadow-2xl">
      <CardHeader className="border-b border-zinc-800 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl text-white">{title}</CardTitle>
            {subtitle && <p className="text-zinc-400 mt-1">{subtitle}</p>}
          </div>
          <Button variant="ghost" className="text-zinc-400 hover:text-white" onClick={back}>
            {step === 0 ? <X className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );

  // -------- steps (all kept inside the modal) --------
  const Step1Basics = () => {
    const maxDays = (dobYear && dobMonth ? daysInMonth(parseInt(dobYear), parseInt(dobMonth)) : 31) || 31;
    const days = Array.from({ length: maxDays }, (_, i) => String(i + 1).padStart(2, "0"));

    return (
      <StepShell title="Basics" subtitle="Tell us a little about yourself">
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label className="text-zinc-300 text-sm font-medium">Your name</Label>
              <Input
                value={formData.name}
                onChange={(e) => handleInput("name", e.target.value)}
                className="mt-2 bg-zinc-800 border-zinc-700 text-white h-12"
                placeholder="What should people call you?"
              />
            </div>
            <div>
              <Label className="text-zinc-300 text-sm font-medium">City</Label>
              <div className="relative mt-2">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  value={formData.city}
                  onChange={(e) => handleInput("city", e.target.value)}
                  className="pl-10 bg-zinc-800 border-zinc-700 text-white h-12"
                  placeholder="Where are you based?"
                />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label className="text-zinc-300 text-sm font-medium">Date of birth</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <select className="bg-zinc-800 border border-zinc-700 text-white h-12 rounded-lg px-3" value={dobMonth} onChange={(e) => setDobMonth(e.target.value)}>
                  <option value="">Month</option>
                  {MONTHS.map((m) => <option key={m.v} value={m.v}>{m.n}</option>)}
                </select>
                <select className="bg-zinc-800 border border-zinc-700 text-white h-12 rounded-lg px-3" value={dobDay} onChange={(e) => setDobDay(e.target.value)}>
                  <option value="">Day</option>
                  {days.map((d) => <option key={d} value={d}>{parseInt(d, 10)}</option>)}
                </select>
                <select className="bg-zinc-800 border border-zinc-700 text-white h-12 rounded-lg px-3" value={dobYear} onChange={(e) => setDobYear(e.target.value)}>
                  <option value="">Year</option>
                  {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => String(MAX_YEAR - i)).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-zinc-300 text-sm font-medium">Show my age</Label>
              <div className="mt-2 flex items-center gap-3">
                <div className="text-zinc-300">Age shown: {formData.age || "—"}</div>
                <button
                  onClick={() => handleInput("showAge", !formData.showAge)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.showAge ? "bg-fuchsia-500" : "bg-zinc-600"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.showAge ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-zinc-300 text-sm font-medium">Tell us about yourself</Label>
            <Textarea
              value={formData.bio}
              onChange={(e) => handleInput("bio", e.target.value.slice(0, 500))}
              className="mt-2 bg-zinc-800 border-zinc-700 text-white min-h-[120px] resize-none"
              placeholder="Share your vibe, interests, what makes you unique..."
            />
            <div className="text-xs text-zinc-500 mt-1 text-right">{formData.bio.length}/500</div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={back}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <Button onClick={next} disabled={!!errorText} className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500">
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
          {errorText && <div className="text-sm text-red-400">{errorText}</div>}
        </div>
      </StepShell>
    );
  };

  const Step2Identity = () => (
    <StepShell title="Your identity matters" subtitle="Help us understand who you are">
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
              >
                <div className="text-2xl mb-2">{g.icon}</div>
                <div className="text-white font-medium">{g.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-zinc-300 text-lg font-medium mb-2 block">Pronouns</Label>
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
            className="mt-3 bg-zinc-800 border-zinc-700 text-white"
            placeholder="Or enter custom pronouns..."
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={back}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={next} disabled={!!errorText} className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500">
            Continue <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
        {errorText && <div className="text-sm text-red-400">{errorText}</div>}
      </div>
    </StepShell>
  );

  const Step3Prefs = () => (
    <StepShell title="Orientation & who you want to meet" subtitle="Select what applies">
      <div className="space-y-8">
        <div>
          <Label className="text-zinc-300 text-lg font-medium mb-2 block">Orientation</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ORIENTATIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => handleInput("orientation", o.id)}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  formData.orientation === o.id ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                }`}
              >
                <div className="text-white font-medium">{o.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-zinc-300 text-lg font-medium mb-2 block">Who you want to meet</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {SEEKING_GENDERS.map((g) => (
              <button
                key={g}
                onClick={() => toggleArrayItem("seeking", g)}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  formData.seeking.includes(g) ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                }`}
              >
                <div className="text-white font-medium">{g}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={back}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={next} disabled={!!errorText} className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500">
            Continue <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
        {errorText && <div className="text-sm text-red-400">{errorText}</div>}
      </div>
    </StepShell>
  );

  const Step4Goals = () => (
    <StepShell title="What are you looking for?" subtitle="Your relationship goals">
      <div className="space-y-4">
        {RELATIONSHIP_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => handleInput("relationshipType", t.id)}
            className={`w-full p-6 rounded-xl border-2 transition-all text-left ${
              formData.relationshipType === t.id ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
            }`}
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
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={back}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={next} disabled={!!errorText} className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500">
            Continue <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
        {errorText && <div className="text-sm text-red-400">{errorText}</div>}
      </div>
    </StepShell>
  );

  const Step5Media = () => (
    <StepShell title="Photos & 3-second intro" subtitle="Show your personality">
      <div className="space-y-8">
        <div>
          <h3 className="text-white font-medium text-lg mb-3">Photos (2–6 recommended)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {formData.photos.map((photo, idx) => (
              <div key={photo.id} className="relative group">
                <img src={photo.url} alt={`Photo ${idx + 1}`} className="w-full h-48 object-cover rounded-xl" />
                <button
                  onClick={() => removePhoto(photo.id)}
                  className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </button>
                {idx === 0 && (
                  <div className="absolute top-2 left-2 bg-fuchsia-500 text-white text-xs px-2 py-1 rounded-full">
                    Main
                  </div>
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
          <h3 className="text-white font-medium text-lg mb-3">
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
              <h4 className="text-white font-medium mb-1">Create your signature 3-second intro</h4>
              <p className="text-zinc-400 text-sm">We’ll trim to exactly 3 seconds when you publish.</p>
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

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={back}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={publish} disabled={!!errorText || saving} className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publishing…</> : <>Publish my profile <Sparkles className="h-4 w-4 ml-2" /></>}
          </Button>
        </div>
        {errorText && <div className="text-sm text-red-400">{errorText}</div>}
      </div>
    </StepShell>
  );

  // ---------- render ----------
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      style={{ overscrollBehavior: "contain" }}
    >
      {/* Header strip to match your modal vibe */}
      <div className="absolute left-0 right-0 top-0 border-b border-zinc-800/50 bg-black/70">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
            <Heart className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold">Splikz Dating</div>
            <div className="text-xs text-zinc-400">Create your dating profile</div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="mt-14 w-full max-w-3xl">
        {step === 0 && <QuickStart />}
        {step === 1 && <Step1Basics />}
        {step === 2 && <Step2Identity />}
        {step === 3 && <Step3Prefs />}
        {step === 4 && (
          <StepShell title="Your interests make you unique" subtitle="Pick a few you’re into">
            <div className="space-y-8">
              {INTEREST_CATEGORIES.map((cat) => (
                <div key={cat.name}>
                  <h3 className="text-white font-medium text-lg mb-3">{cat.name}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {cat.items.map((i) => {
                      const Icon = i.icon;
                      const active = formData.interests.includes(i.id);
                      return (
                        <button
                          key={i.id}
                          onClick={() => toggleArrayItem("interests", i.id)}
                          className={`p-4 rounded-xl border transition-all text-center ${
                            active ? "border-cyan-500 bg-cyan-500/10 text-cyan-300" : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
                          }`}
                        >
                          <Icon className="h-6 w-6 mx-auto mb-2" />
                          <div className="text-sm font-medium">{i.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

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
                className="bg-zinc-800 border-zinc-700 text-white"
                placeholder="Type a custom interest and press Enter…"
              />

              {formData.interests.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.interests.map((i) => (
                    <Badge
                      key={i}
                      className="bg-zinc-800 text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                      onClick={() => toggleArrayItem("interests", i)}
                    >
                      {i} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={back}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={next} className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500">
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </StepShell>
        )}
        {step === 5 && <Step5Media />}
      </div>
    </div>
  );
};

export default DatingOnboarding;
