// src/pages/Dating/DatingHome.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart } from "lucide-react";

/* ---------------- Types & helpers ---------------- */

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

const nameFor = (p?: Profile | null) => {
  if (!p) return "Friend";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.username?.trim() || "Friend";
};

/* ---------------- Page ---------------- */

export default function DatingHome() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showInlineStart, setShowInlineStart] = useState(false);

  // local editable preview (no persistence yet — you said “page first”)
  const [previewName, setPreviewName] = useState("");
  const [previewBio, setPreviewBio] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(auth.user ?? null);

      if (auth.user) {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, display_name, first_name, last_name, avatar_url")
          .eq("id", auth.user.id)
          .maybeSingle();

        const p = (data as Profile) || null;
        setProfile(p);
        setPreviewName(nameFor(p));
        setPreviewBio("");
      } else {
        setProfile(null);
        setPreviewName("");
        setPreviewBio("");
      }
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const avatarInitial =
    profile?.display_name?.[0] ||
    profile?.username?.[0] ||
    user?.email?.[0] ||
    "U";

  return (
    <div className="min-h-[calc(100vh-56px)] bg-black">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-700/30 via-fuchsia-700/10 to-transparent" />
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16 relative">
          <div className="flex items-start gap-6 md:gap-10">
            <div className="hidden md:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 ring-1 ring-white/20">
              <Heart className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                Splikz Dating
              </h1>
              <p className="mt-2 max-w-2xl text-sm md:text-base text-white/70">
                Meet people who vibe with your 3-second world. Share a moment, start a
                conversation, and let your energy do the talking — all in a sleek dark
                space built for real connections.
              </p>

              {/* CTA row */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {!user ? (
                  <>
                    <Button asChild className="bg-white text-black hover:bg-white/90">
                      <Link to="/signup">Create a free account</Link>
                    </Button>
                    <Button asChild variant="outline" className="border-white/30 text-white hover:bg-white/10">
                      <Link to="/login">Log in</Link>
                    </Button>
                    <span className="text-xs text-white/60">
                      Sign up to view profiles and post your 3-second video.
                    </span>
                  </>
                ) : (
                  <>
                    <Button
                      className="bg-white text-black hover:bg-white/90"
                      onClick={() => setShowInlineStart(true)}
                    >
                      Create my dating profile
                    </Button>
                    <span className="text-xs text-white/60">
                      We’ll start with your existing Splikz profile — you can tweak it here.
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Signed-out teaser grid */}
      {!user && (
        <section className="mx-auto max-w-6xl px-4 py-10 md:py-14">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {["Be seen in seconds", "Say more with less", "Private by design"].map((t, i) => (
              <Card key={i} className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white text-base">{t}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/70">
                    {i === 0 &&
                      "Short videos and clean profiles keep things simple — your vibe leads."}
                    {i === 1 &&
                      "Prompts and clips help you spark honest conversation without the noise."}
                    {i === 2 &&
                      "You decide what to share. We keep it minimal, secure, and in your control."}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Inline “getting started” (now routes to onboarding) */}
      {user && showInlineStart && (
        <section className="mx-auto max-w-3xl px-4 py-10 md:py-14">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Set the basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt={nameFor(profile)} />
                  ) : null}
                  <AvatarFallback className="bg-white/10 text-white">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="text-sm">
                  <div className="text-white font-medium">{nameFor(profile)}</div>
                  <div className="text-white/60">
                    @{profile?.username || user?.email?.split("@")[0] || "you"}
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="display_name" className="text-white/80">
                    Display name (you can change it for dating)
                  </Label>
                  <Input
                    id="display_name"
                    value={previewName}
                    onChange={(e) => setPreviewName(e.target.value)}
                    className="bg-black border-white/20 text-white placeholder:text-white/40"
                    placeholder="How should we show your name?"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="bio" className="text-white/80">
                    A quick intro
                  </Label>
                  <Textarea
                    id="bio"
                    value={previewBio}
                    onChange={(e) => setPreviewBio(e.target.value)}
                    className="bg-black border-white/20 text-white placeholder:text-white/40 min-h-[90px]"
                    placeholder="Say hi, share your vibe, or add a fun prompt."
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  className="bg-white text-black hover:bg-white/90"
                  onClick={() => {
                    // prefill onboarding, then navigate
                    localStorage.setItem(
                      "dating_prefill",
                      JSON.stringify({ name: previewName, bio: previewBio })
                    );
                    navigate("/dating/onboarding");
                  }}
                >
                  Save & continue
                </Button>
                <Button
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10"
                  onClick={() => setShowInlineStart(false)}
                >
                  Cancel
                </Button>
                <span className="text-xs text-white/60">
                  You can finish the rest on the next screen.
                </span>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
