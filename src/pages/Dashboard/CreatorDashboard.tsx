// src/pages/ProfilePage.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, MapPin, Calendar, MessageSquare, Upload, Home, Link2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const AVATAR_BUCKET = "avatars";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  city: string | null;
  avatar_url: string | null;
  created_at: string;
};

const FIELDS = "id,username,display_name,bio,city,avatar_url,created_at";
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export default function ProfilePage() {
  // ✅ Accept BOTH param names (`/profile/:id` or `/creator/:slug`)
  const params = useParams();
  const rawParam = (params.id ?? params.slug ?? "").trim();

  const navigate = useNavigate();
  const { toast } = useToast();

  const [me, setMe] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");

  // Stats
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [totalBoosts, setTotalBoosts] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  // who am I
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  // -------- load profile (uuid OR username OR "me") --------
  useEffect(() => {
    let cancelled = false;

    const loadById = async (id: string) =>
      supabase.from("profiles").select(FIELDS).eq("id", id).maybeSingle<Profile>();

    const loadByUsername = async (u: string) => {
      // strip accidental leading '@'
      const uname = u.replace(/^@/, "");
      const first = await supabase
        .from("profiles")
        .select(FIELDS)
        .ilike("username", uname)
        .maybeSingle<Profile>();
      if (first.data || first.error) return first;
      return supabase.from("profiles").select(FIELDS).eq("username", uname.toLowerCase()).maybeSingle<Profile>();
    };

    const run = async () => {
      const p = rawParam;

      if (!p) {
        setLoading(false);
        setProfile(null);
        return;
      }

      setLoading(true);
      try {
        let data: Profile | null = null;
        let err: any = null;

        if (p.toLowerCase() === "me") {
          const { data: session } = await supabase.auth.getSession();
          const uid = session?.session?.user?.id || me;
          if (uid) {
            const res = await loadById(uid);
            data = res.data || null;
            err = res.error || null;
          }
        } else if (isUuid(p)) {
          const res = await loadById(p);
          data = res.data || null;
          err = res.error || null;
        } else {
          const res = await loadByUsername(p);
          data = res.data || null;
          err = res.error || null;
        }

        if (err) throw err;

        if (!cancelled) {
          setProfile(data || null);
          setDisplayName(data?.display_name || "");
          setBio(data?.bio || "");
          setCity(data?.city || "");
        }
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          setProfile(null);
          toast({
            title: "Failed to load profile",
            description: e.message || "Please try again.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawParam, me]);

  // -------- load stats (public snapshot; 0s if RLS blocks) --------
  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      if (!profile?.id) return;
      setStatsLoading(true);
      try {
        const { count: followersCount } = await supabase
          .from("followers")
          .select("*", { head: true, count: "exact" })
          .eq("following_id", profile.id);

        const { count: followingCount } = await supabase
          .from("followers")
          .select("*", { head: true, count: "exact" })
          .eq("follower_id", profile.id);

        let boostsCount = 0;
        const { data: spliks, error: spliksErr } = await supabase
          .from("spliks")
          .select("id")
          .eq("user_id", profile.id)
          .limit(1000);
        if (spliksErr) throw spliksErr;

        const ids = (spliks || []).map((s) => s.id);
        if (ids.length) {
          const { count } = await supabase
            .from("boosts")
            .select("*", { head: true, count: "exact" })
            .in("splik_id", ids);
          boostsCount = count ?? 0;
        }

        if (!cancelled) {
          setFollowers(followersCount ?? 0);
          setFollowing(followingCount ?? 0);
          setTotalBoosts(boostsCount);
        }
      } catch (e) {
        console.warn("Stats load failed:", e);
        if (!cancelled) {
          setFollowers(0);
          setFollowing(0);
          setTotalBoosts(0);
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };

    loadStats();

    const ch = profile?.id
      ? supabase
          .channel(`followers-${profile.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "followers", filter: `following_id=eq.${profile.id}` },
            loadStats
          )
          .subscribe()
      : null;

    return () => {
      if (ch) {
        try { supabase.removeChannel(ch); } catch {}
      }
      cancelled = true;
    };
  }, [profile?.id]);

  const isOwn = useMemo(() => me && profile && me === profile.id, [me, profile]);

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const updates = {
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        city: city.trim() || null,
      };
      const { error } = await supabase.from("profiles").update(updates).eq("id", profile.id);
      if (error) throw error;
      setProfile({ ...profile, ...updates });
      setEditing(false);
      toast({ title: "Profile updated" });
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Couldn’t save",
        description: e.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const onAvatarChange = async (file?: File) => {
    if (!file || !profile) return;
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("Failed to get public URL");

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);
      if (updErr) throw updErr;

      setProfile({ ...profile, avatar_url: publicUrl });
      toast({ title: "Profile picture updated" });
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Upload failed",
        description: e.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const joinedWhen = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long" })
      : "Unknown";

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          <Card className="max-w-xl mx-auto">
            <CardHeader>
              <CardTitle>Profile not found</CardTitle>
              <CardDescription>The requested profile could not be located.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild><Link to="/">Go Home</Link></Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  const nameOrUser = profile.display_name || profile.username || "Unnamed User";
  const handleCopyLink = async () => {
    const url = `${window.location.origin.replace(/\/$/, "")}/creator/${profile.username || profile.id}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Profile link copied" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero / cover */}
      <div className="relative">
        <div className="h-36 sm:h-48 w-full rounded-none sm:rounded-b-2xl border-b border-white/10 bg-gradient-to-r from-violet-600/25 via-fuchsia-500/15 to-emerald-500/15" />
        <div
          className="absolute inset-0 pointer-events-none opacity-60 mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(600px 120px at 20% 0%, rgba(255,255,255,0.08) 0%, transparent 70%), radial-gradient(400px 160px at 80% 0%, rgba(255,255,255,0.06) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="container mx-auto px-4 -mt-12 sm:-mt-16">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <Avatar className="h-28 w-28 sm:h-32 sm:w-32 ring-4 ring-background shadow-xl">
              <AvatarImage src={profile.avatar_url || ""} />
              <AvatarFallback className="text-2xl">
                {nameOrUser.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {isOwn && (
              <label className="absolute -bottom-2 -right-2 inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg cursor-pointer hover:scale-105 transition">
                <Upload className="h-4 w-4" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onAvatarChange(e.target.files?.[0])} />
              </label>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{nameOrUser}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {profile.username && (
                    <span className="px-2 py-0.5 rounded-full bg-muted/60 border border-border text-xs">
                      @{profile.username}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {profile.city || "Unknown location"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-4 w-4" /> Joined {joinedWhen(profile.created_at)}
                  </span>
                </div>

                {/* Stats row */}
                <div className="mt-3 flex gap-6 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xl font-bold tabular-nums">{statsLoading ? "—" : totalBoosts}</span>
                    <span className="text-muted-foreground">Boosts</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xl font-bold tabular-nums">{statsLoading ? "—" : followers}</span>
                    <span className="text-muted-foreground">Followers</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xl font-bold tabular-nums">{statsLoading ? "—" : following}</span>
                    <span className="text-muted-foreground">Following</span>
                  </div>
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleCopyLink}>
                  <Link2 className="h-4 w-4 mr-2" /> Copy Link
                </Button>
                {isOwn ? (
                  <Button onClick={() => setEditing((v) => !v)}>{editing ? "Close Edit" : "Edit Profile"}</Button>
                ) : (
                  <>
                    <Button onClick={() => navigate(`/messages/${profile.id}`)} variant="secondary">
                      <MessageSquare className="h-4 w-4 mr-2" /> Message
                    </Button>
                    <Button onClick={() => navigate(`/creator/${profile.username || profile.id}`)}>
                      <Home className="h-4 w-4 mr-2" /> View Creator Page
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column */}
          <div className="lg:col-span-4 lg:sticky lg:top-20 h-fit">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>About</CardTitle>
                <CardDescription>Basic info that other users see</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {profile.bio || <span className="text-muted-foreground">No bio provided.</span>}
                </div>
                {!isOwn && (
                  <div className="pt-3 border-t text-sm text-muted-foreground">
                    Be respectful when messaging or commenting.
                  </div>
                )}
              </CardContent>
            </Card>

            {isOwn && editing && (
              <Card className="mt-6 shadow-sm">
                <CardHeader>
                  <CardTitle>Edit Profile</CardTitle>
                  <CardDescription>Update your public information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Bio</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl border bg-background min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveProfile} disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column */}
          <div className="lg:col-span-8">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{isOwn ? "Your actions" : `${nameOrUser}'s actions`}</CardTitle>
                <CardDescription>Quick shortcuts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => navigate("/upload")}>Upload Video</Button>
                  <Button variant="outline" onClick={() => navigate(`/creator/${profile.username || profile.id}`)}>
                    Open Creator Page
                  </Button>
                  {!isOwn && (
                    <Button variant="secondary" onClick={() => navigate(`/messages/${profile.id}`)}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Message {profile.display_name || "User"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6 shadow-sm">
              <CardHeader>
                <CardTitle>Profile details</CardTitle>
                <CardDescription>Public metadata</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Display name</dt>
                    <dd className="font-medium">{nameOrUser}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Username</dt>
                    <dd className="font-medium">{profile.username ? `@${profile.username}` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Location</dt>
                    <dd className="font-medium">{profile.city || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Member since</dt>
                    <dd className="font-medium">{joinedWhen(profile.created_at)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
