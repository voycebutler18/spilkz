// src/components/layout/Header.tsx
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Sparkles, LogOut, Menu } from "lucide-react";
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
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-4">
        {/* Left: Logo */}
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-cyan-400">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="bg-clip-text text-xl font-semibold text-transparent bg-gradient-to-r from-purple-600 to-cyan-500">
            Splikz
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <NavLink to="/" exact>
            Home
          </NavLink>
          {/* Discover points to /explore */}
          <NavLink to="/explore">Discover</NavLink>
          <NavLink to="/food">Food</NavLink>
          <NavLink to="/about">About</NavLink>
          <NavLink to="/brands">For Brands</NavLink>
          <NavLink to="/help">Help</NavLink>
        </nav>

        {/* Right: Auth / User */}
        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Button asChild variant="outline">
                <Link to="/dashboard">Creator Dashboard</Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="p-0 h-9 w-9 rounded-full">
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
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-medium text-foreground/80 hover:text-foreground"
              >
                Log in
              </Link>
              <Button
                asChild
                className="bg-gradient-to-r from-purple-600 to-cyan-500 text-white"
              >
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile: Sheet Menu */}
        <div className="md:hidden">
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
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-cyan-400">
                  <Sparkles className="h-4 w-4 text-white" />
                </span>
                <span className="bg-clip-text text-lg font-semibold text-transparent bg-gradient-to-r from-purple-600 to-cyan-500">
                  Splikz
                </span>
              </div>

              <nav className="flex flex-col gap-3 p-4">
                {/* Core links */}
                <NavLink to="/" exact onClick={() => setOpen(false)}>
                  Home
                </NavLink>
                <NavLink to="/explore" onClick={() => setOpen(false)}>
                  Discover
                </NavLink>
                <NavLink to="/food" onClick={() => setOpen(false)}>
                  Food
                </NavLink>
                <NavLink to="/about" onClick={() => setOpen(false)}>
                  About
                </NavLink>
                <NavLink to="/brands" onClick={() => setOpen(false)}>
                  For Brands
                </NavLink>
                <NavLink to="/help" onClick={() => setOpen(false)}>
                  Help
                </NavLink>

                <div className="mt-2 h-px bg-border" />

                {user ? (
                  <>
                    <NavLink to="/dashboard" onClick={() => setOpen(false)}>
                      Creator Dashboard
                    </NavLink>
                    <NavLink
                      to="/dashboard/favorites"
                      onClick={() => setOpen(false)}
                    >
                      Favorites
                    </NavLink>
                    <NavLink
                      to={`/profile/${user.id}`}
                      onClick={() => setOpen(false)}
                    >
                      Profile
                    </NavLink>
                    <Button
                      variant="outline"
                      onClick={handleSignOut}
                      className="mt-1 justify-start"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="mt-1 text-sm text-muted-foreground">Log in</div>
                    <Button
                      asChild
                      className="bg-gradient-to-r from-purple-600 to-cyan-500 text-white"
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/signup">Sign up</Link>
                    </Button>
                    <NavLink to="/login" onClick={() => setOpen(false)}>
                      Already have an account? Log in
                    </NavLink>
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
