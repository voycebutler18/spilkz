import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Heart,
  X,
  MapPin,
  Play,
  Sparkles,
  Loader2,
  Settings,
  MessageCircle,
  Star,
  Info,
  ChevronLeft,
  Filter,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

type DatingProfile = {
  user_id: string;
  name: string;
  age: number;
  bio: string | null;
  photos: string[] | null;
  video_intro_url: string | null;
  city: string | null;
  gender: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  distance?: number; // miles (computed client-side)

  // Optional extras from signup (show in full profile)
  relationship_goal?: string | null;
  has_kids?: string | null;
  wants_kids?: string | null;
  height?: string | null;
  body_type?: string | null;
  education?: string | null;
  religion?: string | null;
  drinking?: string | null;
  smoking?: string | null;
  exercise?: string | null;
  pets?: string | null;
  interests?: string[] | null;
  hobbies?: string[] | null;
};

type MyProfile = {
  user_id: string;
  seeking: string[] | null;
  max_distance: number | null; // miles
  min_age: number | null;
  max_age: number | null;
  location_lat: number | null;
  location_lng: number | null;
};

const SEEKING_OPTIONS = [
  "Men",
  "Women",
  "Non-binary folks",
  "Trans men",
  "Trans women",
  "Everyone",
];

const labelForGender = (g: string | null | undefined) => {
  const v = (g || "").toLowerCase();
  if (["man", "male", "m", "men"].includes(v)) return "Men";
  if (["woman", "female", "f", "women"].includes(v)) return "Women";
  if (["non-binary", "nonbinary", "nb"].includes(v)) return "Non-binary folks";
  if (["trans man", "trans-man", "trans_men", "trans men"].includes(v)) return "Trans men";
  if (["trans woman", "trans-woman", "trans_women", "trans women"].includes(v)) return "Trans women";
  return "Everyone";
};

// Miles between two lat/lngs (rounded)
const milesBetween = (
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
) => {
  if (
    lat1 == null || lon1 == null || lat2 == null || lon2 == null ||
    isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)
  ) return undefined;

  const toRad = (d: number) => (d * Math.PI) / 180;
  const Rkm = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = Rkm * c;
  const miles = km * 0.621371;
  return Math.round(miles);
};

const matchesSeeking = (mySeeking: string[] | null | undefined, theirGender: string | null) => {
  if (!mySeeking || mySeeking.length === 0) return true;
  if (mySeeking.includes("Everyone")) return true;
  const gLabel = labelForGender(theirGender);
  return mySeeking.includes(gLabel);
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const DatingDiscover: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<DatingProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actionInProgress, setActionInProgress] = useState(false);

  // My profile + preferences
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [seeking, setSeeking] = useState<string[]>([]);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [maxDistance, setMaxDistance] = useState(50); // miles
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 50]);

  // Full-profile modal
  const [profileOpen, setProfileOpen] = useState(false);

  // Drag / swipe state
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);

  // ─────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      if (!alive) return;

      setCurrentUser(user);

      // You must have a dating profile
      const { data: profile, error } = await supabase
        .from("dating_profiles")
        .select("user_id,seeking,max_distance,min_age,max_age,location_lat,location_lng")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) console.error(error);

      if (!profile) {
        navigate("/dating/onboarding", { replace: true });
        return;
      }

      const mine: MyProfile = {
        user_id: profile.user_id,
        seeking: profile.seeking ?? [],
        max_distance: profile.max_distance ?? 50,
        min_age: profile.min_age ?? 18,
        max_age: profile.max_age ?? 50,
        location_lat: profile.location_lat ?? null,
        location_lng: profile.location_lng ?? null,
      };

      setMyProfile(mine);
      setSeeking(mine.seeking || []);
      setMaxDistance(mine.max_distance || 50);
      setAgeRange([mine.min_age || 18, mine.max_age || 50]);

      await fetchMatches(user.id, mine);
      if (!alive) return;
      setLoading(false);
    })();

    return () => { alive = false; };
  }, [navigate]);

  // ─────────────────────────────────────────────
  // Fetch candidates
  // ─────────────────────────────────────────────
  const fetchMatches = async (userId: string, mine: MyProfile) => {
    try {
      const { data: actions } = await supabase
        .from("dating_likes")
        .select("liked_id,action")
        .eq("liker_id", userId);

      const excludeIds = new Set((actions || []).map((a: any) => a.liked_id));

      let rows: any[] | null = null;
      try {
        const { data, error } = await supabase.rpc("dating_candidates", {
          p_user_id: userId,
          p_limit: 50,
        });
        if (!error && Array.isArray(data)) rows = data as any[];
      } catch {}

      if (!rows) {
        const { data, error } = await supabase
          .from("dating_profiles")
          .select(
            [
              "user_id","name","age","bio","photos","video_intro_url","city","gender",
              "location_lat","location_lng","is_active",
              // include extended fields if present in your table
              "relationship_goal","has_kids","wants_kids","height","body_type",
              "education","religion","drinking","smoking","exercise","pets",
              "interests","hobbies",
            ].join(",")
          )
          .eq("is_active", true)
          .neq("user_id", userId)
          .limit(100);

        if (error) throw error;
        rows = data || [];
      }

      const filtered = rows
        .filter((r) => !excludeIds.has(r.user_id))
        .filter((r) => {
          const age = Number(r.age) || 0;
          if (age < (mine.min_age || 18) || age > (mine.max_age || 50)) return false;
          return matchesSeeking(mine.seeking, r.gender);
        })
        .map((r) => {
          const dist = milesBetween(
            mine.location_lat, mine.location_lng, r.location_lat, r.location_lng
          );
          return { ...r, distance: dist } as DatingProfile;
        })
        .filter((r) => {
          if (mine.location_lat == null || mine.location_lng == null) return true;
          if (r.distance == null) return true;
          return r.distance <= (mine.max_distance || 50);
        });

      // Sort by video/photo first, then nearest
      filtered.sort((a, b) => {
        const av = a.video_intro_url ? 0 : 1;
        const bv = b.video_intro_url ? 0 : 1;
        if (av !== bv) return av - bv;
        const ap = a.photos?.length ? 0 : 1;
        const bp = b.photos?.length ? 0 : 1;
        if (ap !== bp) return ap - bp;
        const ad = a.distance ?? 99999;
        const bd = b.distance ?? 99999;
        return ad - bd;
      });

      setProfiles(filtered);
      setCurrentIndex(0);
    } catch (err) {
      console.error("Error fetching matches:", err);
      toast({
        title: "Error loading matches",
        description: "Please try refreshing the page.",
        variant: "destructive",
      });
    }
  };

  // ─────────────────────────────────────────────
  // Actions  ✅ super-like works with any schema
  // ─────────────────────────────────────────────
  const act = async (action: "like" | "pass", opts?: { super?: boolean }) => {
    if (actionInProgress || currentIndex >= profiles.length || !currentUser) return;

    setActionInProgress(true);
    const current = profiles[currentIndex];

    try {
      // Save only values your DB definitely supports
      const { error } = await supabase.from("dating_likes").insert({
        liker_id: currentUser.id,
        liked_id: current.user_id,
        action, // "like" or "pass" only
      });
      if (error) throw error;

      // If it's a like (normal or super), check for mutual like
      if (action === "like") {
        const { data: back } = await supabase
          .from("dating_likes")
          .select("id")
          .eq("liker_id", current.user_id)
          .eq("liked_id", currentUser.id)
          .eq("action", "like")
          .maybeSingle();

        if (back) {
          toast({
            title: "It's a Match! 🎉",
            description: `You and ${current.name} liked each other`,
          });
        } else if (opts?.super) {
          toast({
            title: "Super Like sent ⚡",
            description: `${current.name} will see you boosted.`,
          });
        }
      }

      setCurrentIndex((i) => i + 1);
      setCardStyle({});
      setProfileOpen(false);
    } catch (err) {
      console.error("Action error:", err);
      toast({
        title: "Something went wrong",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  // helpers
  const handleAction = (a: "like" | "pass") => act(a);
  const handleSuperLike = () => act("like", { super: true });

  // ─────────────────────────────────────────────
  // Drag/swipe + keyboard
  // ─────────────────────────────────────────────
  const handleStart = (clientX: number) => {
    isDraggingRef.current = true;
    startXRef.current = clientX;
    setCardStyle((s) => ({ ...s, transition: "none" }));
  };
  const handleMove = (clientX: number) => {
    if (!isDraggingRef.current) return;
    const deltaX = clientX - startXRef.current;
    const rotation = deltaX * 0.08;
    const opacity = Math.min(1, 1 - Math.min(Math.abs(deltaX) / 1000, 0.3));
    setCardStyle({
      transform: `translateX(${deltaX}px) rotate(${rotation}deg)`,
      opacity,
      transition: "none",
      cursor: "grabbing",
    });
  };
  const handleEnd = (clientX: number) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const deltaX = clientX - startXRef.current;

    if (Math.abs(deltaX) > 120) {
      if (deltaX > 0) handleAction("like");
      else handleAction("pass");
    } else {
      setCardStyle({
        transform: "translateX(0px) rotate(0deg)",
        opacity: 1,
        transition: "all 0.25s ease-out",
        cursor: "grab",
      });
    }
  };

  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX);
  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX);
  const onMouseUp = (e: React.MouseEvent) => handleEnd(e.clientX);
  const onMouseLeave = (e: React.MouseEvent) => { if (isDraggingRef.current) handleEnd(e.clientX); };

  const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX);
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    handleEnd(t?.clientX ?? startXRef.current);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handleAction("pass");
      if (e.key === "ArrowRight") handleAction("like");
      if (e.key.toLowerCase() === "i") setProfileOpen(true); // quick open
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, currentIndex, actionInProgress]);

  // ─────────────────────────────────────────────
  // Save preferences
  // ─────────────────────────────────────────────
  const savePreferences = async () => {
    if (!currentUser) return;
    setSavingPrefs(true);

    try {
      const { error } = await supabase
        .from("dating_profiles")
        .update({
          seeking,
          max_distance: maxDistance, // miles
          min_age: ageRange[0],
          max_age: ageRange[1],
        })
        .eq("user_id", currentUser.id);

      if (error) throw error;

      setPrefsOpen(false);
      toast({
        title: "Preferences saved",
        description: "Your matching preferences have been updated.",
      });

      if (myProfile) {
        const updated: MyProfile = {
          ...myProfile,
          seeking,
          max_distance: maxDistance,
          min_age: ageRange[0],
          max_age: ageRange[1],
        };
        setMyProfile(updated);
        await fetchMatches(currentUser.id, updated);
      }
    } catch (err) {
      console.error("Error saving preferences:", err);
      toast({
        title: "Error saving preferences",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingPrefs(false);
    }
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 className="h-12 w-12 animate-spin text-fuchsia-500" />
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Finding your matches</h2>
            <p className="text-zinc-400">Looking for amazing people nearby…</p>
          </div>
        </div>
      </div>
    );
  }

  const hasProfiles = currentIndex < profiles.length;
  const currentProfile = hasProfiles ? profiles[currentIndex] : null;

  const DetailRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex items-start gap-3">
        <span className="text-zinc-400 w-36 shrink-0">{label}</span>
        <span className="text-white">{value}</span>
      </div>
    ) : null;

  const PillList = ({ label, items }: { label: string; items?: string[] | null }) =>
    items && items.length ? (
      <div>
        <div className="text-zinc-400 mb-2">{label}</div>
        <div className="flex flex-wrap gap-2">
          {items.map((t, i) => (
            <span key={i} className="text-xs bg-white/10 border border-white/10 rounded-full px-2 py-1 text-white">
              {t}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900">
      {/* Header */}
      <div className="border-b border-zinc-800/50 bg-black/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/dating">
                <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Discover</h1>
                <p className="text-sm text-zinc-400">
                  {hasProfiles ? `${profiles.length - currentIndex} profiles remaining` : "All caught up!"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrefsOpen(true)}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>

              <Link to="/dating/hearts">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <Heart className="h-4 w-4 mr-2" />
                  My Hearts
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {!hasProfiles ? (
          <Card className="bg-black/40 border-zinc-700 backdrop-blur text-center">
            <CardContent className="p-12">
              <div className="bg-gradient-to-r from-fuchsia-500 to-purple-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Star className="h-10 w-10 text-white" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-4">You're all caught up!</h2>
              <p className="text-zinc-400 mb-8 max-w-md mx-auto">
                No more profiles match your current preferences. Try adjusting your filters or check back later for new people.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  onClick={() => setPrefsOpen(true)}
                  className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Adjust Filters
                </Button>

                <Link to="/dating/hearts">
                  <Button
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 w-full"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    View Hearts
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="relative">
            <Card
              className="bg-black/40 border-zinc-700 backdrop-blur overflow-hidden select-none"
              style={cardStyle}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {/* Media */}
              <div className="relative h-[600px] bg-gradient-to-b from-zinc-800 to-zinc-900 cursor-grab">
                {currentProfile?.video_intro_url ? (
                  <>
                    <video
                      src={currentProfile.video_intro_url}
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                    <Badge className="absolute top-4 left-4 bg-gradient-to-r from-fuchsia-600 to-purple-600 border-0">
                      <Play className="h-3 w-3 mr-1" />
                      3s intro
                    </Badge>
                  </>
                ) : currentProfile?.photos?.length ? (
                  <img
                    src={currentProfile.photos[0]}
                    alt={currentProfile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Avatar className="h-32 w-32">
                      <AvatarImage />
                      <AvatarFallback className="text-4xl bg-zinc-800 text-zinc-300">
                        {currentProfile?.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}

                {/* Photo dots */}
                {currentProfile?.photos && currentProfile.photos.length > 1 && (
                  <div className="absolute top-4 right-4 flex gap-1">
                    {currentProfile.photos.slice(0, 6).map((_, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-white/40 backdrop-blur" />
                    ))}
                  </div>
                )}

                {/* Distance badge (miles) */}
                {typeof currentProfile?.distance === "number" && (
                  <Badge
                    variant="secondary"
                    className="absolute top-4 right-4 bg-black/60 text-white border-0 backdrop-blur"
                  >
                    <MapPin className="h-3 w-3 mr-1" />
                    {currentProfile.distance}mi away
                  </Badge>
                )}

                {/* Gradient + info */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="text-white space-y-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-3xl font-bold">
                        {currentProfile?.name}
                        <span className="text-2xl font-normal text-zinc-300 ml-2">
                          {currentProfile?.age}
                        </span>
                      </h2>
                    </div>

                    {currentProfile?.city && (
                      <div className="flex items-center gap-1 text-zinc-300">
                        <MapPin className="h-4 w-4" />
                        <span>{currentProfile.city}</span>
                      </div>
                    )}

                    {currentProfile?.bio && (
                      <p className="text-white/90 text-sm leading-relaxed mt-3 line-clamp-3">
                        {currentProfile.bio}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProfileOpen(true)}
                  title="View full profile"
                  className="absolute bottom-4 right-4 text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Info className="h-4 w-4" />
                </Button>
              </div>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-center gap-8 mt-6">
              <Button
                size="lg"
                onClick={() => handleAction("pass")}
                disabled={actionInProgress}
                className="h-16 w-16 rounded-full bg-white/10 border-2 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all shadow-lg"
                variant="outline"
                title="Pass"
              >
                <X className="h-8 w-8 text-red-400" />
              </Button>

              <Button
                size="lg"
                onClick={() => handleAction("like")}
                disabled={actionInProgress}
                className="h-20 w-20 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 shadow-2xl shadow-fuchsia-500/30 border-2 border-fuchsia-400/50 relative overflow-hidden"
                title="Like"
              >
                <Heart className="h-10 w-10 text-white relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
              </Button>

              {/* Super Like (blue) */}
              <Button
                size="lg"
                onClick={handleSuperLike}
                disabled={actionInProgress}
                className="h-16 w-16 rounded-full bg-white/10 border-2 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all shadow-lg"
                variant="outline"
                title="Super Like"
                aria-label="Super Like"
              >
                <Zap className="h-8 w-8 text-blue-400" />
              </Button>
            </div>

            <div className="flex justify-between items-center mt-6 px-4 text-sm text-zinc-500">
              <div className="flex items-center gap-1">
                <X className="h-4 w-4 text-red-400" />
                <span>Swipe left to pass</span>
              </div>
              <div className="flex items-center gap-1">
                <span>Swipe right to like</span>
                <Heart className="h-4 w-4 text-fuchsia-400" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full Profile Modal */}
      {profileOpen && currentProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl bg-black/90 border-zinc-700 backdrop-blur overflow-hidden">
            <CardContent className="p-0">
              {/* Header media */}
              <div className="relative h-72 bg-zinc-900">
                {currentProfile.video_intro_url ? (
                  <video
                    src={currentProfile.video_intro_url}
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : currentProfile.photos?.length ? (
                  <img
                    src={currentProfile.photos[0]}
                    alt={currentProfile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Avatar className="h-24 w-24">
                      <AvatarImage />
                      <AvatarFallback className="text-3xl bg-zinc-800 text-zinc-300">
                        {currentProfile.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProfileOpen(false)}
                  className="absolute top-3 right-3 text-white/80 hover:text-white hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="p-6 space-y-6">
                {/* Name / age / distance */}
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold text-white">
                    {currentProfile.name} <span className="text-zinc-300 font-normal">{currentProfile.age}</span>
                  </h2>
                  {typeof currentProfile.distance === "number" && (
                    <Badge variant="secondary" className="bg:white/10 bg-white/10 text-white border-0">
                      <MapPin className="h-3 w-3 mr-1" />
                      {currentProfile.distance}mi away
                    </Badge>
                  )}
                </div>

                {/* Bio */}
                {currentProfile.bio && (
                  <div className="text-zinc-200">{currentProfile.bio}</div>
                )}

                {/* Gallery */}
                {currentProfile.photos?.length ? (
                  <div>
                    <div className="text-zinc-400 mb-2">Photos</div>
                    <div className="grid grid-cols-3 gap-2">
                      {currentProfile.photos.map((p, i) => (
                        <img key={i} src={p} alt={`Photo ${i + 1}`} className="h-28 w-full object-cover rounded-md" />
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Details */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <DetailRow label="Looking for" value={currentProfile.relationship_goal || undefined} />
                  <DetailRow label="Height" value={currentProfile.height || undefined} />
                  <DetailRow label="Body type" value={currentProfile.body_type || undefined} />
                  <DetailRow label="Education" value={currentProfile.education || undefined} />
                  <DetailRow label="Religion" value={currentProfile.religion || undefined} />
                  <DetailRow label="Drinking" value={currentProfile.drinking || undefined} />
                  <DetailRow label="Smoking" value={currentProfile.smoking || undefined} />
                  <DetailRow label="Exercise" value={currentProfile.exercise || undefined} />
                  <DetailRow label="Kids" value={currentProfile.has_kids || undefined} />
                  <DetailRow label="Wants kids" value={currentProfile.wants_kids || undefined} />
                  <DetailRow label="Pets" value={currentProfile.pets || undefined} />
                </div>

                <PillList label="Interests" items={currentProfile.interests || undefined} />
                <PillList label="Hobbies" items={currentProfile.hobbies || undefined} />

                {/* Action row inside modal */}
                <div className="flex items-center justify-center gap-6 pt-2">
                  <Button
                    size="lg"
                    onClick={() => handleAction("pass")}
                    disabled={actionInProgress}
                    className="h-14 w-14 rounded-full bg-white/10 border-2 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                    variant="outline"
                    title="Pass"
                  >
                    <X className="h-7 w-7 text-red-400" />
                  </Button>

                  <Button
                    size="lg"
                    onClick={() => handleAction("like")}
                    disabled={actionInProgress}
                    className="h-16 w-16 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 border-2 border-fuchsia-400/50 relative overflow-hidden"
                    title="Like"
                  >
                    <Heart className="h-9 w-9 text-white relative z-10" />
                    <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
                  </Button>

                  <Button
                    size="lg"
                    onClick={handleSuperLike}
                    disabled={actionInProgress}
                    className="h-14 w-14 rounded-full bg-white/10 border-2 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all"
                    variant="outline"
                    title="Super Like"
                  >
                    <Zap className="h-7 w-7 text-blue-400" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Preferences Modal */}
      {prefsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg bg-black/90 border-zinc-700 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Match Preferences</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPrefsOpen(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-6">
                {/* Seeking */}
                <div>
                  <h4 className="text-white font-medium mb-3">Looking for</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {SEEKING_OPTIONS.map((option) => (
                      <button
                        key={option}
                        onClick={() =>
                          setSeeking((prev) =>
                            prev.includes(option)
                              ? prev.filter((x) => x !== option)
                              : [...prev, option]
                          )
                        }
                        className={`p-3 rounded-lg text-sm text-left transition-colors ${
                          seeking.includes(option)
                            ? "bg-gradient-to-r from-fuchsia-600/20 to-purple-600/20 border-fuchsia-500 text-fuchsia-200 border"
                            : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600 border"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Distance (miles) */}
                <div>
                  <h4 className="text-white font-medium mb-3">
                    Maximum Distance: {maxDistance} mi
                  </h4>
                  <input
                    type="range"
                    min={1}
                    max={200}
                    value={maxDistance}
                    onChange={(e) => setMaxDistance(parseInt(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Age Range */}
                <div>
                  <h4 className="text-white font-medium mb-3">
                    Age Range: {ageRange[0]} - {ageRange[1]}
                  </h4>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs text-zinc-400">Min Age</label>
                      <input
                        type="number"
                        min={18}
                        max={100}
                        value={ageRange[0]}
                        onChange={(e) =>
                          setAgeRange([clamp(parseInt(e.target.value), 18, ageRange[1]), ageRange[1]])
                        }
                        className="w-full mt-1 p-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-zinc-400">Max Age</label>
                      <input
                        type="number"
                        min={18}
                        max={100}
                        value={ageRange[1]}
                        onChange={(e) =>
                          setAgeRange([ageRange[0], clamp(parseInt(e.target.value), ageRange[0], 100)])
                        }
                        className="w-full mt-1 p-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <Button
                  onClick={savePreferences}
                  disabled={savingPrefs}
                  className="flex-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
                >
                  {savingPrefs ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save Preferences"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPrefsOpen(false)}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DatingDiscover;
