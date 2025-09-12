import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type Vibe = {
  id: string;
  user_id: string;
  text: string;
  mood?: string | null;
  created_at: string;
  profile?: Profile | null;
  // client-only flags
  _optimistic?: boolean;
};

const MOODS = [
  { value: "", label: "Add a mood..." },
  { value: "happy", label: "😊 Happy" },
  { value: "chill", label: "🧊 Chill" },
  { value: "hype", label: "🔥 Hype" },
  { value: "grateful", label: "🙏 Grateful" },
  { value: "sad", label: "😔 Sad" },
  { value: "tired", label: "🥱 Tired" },
  { value: "blessed", label: "✨ Blessed" },
];

const LIMIT = 50;
const MAX_LEN = 500;

export default function Vibes() {
  const { toast } = useToast();

  const [me, setMe] = React.useState<any>(null);
  const [myProfile, setMyProfile] = React.useState<Profile | null>(null);

  const [text, setText] = React.useState("");
  const [mood, setMood] = React.useState<string>("");

  const [vibes, setVibes] = React.useState<Vibe[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [posting, setPosting] = React.useState(false);

  // Load auth & my profile
  React.useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setMe(data.user ?? null);

      if (data.user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .eq("id", data.user.id)
          .maybeSingle();
        setMyProfile(prof ?? null);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user ?? null);
    });

    return () => sub?.subscription.unsubscribe();
  }, []);

  // Initial fetch
  React.useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("vibes")
        .select(
          `
          id, user_id, text, mood, created_at,
          profile:profiles(id, username, display_name, avatar_url)
        `
        )
        .order("created_at", { ascending: false })
        .limit(LIMIT);

      if (!alive) return;

      if (error) {
        console.error(error);
        setVibes([]);
      } else {
        setVibes((data as any[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Realtime: push new vibes to the top (dedupe by id)
  React.useEffect(() => {
    const ch = supabase
      .channel("vibes-realtime")
      .on(
        "postgres_changes",
        { schema: "public", table: "vibes", event: "INSERT" },
        async (payload) => {
          const row = payload.new as Vibe;

          // Hydrate profile for the inserted user
          let profile: Profile | null = null;
          if (row.user_id === me?.id && myProfile) {
            profile = myProfile;
          } else {
            const { data: prof } = await supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url")
              .eq("id", row.user_id)
              .maybeSingle();
            profile = prof ?? null;
          }

          setVibes((prev) => {
            // avoid duplicates (e.g., optimistic item already present)
            if (prev.some((v) => v.id === row.id)) return prev;
            return [{ ...row, profile }, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [me?.id, myProfile]);

  // Helpers
  const nameFor = (p?: Profile | null) =>
    (p?.display_name || p?.username || "Someone").toString();

  const avatarFor = (p?: Profile | null) =>
    p?.avatar_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      nameFor(p)
    )}`;

  const addOrReplace = (incoming: Vibe) =>
    setVibes((prev) => {
      const i = prev.findIndex((v) => v.id === incoming.id);
      if (i >= 0) {
        const clone = [...prev];
        clone[i] = { ...prev[i], ...incoming };
        return clone;
      }
      return [incoming, ...prev];
    });

  // Post a vibe (optimistic)
  const onPost = async () => {
    const body = text.trim();
    if (!me?.id) {
      toast({ title: "Please sign in to post a vibe." });
      return;
    }
    if (!body) return;

    setPosting(true);

    // optimistic item
    const tempId = `temp-${Date.now()}`;
    const optimistic: Vibe = {
      id: tempId,
      user_id: me.id,
      text: body,
      mood: mood || null,
      created_at: new Date().toISOString(),
      profile: myProfile ?? { id: me.id, username: null, display_name: "You", avatar_url: null },
      _optimistic: true,
    };

    setVibes((prev) => [optimistic, ...prev]); // show immediately
    setText("");

    // send to server
    const { data, error } = await supabase
      .from("vibes")
      .insert({ text: body, mood: mood || null, user_id: me.id })
      .select(
        `
        id, user_id, text, mood, created_at,
        profile:profiles(id, username, display_name, avatar_url)
      `
      )
      .single();

    if (error || !data) {
      // rollback optimistic item
      setVibes((prev) => prev.filter((v) => v.id !== tempId));
      setPosting(false);
      toast({ title: "Couldn’t post your vibe. Try again.", variant: "destructive" });
      return;
    }

    // replace optimistic with real row
    setVibes((prev) => {
      const idx = prev.findIndex((v) => v.id === tempId);
      if (idx === -1) {
        // (if realtime already added it, just ensure dedupe/replace)
        return [data as Vibe, ...prev.filter((v) => v.id !== (data as Vibe).id)];
      }
      const clone = [...prev];
      clone[idx] = data as Vibe;
      return clone;
    });

    setPosting(false);
    toast({ title: "Vibe posted ✨" });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold">Vibes</h1>
      <p className="text-muted-foreground mt-1">
        Share how you&apos;re feeling — text only, separate from videos.
      </p>

      {/* Composer */}
      <div className="mt-6 rounded-xl border bg-card/60 p-3">
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            placeholder="Share how you're feeling..."
            className="w-full min-h-[110px] resize-y rounded-md bg-background p-3 outline-none"
            maxLength={MAX_LEN}
            disabled={posting}
          />
          <div className="absolute right-3 bottom-3 text-xs text-muted-foreground">
            {MAX_LEN - text.length} left
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <Select value={mood} onValueChange={setMood} disabled={posting}>
            <SelectTrigger className="w-[210px]">
              <SelectValue placeholder="Add a mood..." />
            </SelectTrigger>
            <SelectContent>
              {MOODS.map((m) => (
                <SelectItem key={m.value || "none"} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={onPost} disabled={posting || text.trim().length === 0}>
            {posting ? "Posting..." : "Post"}
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="mt-8 space-y-4">
        {loading ? (
          <div className="text-center text-muted-foreground py-10">Loading…</div>
        ) : vibes.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">
            No vibes yet. Be the first!
          </div>
        ) : (
          vibes.map((v) => (
            <article
              key={v.id}
              className="rounded-xl border bg-card/60 p-4 transition-opacity"
              style={{ opacity: v._optimistic ? 0.7 : 1 }}
            >
              <div className="flex items-start gap-3">
                <img
                  src={avatarFor(v.profile)}
                  alt={nameFor(v.profile)}
                  className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/20"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{nameFor(v.profile)}</span>
                    {v.mood ? (
                      <Badge variant="secondary" className="text-xs">
                        {v.mood}
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words">{v.text}</p>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
