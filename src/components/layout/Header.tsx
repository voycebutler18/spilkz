// src/components/layout/Header.tsx
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Sparkles, LogOut, Home, Upload, Mail, Heart, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import RightProfileMenu from "@/components/layout/RightProfileMenu";
import SearchOmni from "@/components/search/SearchOmni";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

const Header: React.FC = () => {
  const [user, setUser] = React.useState<any>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(data.user ?? null);
      if (data.user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .eq("id", data.user.id)
          .maybeSingle();
        if (mounted) setProfile((p as Profile) || null);
      } else {
        setProfile(null);
      }
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .eq("id", u.id)
          .maybeSingle()
          .then(({ data }) => setProfile((data as Profile) || null));
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/home");
  };

  const avatarInitial =
    profile?.display_name?.[0] ||
    profile?.username?.[0] ||
    user?.email?.[0] ||
    "U";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:px-4">
        {/* Left: Logo (→ /home) */}
        <Link to="/home" className="flex items-center gap-2" aria-label="Splikz Home">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-cyan-400">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
        </Link>

        {/* Universal Search */}
        <div className="relative hidden w-full max-w-xl flex-1 md:block">
          <SearchOmni />
        </div>

        {/* Desktop: primary nav */}
        <nav className="ml-auto hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-2", isActive("/home") && "font-semibold")}
            onClick={() => navigate("/home")}
            aria-label="Home"
          >
            <Home className="h-4 w-4" /> Home
          </Button>

          {/* Daily Prayers */}
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-2", isActive("/prayers") && "font-semibold")}
            onClick={() => navigate("/prayers")}
            aria-label="Daily Prayers and Testimonies"
            title="Daily Prayers & Testimonies"
          >
            🙏 Daily Prayers
          </Button>

          {user && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("gap-2", isActive("/dashboard") && "font-semibold")}
              onClick={() => navigate("/dashboard")}
              aria-label="Creator Dashboard"
            >
              Creator Dashboard
            </Button>
          )}

          {/* ✅ New: NoteBox (routes to /notes) */}
          {user && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("gap-2", isActive("/notes") && "font-semibold")}
              onClick={() => navigate("/notes")}
              aria-label="NoteBox"
              title="Your ephemeral notes"
            >
              <Mail className="h-4 w-4" /> NoteBox
            </Button>
          )}

          <Button
            size="sm"
            className="gap-2"
            onClick={() => (user ? navigate("/upload") : navigate("/login"))}
            aria-label="Upload"
            title={user ? "Upload a 3-second Splik" : "Log in to upload"}
          >
            <Upload className="h-4 w-4" /> Upload
          </Button>

          {/* Account area */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="p-0 h-9 w-9 rounded-full"
                  aria-label="Account"
                  title="Account"
                >
                  <Avatar className="h-9 w-9">
                    {profile?.avatar_url ? (
                      <AvatarImage src={profile.avatar_url} alt="Avatar" />
                    ) : null}
                    <AvatarFallback>{avatarInitial}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to={`/profile/${user.id}`} className="flex items-center">
                    Profile
                  </Link>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                {/* ✅ New Reactions System Links */}
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/bookmarks" className="flex items-center gap-2">
                    <Bookmark className="h-4 w-4" />
                    My Bookmarks
                  </Link>
                </DropdownMenuItem>
                
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/boosts" className="flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    My Boosts
                  </Link>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem asChild>
                  <Link to="/dashboard" className="flex items-center">
                    Creator Dashboard
                  </Link>
                </DropdownMenuItem>
                
                {/* ⚠️ Legacy Favorites Link - Remove after migration */}
                {/* <DropdownMenuItem asChild>
                  <Link to="/dashboard/favorites" className="flex items-center text-muted-foreground">
                    Legacy Favorites
                  </Link>
                </DropdownMenuItem> */}
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="text-sm font-medium text-foreground/80 hover:text-foreground"
                aria-label="Log in"
              >
                Log in
              </Link>
              <Button
                asChild
                className="bg-gradient-to-r from-purple-600 to-cyan-500 text-white"
              >
                <Link to="/signup" aria-label="Sign up">
                  Sign up
                </Link>
              </Button>
            </div>
          )}
        </nav>

        {/* Right actions for mobile */}
        <div className="flex items-center gap-1 md:hidden ml-auto">
          <RightProfileMenu />
        </div>
      </div>
    </header>
  );
};

export default Header;
