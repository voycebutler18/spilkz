// src/pages/dating/DatingOnboarding.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Sparkles, Heart, User, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────────────── helpers ───────────────── */

type BaseProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  city: string | null;
  avatar_url: string | null;
};

function calcAge(dobISO?: string | null) {
  if (!dobISO) return null;
  const d = new Date(dobISO + (dobISO.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

const guessDisplay = (p?: Partial<BaseProfile> | null) => {
  if (!p) return "User";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "User";
};

const SUGGESTED_INTERESTS = [
  "Music", "Foodie", "Travel", "Fitness", "Movies",
  "Reading", "Outdoors", "Gaming", "Art", "Dancing",
  "Pets", "Coffee", "Fashion", "Tech", "Photography",
];

/* ───────────────── component ───────────────── */

export default function DatingOnboarding() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [base, setBase] = useState<BaseProfile | null>(null);

  // dating-form state
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [intent, setIntent] = useState<"long_term" | "short_term" | "friends" | "open_to_chat" | "unsure" | "">("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [showAge, setShowAge] = useState(true);

  const age = useMemo(() => calcAge(base?.dob), [base?.dob]);

  // load auth + base profile
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes.user?.id ?? null;
        setMe(uid);

        if (!uid) {
          setLoading(false);
          toast({
            title: "Please sign in",
            description: "You need an account to set up Dating.",
            variant: "destructive",
          });
          return;
        }

        const { data: p, error } = await supabase
          .from("profiles")
          .select("id, username, display_name, first_name, last_name, dob, city, avatar_url")
          .eq("id", uid)
          .maybeSingle();

        if (error) throw error;

        if (active && p) {
          const base = p as BaseProfile;
          setBase(base);
          setName(guessDisplay(base));
          setCity(base.city || "");
        }

        // If they already have a dating_profile, hydrate the form
        const { data: dp } = await supabase
          .from("dating_profiles")
          .select("name, city, gender, pronouns, intent, bio, interests, show_age")
          .eq("user_id", uid)
          .maybeSingle();

        if (active && dp) {
          setName(dp.name || name);
          setCity(dp.city || base?.city || "");
          setGender(dp.gender || "");
          setPronouns(dp.pronouns || "");
          setIntent((dp.intent as any) || "");
          setBio(dp.bio || "");
          setInterests(Array.isArray(dp.interests) ? dp.interests : []);
          setShowAge(dp.show_age ?? true);
        }
      } catch (e: any) {
        console.error(e);
        toast({
          title: "Couldn’t load your profile",
          description: e?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [toast]);

  const toggleInterest = (tag: string) => {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addInterestFromInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const val = (e.target as HTMLInputElement).value.trim();
    if (e.key === "Enter" && val) {
      e.preventDefault();
      if (!interests.includes(val)) setInterests((p) => [...p, val]);
      (e.target as HTMLInputElement).value = "";
    }
  };

  const onSave = async () => {
    if (!me) {
      toast({ title: "Please sign in", variant: "destructive" });
      return;
    }
    if (!name.trim()) {
      toast({ title: "Add your name", description: "This is what people will see." , variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: me,
        name: name.trim(),
        city: city.trim() || base?.city || null,
        gender: gender || null,
        pronouns: pronouns || null,
        intent: intent || null,
        bio: bio.trim() || null,
        interests,
        show_age: showAge,
      };

      // Upsert (create or update)
      const { error } = await supabase
        .from("dating_profiles")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      toast({ title: "Saved!", description: "Your dating profile has been updated." });
    } catch (e: any) {
      console.error(e);
      const msg = /relation .* dating_profiles .* does not exist/i.test(e?.message || "")
        ? "Missing table 'dating_profiles'. Create it before using this page."
        : (e?.message || "Please try again.");
      toast({ title: "Couldn’t save", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] grid place-items-center bg-black">
        <div className="flex items-center gap-3 text-zinc-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading your details…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/30">
            <Heart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em]">Splikz Dating</h1>
            <p className="text-sm text-zinc-400">Set up how you show up — dark, sleek, and all you.</p>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Form */}
          <Card className="lg:col-span-3 bg-zinc-950 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <SlidersHorizontal className="h-4 w-4 text-zinc-400" />
                Build your dating profile
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Name + City */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name" className="text-zinc-300">Dating name</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="What should people call you?"
                      className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Prefilled from your main profile — change it just for Dating.
                  </p>
                </div>

                <div>
                  <Label htmlFor="city" className="text-zinc-300">City</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Where you’re based"
                    className="mt-1 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>

              {/* Intent */}
              <div>
                <Label className="text-zinc-300">What are you open to?</Label>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { k: "long_term", label: "Long-term" },
                    { k: "short_term", label: "Short-term" },
                    { k: "friends", label: "New friends" },
                    { k: "open_to_chat", label: "Open to chat" },
                    { k: "unsure", label: "Still figuring it out" },
                  ].map((o) => (
                    <button
                      type="button"
                      key={o.k}
                      onClick={() => setIntent(o.k as any)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm",
                        intent === (o.k as any)
                          ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-300"
                          : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800/60 text-zinc-300",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gender / Pronouns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="gender" className="text-zinc-300">Gender</Label>
                  <Input
                    id="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    placeholder="e.g., Woman, Man, Non-binary…"
                    className="mt-1 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div>
                  <Label htmlFor="pronouns" className="text-zinc-300">Pronouns</Label>
                  <Input
                    id="pronouns"
                    value={pronouns}
                    onChange={(e) => setPronouns(e.target.value)}
                    placeholder="e.g., she/her, he/him, they/them"
                    className="mt-1 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>

              {/* Bio */}
              <div>
                <Label htmlFor="bio" className="text-zinc-300">About you</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 300))}
                  placeholder="Give people a feel for your vibe (max 300 chars)"
                  className="mt-1 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                />
                <div className="text-[11px] text-zinc-500 mt-1">{bio.length}/300</div>
              </div>

              {/* Interests */}
              <div>
                <Label className="text-zinc-300">Interests</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SUGGESTED_INTERESTS.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => toggleInterest(tag)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs",
                        interests.includes(tag)
                          ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                          : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800/60 text-zinc-300",
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <Input
                  onKeyDown={addInterestFromInput}
                  placeholder="Press Enter to add your own…"
                  className="mt-2 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                />
                {interests.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {interests.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1 text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="text-sm">
                  <div className="font-medium text-zinc-200">Show my age</div>
                  <div className="text-zinc-500 text-xs">Age is calculated from your main DOB.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAge((s) => !s)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    showAge ? "bg-fuchsia-500/70" : "bg-zinc-700"
                  )}
                  aria-pressed={showAge}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                      showAge ? "translate-x-5" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* Save */}
              <div className="pt-2">
                <Button
                  onClick={onSave}
                  disabled={saving}
                  className="w-full bg-gradient-to-r from-fuchsia-600 to-cyan-500 hover:opacity-90"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Save profile
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live Preview */}
          <Card className="lg:col-span-2 bg-zinc-950 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-zinc-100">Profile preview</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16 ring-2 ring-zinc-800">
                  {base?.avatar_url ? (
                    <AvatarImage src={base.avatar_url} alt={name || "Avatar"} />
                  ) : null}
                  <AvatarFallback className="bg-zinc-800 text-zinc-200">
                    {(name || guessDisplay(base)).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                  <div className="text-xl font-semibold truncate">
                    {name || guessDisplay(base)} {showAge && age ? <span className="text-zinc-400 font-normal">• {age}</span> : null}
                  </div>
                  <div className="text-sm text-zinc-400">
                    {city || base?.city || "Somewhere on Earth"}
                  </div>
                  {(gender || pronouns) && (
                    <div className="text-xs text-zinc-400 mt-1">
                      {[gender, pronouns].filter(Boolean).join(" • ")}
                    </div>
                  )}
                </div>
              </div>

              {bio && (
                <div className="mt-4 text-sm text-zinc-200 whitespace-pre-wrap">
                  {bio}
                </div>
              )}

              {interests.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-zinc-400 mb-2">Interests</div>
                  <div className="flex flex-wrap gap-2">
                    {interests.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {intent && (
                <div className="mt-4 text-xs text-zinc-400">
                  Looking for:{" "}
                  <span className="text-zinc-200">
                    {{
                      long_term: "Long-term",
                      short_term: "Short-term",
                      friends: "New friends",
                      open_to_chat: "Open to chat",
                      unsure: "Still figuring it out",
                    }[intent]}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
