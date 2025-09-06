// src/components/layout/Header.tsx
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Sparkles, LogOut, Menu, Home, MessageSquare, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge"; // ⬅️ NEW

// Type-ahead search (make sure this file exists)
import SearchOmni from "@/components/search/SearchOmni";

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
        <Link to="/" className="flex items-center gap-2" aria-label="Splikz Home">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-cyan-400">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
        </Link>

        {/* Universal Search (with autocomplete) */}
        <div className="relative hidden w-full max-w-xl flex-1 md:block">
          <SearchOmni />
        </div>

        {/* Desktop: primary nav */}
        <nav className="ml-auto hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => navigate("/")}
            aria-label="Home"
          >
            <Home className="h-4 w-4" /> Home
          </Button>

          {user && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => navigate("/dashboard")}
              aria-label="Creator Dashboard"
            >
              Creator Dashboard
            </Button>
          )}

          {/* Messages visible ONLY when logged in */}
          {user && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => navigate("/messages")}
              aria-label="Messages"
            >
              <MessageSquare className="h-4 w-4" /> Messages
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
              <DropdownMenuContent align="end" className="w-48">
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

        {/* Mobile: Drawer menu */}
        <div className="md:hidden ml-auto">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
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
                {/* Primary */}
                <NavLink to="/" exact onClick={() => setOpen(false)}>
                  Home
                </NavLink>
                {user && (
                  <NavLink to="/dashboard" onClick={() => setOpen(false)}>
                    Creator Dashboard
                  </NavLink>
                )}
                <Button
                  className="justify-start gap-2"
                  onClick={() => {
                    setOpen(false);
                    user ? navigate("/upload") : navigate("/login");
                  }}
                >
                  <Upload className="h-4 w-4" /> Upload
                </Button>

                <div className="mt-2 h-px bg-border" />

                {/* Browse */}
                <div className="text-[11px] tracking-wide text-muted-foreground">
                  Browse
                </div>
                <NavLink to="/explore" onClick={() => setOpen(false)}>
                  Discover
                </NavLink>
                <NavLink to="/food" onClick={() => setOpen(false)}>
                  Food
                </NavLink>

                {/* Splikz Dating (coming soon) — MOBILE ONLY */}
                <div
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/90 hover:bg-white/5 cursor-not-allowed select-none"
                  aria-disabled="true"
                  title="Splikz Dating is coming soon"
                >
                  <span>Splikz Dating</span>
                  <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
                </div>

                <NavLink to="/brands" onClick={() => setOpen(false)}>
                  For Brands
                </NavLink>
                <NavLink to="/help" onClick={() => setOpen(false)}>
                  Help
                </NavLink>
                <NavLink to="/about" onClick={() => setOpen(false)}>
                  About
                </NavLink>

                <div className="h-px bg-border" />

                {/* Me */}
                <div className="text-[11px] tracking-wide text-muted-foreground">
                  Me
                </div>
                {user && (
                  <>
                    <NavLink
                      to="/dashboard/favorites"
                      onClick={() => setOpen(false)}
                    >
                      My Favorites
                    </NavLink>
                    <NavLink to="/messages" onClick={() => setOpen(false)}>
                      Messages
                    </NavLink>
                  </>
                )}

                <div className="mt-2 h-px bg-border" />

                {user ? (
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
