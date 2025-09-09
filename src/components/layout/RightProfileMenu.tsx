import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { User, Star, LayoutDashboard, LogOut } from "lucide-react";

type LiteProfile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

export default function RightProfileMenu() {
  const [authed, setAuthed] = useState(false);
  const [prof, setProf] = useState<LiteProfile | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      setAuthed(!!user);
      if (user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("id,username,display_name,avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (mounted) setProf((p as LiteProfile) || null);
      }
    };
    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setAuthed(!!s?.user);
      if (!s?.user) setProf(null);
      else load();
    });

    return () => sub?.subscription?.unsubscribe();
  }, []);

  const profilePath =
    prof?.username ? `/creator/${prof.username}` : prof?.id ? `/profile/${prof.id}` : "/login";

  const go = (path: string) => navigate(path);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (!authed) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => go("/login")}>Log in</Button>
        <Button size="sm" onClick={() => go("/signup")}>Sign up</Button>
      </div>
    );
  }

  const initial = (prof?.display_name || prof?.username || "U").charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* avatar-like trigger; on mobile this replaces the extra hamburger */}
        <Button variant="ghost" size="icon" className="rounded-full w-9 h-9">
          {prof?.avatar_url ? (
            <img src={prof.avatar_url} alt="me" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-sm font-semibold">
              {initial}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {prof?.display_name || prof?.username || "Your account"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go(profilePath)}>
          <User className="w-4 h-4 mr-2" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/dashboard/favorites")}>
          <Star className="w-4 h-4 mr-2" /> Favorites
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/dashboard")}>
          <LayoutDashboard className="w-4 h-4 mr-2" /> Creator Dashboard
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
