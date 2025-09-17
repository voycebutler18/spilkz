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
  X,
} from "lucide-react";

/* ─────────────────────────────────  constants  ───────────────────────────────── */
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
const SEEKING = ["Men", "Women", "Non-binary folks", "Trans men", "Trans women", "Everyone"];

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
const daysInMonth = (y: number, m1to12: number) => new Date(y, m1to12, 0).getDate();

/* ────────────────────── tiny media uploader (public URL) ────────────────────── */
async function uploadToBucket(bucket: string, file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const path = `${folder}/${name}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/* ───────────────────────────── focus-guard helpers ──────────────────────────── */
/** Remembers the last editable element and snaps focus back if something steals it. */
function useStickyFocus(containerRef: React.RefObject<HTMLElement>) {
  const lastEditable = useRef<HTMLElement | null>(null);
  const setEditable = (el: HTMLElement) => (lastEditable.current = el);

  // Re-focus if the active element jumps outside our container.
  const snapBackSoon = () => {
    const el = lastEditable.current as (HTMLInputElement | HTMLTextAreaElement | null);
    if (!el) return;
    setTimeout(() => {
      const container = containerRef.current;
      const active = document.activeElement as HTMLElement | null;
      if (container && active && !container.contains(active)) {
        const pos = "value" in el ? (el as HTMLInputElement).value.length : undefined;
        el.focus({ preventScroll: true });
        try {
          if (typeof pos === "number") (el as any).setSelectionRange(pos, pos);
        } catch {}
      }
    }, 0);
  };

  // Global capture: if a key happens anywhere while an input is focused, snap back.
  useEffect(() => {
    const guard = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (t as any)?.isContentEditable) {
        lastEditable.current = t as HTMLElement;
      } else {
        // key pressed outside an editor -> make sure we don't lose focus
        snapBackSoon();
      }
    };
    window.addEventListener("keydown", guard, true);
    return () => window.removeEventListener("keydown", guard, true);
  }, []);

  // Field props to attach to editable controls
  const editableProps = {
    onFocusCapture: (e: React.FocusEvent<HTMLElement>) => setEditable(e.currentTarget),
    onKeyDownCapture: () => snapBackSoon(),
    onKeyUpCapture: () => snapBackSoon(),
    onInputCapture: () => snapBackSoon(),
  } as const;

  return editableProps;
}

/* ─────────────────────────────── the component ─────────────────────────────── */
const DatingOnboardingWizard: React.FC = () => {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const fieldGuard = useStickyFocus(pageRef);

  const [step, setStep] = useState(1);
  const totalSteps = 6;
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    city: "",
    dob: "",
    age: "",
    showAge: true,
    bio: "",
    gender: "",
    pronouns: "",
    orientation: "",
    seeking: [] as string[],
    photos: [] as { id: number; url: string; file?: File }[],
    video: null as null | { url: string; file?: File },
  });

  // DOB pieces
  const [yy, setYY] = useState("");
  const [mm, setMM] = useState("");
  const [dd, setDD] = useState("");

  /* ───────────── redirect if profile already exists ───────────── */
  useEffect(() => {
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("dating_profiles")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle();
      if (data) navigate("/dating/discover", { replace: true });
    })();
  }, [navigate]);

  /* ───────────── prefill name/bio from localStorage (home quickstart) ───────────── */
  useEffect(() => {
    const raw = localStorage.getItem("dating_prefill");
    if (raw) {
      const p = JSON.parse(raw);
      setForm((f) => ({ ...f, name: p.name ?? f.name, bio: p.bio ?? f.bio }));
    }
  }, []);

  /* ───────────── keep dob & age in sync ───────────── */
  useEffect(() => {
    if (yy && mm && dd) {
      const iso = `${yy}-${mm}-${dd}`;
      setForm((f) => ({ ...f, dob: iso, age: ageFromISO(iso) }));
    }
  }, [yy, mm, dd]);

  /* ───────────── helpers ───────────── */
  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const toggleIn = (k: "seeking", v: string) =>
    setForm((f) => ({
      ...f,
      [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v],
    }));

  const addPhoto = (file: File) => {
    const url = URL.createObjectURL(file);
    setForm((f) => ({ ...f, photos: [...f.photos, { id: Date.now(), url, file }] }));
  };
  const removePhoto = (id: number) =>
    setForm((f) => ({ ...f, photos: f.photos.filter((p) => p.id !== id) }));
  const addVideo = (file: File) => {
    const url = URL.createObjectURL(file);
    setForm((f) => ({ ...f, video: { url, file } }));
  };

  /* ───────────── validation by step ───────────── */
  const stepError = useMemo((): string | null => {
    switch (step) {
      case 1: {
        if (!form.name.trim()) return "Please enter your name.";
        if (!form.city.trim()) return "Please enter your city.";
        if (!(yy && mm && dd)) return "Please enter your full date of birth.";
        const a = Number(form.age);
        if (!a || a < 18) return "You must be 18 or older.";
        return null;
      }
      case 2:
        if (!form.gender) return "Choose your gender identity.";
        if (!form.pronouns.trim()) return "Select or enter your pronouns.";
        return null;
      case 3:
        if (!form.orientation) return "Pick your orientation.";
        return null;
      case 4:
        if (form.seeking.length < 1) return "Pick at least one for who you want to meet.";
        return null;
      case 5:
        if (!(form.photos.length > 0 || form.video)) return "Add at least one photo or a 3-sec video.";
        return null;
      case 6:
        return null;
      default:
        return null;
    }
  }, [step, form, yy, mm, dd]);

  const next = () => { if (!stepError) setStep((s) => Math.min(totalSteps, s + 1)); };
  const back = () => { if (step === 1) navigate("/dating"); else setStep((s) => Math.max(1, s - 1)); };

  /* ───────────── save ───────────── */
  const publish = async () => {
    if (stepError) return;
    try {
      setSaving(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) { setSaving(false); navigate("/login"); return; }

      const photoUrls: string[] = [];
      for (const ph of form.photos) {
        if (ph.file) photoUrls.push(await uploadToBucket("dating_photos", ph.file, user.id));
      }
      const videoUrl = form.video?.file
        ? await uploadToBucket("dating_videos", form.video.file, user.id)
        : null;

      const { error } = await supabase.from("dating_profiles").upsert(
        {
          user_id: user.id,
          display_name: form.name || null,
          city: form.city || null,
          dob: form.dob || null,
          show_age: form.showAge,
          bio: form.bio || null,
          gender: form.gender || null,
          pronouns: form.pronouns || null,
          orientation: form.orientation || null,
          seeking: form.seeking,
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

  /* ───────────── UI shells ───────────── */
  const StepCard: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle, children }) => (
    <Card className="w-full max-w-3xl mx-auto bg-zinc-950 border-zinc-800 shadow-2xl">
      <CardHeader className="text-center border-b border-zinc-800 pb-6">
        <CardTitle className="text-2xl font-bold text-white">{title}</CardTitle>
        {subtitle && <p className="text-zinc-400 mt-1">{subtitle}</p>}
      </CardHeader>
      <CardContent className="p-8">{children}</CardContent>
    </Card>
  );

  const Progress = () => {
    const pct = Math.round((step / totalSteps) * 100);
    return (
      <div className="w-full max-w-3xl mx-auto mb-6">
        <div className="flex items-center justify-between text-sm text-zinc-400 mb-2">
          <span>Step {step} of {totalSteps}</span>
          <span>{pct}% complete</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full">
          <div className="h-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  /* ───────────── steps ───────────── */
  const renderStep = () => {
    switch (step) {
      case 1: {
        const maxDays = (yy && mm ? daysInMonth(parseInt(yy), parseInt(mm)) : 31) || 31;
        const days = Array.from({ length: maxDays }, (_, i) => String(i + 1).padStart(2, "0"));
        return (
          <StepCard title="Basics" subtitle="Tell us a little about yourself">
            <div className="space-y-6">
              {/* avatar / video */}
              <div className="flex flex-col items-center gap-4">
                <div className="h-28 w-28 rounded-full ring-4 ring-fuchsia-500/30 overflow-hidden bg-zinc-900">
                  {form.video?.url ? (
                    <video src={form.video.url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
                  ) : form.photos[0]?.url ? (
                    <img src={form.photos[0].url} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    <Avatar className="h-28 w-28">
                      <AvatarImage />
                      <AvatarFallback className="bg-zinc-800 text-zinc-300 text-2xl">
                        {form.name ? form.name.charAt(0) : "?"}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 cursor-pointer hover:border-zinc-600">
                    <Plus className="h-4 w-4" /> <span>Add photo</span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])} />
                  </label>

                  <label className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white cursor-pointer hover:from-fuchsia-500 hover:to-purple-500">
                    <Camera className="h-4 w-4" /> <span>Add 3-sec video</span>
                    <input type="file" accept="video/*" className="hidden"
                      onChange={(e) => e.target.files?.[0] && addVideo(e.target.files[0])} />
                  </label>

                  {form.video && (
                    <Button type="button" variant="outline" size="sm" className="h-10 border-zinc-700 text-zinc-300"
                      onClick={() => set("video", null)}>
                      <X className="h-4 w-4 mr-1" /> Remove video
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-zinc-300 text-sm">Your name</Label>
                  <Input
                    {...fieldGuard}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    autoComplete="off"
                    className="mt-2 bg-zinc-900 border-zinc-700 text-white h-12"
                    placeholder="What should people call you?"
                  />
                </div>

                <div>
                  <Label className="text-zinc-300 text-sm">City</Label>
                  <div className="relative mt-2">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
                    <Input
                      {...fieldGuard}
                      value={form.city}
                      onChange={(e) => set("city", e.target.value)}
                      autoComplete="off"
                      className="pl-10 bg-zinc-900 border-zinc-700 text-white h-12"
                      placeholder="Where are you based?"
                    />
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-zinc-300 text-sm">Date of birth</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <select className="bg-zinc-900 border border-zinc-700 text-white h-12 rounded-lg px-3" value={mm} onChange={(e) => setMM(e.target.value)}>
                      <option value="">Month</option>
                      {MONTHS.map((m) => <option key={m.v} value={m.v}>{m.n}</option>)}
                    </select>
                    <select className="bg-zinc-900 border border-zinc-700 text-white h-12 rounded-lg px-3" value={dd} onChange={(e) => setDD(e.target.value)}>
                      <option value="">Day</option>
                      {days.map((d) => <option key={d} value={d}>{parseInt(d, 10)}</option>)}
                    </select>
                    <select className="bg-zinc-900 border border-zinc-700 text-white h-12 rounded-lg px-3" value={yy} onChange={(e) => setYY(e.target.value)}>
                      <option value="">Year</option>
                      {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => String(MAX_YEAR - i)).map((y) =>
                        <option key={y} value={y}>{y}</option>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-zinc-300 text-sm">Age</Label>
                  <Input
                    {...fieldGuard}
                    inputMode="numeric"
                    value={form.age}
                    onChange={(e) => set("age", e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    autoComplete="off"
                    className="mt-2 bg-zinc-900 border-zinc-700 text-white h-12"
                    placeholder="Your age"
                  />
                </div>
              </div>

              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">Show my age</div>
                    <div className="text-zinc-400 text-sm">Age shown: {form.age || "—"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => set("showAge", !form.showAge)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.showAge ? "bg-fuchsia-500" : "bg-zinc-600"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.showAge ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-zinc-300 text-sm">Tell us about yourself</Label>
                <Textarea
                  {...fieldGuard}
                  value={form.bio}
                  onChange={(e) => set("bio", e.target.value.slice(0, 500))}
                  autoComplete="off"
                  className="mt-2 bg-zinc-900 border-zinc-700 text-white min-h-[120px] resize-none"
                  placeholder="Share your vibe, interests, what makes you unique…"
                />
                <div className="text-xs text-zinc-500 mt-2 text-right">{form.bio.length}/500</div>
              </div>
            </div>
          </StepCard>
        );
      }

      case 2:
        return (
          <StepCard title="Identity" subtitle="Gender & pronouns">
            <div className="space-y-8">
              <div>
                <Label className="text-zinc-300 text-sm">Gender identity</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                  {GENDER_IDENTITIES.map((g) => (
                    <button
                      type="button"
                      key={g.id}
                      onClick={() => set("gender", g.id)}
                      className={`p-4 rounded-xl border-2 ${form.gender === g.id ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"}`}
                    >
                      <div className="text-2xl mb-1">{g.icon}</div>
                      <div className="text-white">{g.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-zinc-300 text-sm">Pronouns</Label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {["he/him", "she/her", "they/them", "he/they", "she/they", "ze/zir"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set("pronouns", p)}
                      className={`px-5 py-2 rounded-full border ${form.pronouns === p ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-300" : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <Input
                  {...fieldGuard}
                  value={(["he/him","she/her","they/them","he/they","she/they","ze/zir"].includes(form.pronouns) ? "" : form.pronouns)}
                  onChange={(e) => set("pronouns", e.target.value)}
                  autoComplete="off"
                  className="mt-3 bg-zinc-900 border-zinc-700 text-white"
                  placeholder="Or enter custom pronouns…"
                />
              </div>
            </div>
          </StepCard>
        );

      case 3:
        return (
          <StepCard title="Orientation" subtitle="How do you identify?">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {ORIENTATIONS.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  onClick={() => set("orientation", o.id)}
                  className={`p-5 rounded-xl border-2 ${form.orientation === o.id ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"}`}
                >
                  <div className="text-white">{o.label}</div>
                </button>
              ))}
            </div>
          </StepCard>
        );

      case 4:
        return (
          <StepCard title="Who do you want to meet?" subtitle="Select all that apply">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {SEEKING.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleIn("seeking", s)}
                  className={`p-5 rounded-xl border-2 ${form.seeking.includes(s) ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"}`}
                >
                  <div className="text-white">{s}</div>
                </button>
              ))}
            </div>
          </StepCard>
        );

      case 5:
        return (
          <StepCard title="Photos & 3-sec intro" subtitle="You can add more later in Edit Profile">
            <div className="space-y-8">
              <div>
                <h3 className="text-white font-medium mb-3">Photos</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {form.photos.map((p, i) => (
                    <div key={p.id} className="relative group">
                      <img src={p.url} alt="" className="w-full h-44 object-cover rounded-xl" />
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        className="absolute top-2 right-2 bg-red-500/90 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      {i === 0 && <div className="absolute top-2 left-2 bg-fuchsia-600 text-white text-xs px-2 py-1 rounded-full">Main</div>}
                    </div>
                  ))}
                  {form.photos.length < 6 && (
                    <label className="border-2 border-dashed border-zinc-700 rounded-xl h-44 flex flex-col items-center justify-center cursor-pointer hover:border-zinc-600">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])} />
                      <Plus className="h-8 w-8 text-zinc-500 mb-2" />
                      <span className="text-zinc-400 text-sm">Add photo</span>
                    </label>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-white font-medium mb-3">
                  3-Second Video Intro{" "}
                  <Badge className="ml-2 bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white">
                    <Star className="h-3 w-3 mr-1" /> Recommended
                  </Badge>
                </h3>
                {!form.video ? (
                  <label className="border-2 border-dashed border-fuchsia-500/50 rounded-xl p-8 text-center cursor-pointer hover:border-fuchsia-500/70">
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && addVideo(e.target.files[0])} />
                    <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Camera className="h-7 w-7 text-white" />
                    </div>
                    <div className="text-zinc-300">Upload or record a quick intro (we’ll trim to 3s)</div>
                  </label>
                ) : (
                  <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-r from-fuchsia-500 to-purple-500">
                        <video src={form.video.url} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                      </div>
                      <div className="text-zinc-300 flex-1">Video intro ready</div>
                      <Button type="button" variant="outline" size="sm" onClick={() => set("video", null)} className="border-zinc-700">Re-record</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </StepCard>
        );

      case 6:
        return (
          <StepCard title="Review & publish">
            <div className="space-y-4 text-zinc-300">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full overflow-hidden bg-zinc-800">
                  {form.photos[0]?.url ? (
                    <img src={form.photos[0].url} className="h-full w-full object-cover" />
                  ) : (
                    <Avatar className="h-12 w-12"><AvatarImage /><AvatarFallback>{form.name ? form.name[0] : "?"}</AvatarFallback></Avatar>
                  )}
                </div>
                <div className="font-medium text-white">
                  {form.name || "Your name"}{form.showAge && form.age ? `, ${form.age}` : ""}
                  <div className="text-zinc-400 text-sm flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {form.city || "Your city"}
                  </div>
                </div>
              </div>

              {form.bio && <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">{form.bio}</div>}

              <div className="text-sm text-zinc-400">
                <div><span className="text-zinc-500">Gender:</span> {form.gender || "—"}</div>
                <div><span className="text-zinc-500">Pronouns:</span> {form.pronouns || "—"}</div>
                <div><span className="text-zinc-500">Orientation:</span> {form.orientation || "—"}</div>
                <div><span className="text-zinc-500">Seeking:</span> {form.seeking.join(", ") || "—"}</div>
              </div>
            </div>
          </StepCard>
        );

      default:
        return null;
    }
  };

  const progress = Math.round((step / totalSteps) * 100);

  return (
    <div
      ref={pageRef}
      className="min-h-screen bg-black text-white"
      // page-level guard: if something outside catches keys, snap back to the last input
      onKeyDownCapture={(e) => { /* marks editable if needed via hook */ }}
    >
      {/* top bar */}
      <div className="border-b border-zinc-800/60 bg-black/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
              <Heart className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Splikz Dating</h1>
              <p className="text-sm text-zinc-400">Create your dating profile</p>
            </div>
          </div>
        </div>
      </div>

      {/* content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Progress />
        {renderStep()}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 w-full max-w-3xl mx-auto mt-8">
          <Button type="button" variant="outline" onClick={back} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            <ArrowLeft className="h-4 w-4 mr-2" /> {step === 1 ? "Exit" : "Back"}
          </Button>

          {stepError && <div className="text-sm text-red-400">{stepError}</div>}

          {step === totalSteps ? (
            <Button type="button" onClick={publish} disabled={saving || Boolean(stepError)}
              className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 px-8">
              {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publishing…</>) : (<><Sparkles className="h-4 w-4 mr-2" /> Publish my profile</>)}
            </Button>
          ) : (
            <Button type="button" onClick={next} disabled={Boolean(stepError)}
              className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 px-8 disabled:opacity-60">
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {/* saving overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="bg-zinc-950 border-zinc-700 w-full max-w-md">
            <CardContent className="p-8 text-center">
              <div className="h-16 w-16 bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Publishing your profile…</h3>
              <p className="text-zinc-400 mb-6">We’ll trim your video to exactly 3 seconds.</p>
              <div className="space-y-3 text-sm text-zinc-300">
                <div className="flex items-center gap-3"><Check className="h-4 w-4 text-green-500" /> Profile information saved</div>
                <div className="flex items-center gap-3"><Check className="h-4 w-4 text-green-500" /> Photos added</div>
                <div className="flex items-center gap-3"><Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" /> Processing your 3-sec intro…</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DatingOnboardingWizard;
