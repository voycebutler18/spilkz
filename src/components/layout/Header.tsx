// src/components/layout/Header.tsx
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Sparkles, LogOut, Menu, Search, Home, MessageSquare, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

const NavLink: React.FC<
  React.PropsWithChildren<{ to: string; exact?: boolean; onClick?: () => void }>
> = ({ to, exact = false, children, onClick }) => {
  const { pathname, search } = useLocation();
  const isActive = exact ? pathname === to : (pathname + search).startsWith(to);
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "text-sm font-medium text-foreground/80 hover:text-foreground transition-colors",
        isActive && "text-foreground"
      )}
    >
      {children}
    </Link>
  );
};

const Header: React.FC = () => {
  const [open, setOpen] = React.useState(false); // mobile drawer
  const [user, setUser] = React.useState<any>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const navigate = useNavigate();

  // Load current user + listen for auth changes
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
    setOpen(false);
    navigate("/");
  };

  const avatarInitial =
    profile?.display_name?.[0] ||
    profile?.username?.[0] ||
    user?.email?.[0] ||
    "U";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:px-4">
        {/* Left: Logo */}
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-cyan-400">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="bg-clip-text text-lg font-semibold text-transparent bg-gradient-to-r from-purple-600 to-cyan-500">
            Splikz
          </span>
        </Link>

        {/* Universal Search (omnibox) */}
        <div className="relative hidden w-full max-w-xl flex-1 md:block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search people and videos"
            className="pl-8"
            aria-label="Search people and videos"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const q = (e.currentTarget as HTMLInputElement).value.trim();
                if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
              }
            }}
          />
        </div>

        {/* Desktop: Primary nav per spec */}
        <nav className="ml-auto hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/")}>
            <Home className="h-4 w-4" /> Home
          </Button>

          {user && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => navigate("/dashboard")}
            >
              {/* If you have a specific icon for creator analytics, swap it in */}
              <span className="inline-flex items-center">Creator Dashboard</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => navigate("/messages")}
          >
            <MessageSquare className="h-4 w-4" /> Messages
          </Button>

          <Button
            size="sm"
            className="gap-2"
            onClick={() => navigate("/upload")}
            aria-label="Upload"
          >
            <Upload className="h-4 w-4" /> Upload
          </Button>

          {/* Avatar menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="p-0 h-9 w-9 rounded-full" aria-label="Account">
                <Avatar className="h-9 w-9">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt="Avatar" />
                  ) : null}
                  <AvatarFallback>{avatarInitial}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {user ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link to={`/profile/${user.id}`}>Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard/favorites">Favorites</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard">Creator Dashboard</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/login">Log in</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/signup">Sign up</Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Mobile: Sheet Menu — keeps quick access; search handled via /search page */}
        <div className="md:hidden ml-auto">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="relative">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent
              side="left"
              className="z-[110] w-[18rem] bg-background p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            >
              <div className="flex items-center gap-2 px-4 py-3 border-b">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-cyan-400">
                  <Sparkles className="h-4 w-4 text-white" />
                </span>
                <span className="bg-clip-text text-lg font-semibold text-transparent bg-gradient-to-r from-purple-600 to-cyan-500">
                  Splikz
                </span>
              </div>

              <nav className="flex flex-col gap-3 p-4">
                <NavLink to="/" exact onClick={() => setOpen(false)}>
                  Home
                </NavLink>

                {user && (
                  <NavLink to="/dashboard" onClick={() => setOpen(false)}>
                    Creator Dashboard
                  </NavLink>
                )}

                <NavLink to="/messages" onClick={() => setOpen(false)}>
                  Messages
                </NavLink>

                <Button
                  className="justify-start gap-2"
                  onClick={() => {
                    setOpen(false);
                    navigate("/upload");
                  }}
                >
                  <Upload className="h-4 w-4" /> Upload
                </Button>

                <div className="mt-2 h-px bg-border" />

                {user ? (
                  <>
                    <NavLink to="/dashboard/favorites" onClick={() => setOpen(false)}>
                      Favorites
                    </NavLink>
                    <NavLink to={`/profile/${user.id}`} onClick={() => setOpen(false)}>
                      Profile
                    </NavLink>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        await handleSignOut();
                        setOpen(false);
                      }}
                      className="mt-1 justify-start"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <NavLink to="/login" onClick={() => setOpen(false)}>
                      Log in
                    </NavLink>
                    <Button
                      asChild
                      className="bg-gradient-to-r from-purple-600 to-cyan-500 text-white"
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/signup">Sign up</Link>
                    </Button>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
