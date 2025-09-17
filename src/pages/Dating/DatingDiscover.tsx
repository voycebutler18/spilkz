// src/pages/Dating/DatingDiscover.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, X, MapPin, Play, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type FeedCard = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  avatar_url: string | null;
  video_intro_url: string | null;
};

const SEEKING_OPTIONS = [
  "Men",
  "Women",
  "Non-binary folks",
  "Trans men",
  "Trans women",
  "Everyone",
];

const DatingDiscover: React.FC = () => {
  const nav = useNavigate();

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [busy, setBusy] = useState(false);

  // quick “who I want to meet” editor
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [seeking, setSeeking] = useState<string[]>([]);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // ---------- helpers ----------
  const fetchSeeking = async (uid: string) => {
    const { data } = await supabase
      .from("dating_profiles")
      .select("seeking")
      .eq("user_id", uid)
      .maybeSingle();
    setSeeking(data?.seeking ?? []);
  };

  const fetchCards = async (uid: string) => {
    // IMPORTANT: this calls the SQL function that only returns people
    // who actually created a dating profile
    const { data, error } = await supabase.rpc("dating_candidates", {
      p_user_id: uid,
      p_limit: 25,
    });
    if (error) {
      console.error(error);
      setCards([]);
    } else {
      setCards((data as FeedCard[]) ?? []);
    }
  };

  // ---------- initial load ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (!uid) return nav("/login", { replace: true });
      if (!alive) return;

      setMe(uid);

      // make sure user HAS a dating profile; otherwise send to onboarding
      const { data: dp, error: dpErr } = await supabase
        .from("dating_profiles")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (dpErr) console.error(dpErr);

      if (!dp) {
        // no dating profile yet
        setLoading(false);
        return nav("/dating/onboarding", { replace: true });
      }

      await Promise.all([fetchSeeking(uid), fetchCards(uid)]);
      if (!alive) return;
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [nav]);

  const name = useMemo(
    () => (cards[0]?.display_name?.trim() || "Someone"),
    [cards]
  );

  // ---------- actions ----------
  const act = async (type: "like" | "pass") => {
    if (!me || !cards[0]) return;
    if (busy) return;
    setBusy(true);

    const current = cards[0];

    try {
      // record the action
      const { error } = await supabase.from("dating_likes").insert({
        liker_id: me,
        liked_id: current.user_id,
        action: type,
      });
      if (error) throw error;

      // if LIKE, check for mutual like
      if (type === "like") {
        const { data: back } = await supabase
          .from("dating_likes")
          .select("id")
          .eq("liker_id", current.user_id)
          .eq("liked_id", me)
          .eq("action", "like")
          .maybeSingle();

        if (back) {
          alert(`It's a match with ${name}! 🎉`);
          // optionally: nav("/dating/hearts");
        }
      }

      // advance to next
      setCards((old) => old.slice(1));
    } catch (e) {
      console.error(e);
      alert("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSeek = (val: string) =>
    setSeeking((cur) =>
      cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]
    );

  const saveSeeking = async () => {
    if (!me) return;
    setSavingPrefs(true);
    try {
      const { error } = await supabase
        .from("dating_profiles")
        .update({ seeking })
        .eq("user_id", me);
      if (error) throw error;

      setPrefsOpen(false);
      await fetchCards(me); // refresh feed with new filter
    } catch (e) {
      console.error(e);
      alert("Could not save preferences. Please try again.");
    } finally {
      setSavingPrefs(false);
    }
  };

  // ---------- render ----------
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading people near you…
        </div>
      </div>
    );
  }

  const current = cards[0] ?? null;

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Discover</h1>
            <p className="text-sm text-zinc-400">Swipe through 3-sec vibes</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-zinc-700 text-zinc-300"
            onClick={() => setPrefsOpen(true)}
          >
            Edit who I want to meet
          </Button>
          <Link to="/dating/hearts">
            <Button variant="outline" className="border-zinc-700 text-zinc-300">
              My Hearts
            </Button>
          </Link>
        </div>
      </div>

      {!current ? (
        <Card className="max-w-2xl mx-auto bg-zinc-950 border-zinc-800">
          <CardContent className="p-10 text-center space-y-4">
            <div className="text-2xl">You’re all caught up 🎉</div>
            <p className="text-zinc-400">
              No more cards right now. Try adjusting{" "}
              <button
                className="underline"
                onClick={() => setPrefsOpen(true)}
              >
                who you want to meet
              </button>
              , check your{" "}
              <Link to="/dating/hearts" className="underline">
                Hearts
              </Link>{" "}
              or come back later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="max-w-2xl mx-auto">
          <Card className="bg-zinc-950 border-zinc-800 overflow-hidden">
            <div className="relative h-[520px] bg-black">
              {current.video_intro_url ? (
                <video
                  src={current.video_intro_url}
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : current.avatar_url ? (
                <img
                  src={current.avatar_url}
                  alt={name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                  <Avatar className="h-32 w-32">
                    <AvatarImage />
                    <AvatarFallback className="text-3xl bg-zinc-800">
                      {name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}

              {current.video_intro_url && (
                <Badge className="absolute top-4 left-4 bg-fuchsia-600">
                  <Play className="h-3 w-3 mr-1" />
                  3s intro
                </Badge>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/70 to-transparent">
                <div className="text-white text-xl font-semibold">{name}</div>
                <div className="text-zinc-300 text-sm flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {current.city || "Nearby"}
                </div>
              </div>
            </div>

            <CardContent className="p-5">
              <div className="flex items-center justify-center gap-6">
                <Button
                  size="lg"
                  disabled={busy}
                  onClick={() => act("pass")}
                  className="h-14 w-14 rounded-full bg-white/10 border border-white/20 hover:bg-white/20"
                  variant="outline"
                  title="Pass"
                >
                  <X className="h-6 w-6 text-white" />
                </Button>

                <Button
                  size="lg"
                  disabled={busy}
                  onClick={() => act("like")}
                  className="h-16 w-16 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 shadow-lg shadow-fuchsia-500/25"
                  title="Heart"
                >
                  <Heart className="h-7 w-7 text-white" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Simple preferences overlay */}
      {prefsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Who I want to meet
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {SEEKING_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => toggleSeek(opt)}
                  className={`rounded-lg border px-3 py-2 text-left ${
                    seeking.includes(opt)
                      ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <Button className="flex-1" onClick={saveSeeking} disabled={savingPrefs}>
                {savingPrefs ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-zinc-700 text-zinc-300"
                onClick={() => setPrefsOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatingDiscover;
