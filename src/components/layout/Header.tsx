// src/components/layout/Header.tsx
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NavLink: React.FC<
  React.PropsWithChildren<{ to: string; exact?: boolean }>
> = ({ to, exact = false, children }) => {
  const { pathname, search } = useLocation();
  const isActive = exact ? pathname === to : (pathname + search).startsWith(to);
  return (
    <Link
      to={to}
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
  return (
    <header className="sticky top-0 z-[120] w-full border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
          <NavLink to="/discover">
            Discover
          </NavLink>
          {/* Replaced "Prompts" with "Food" and pointed away from /prompts */}
          <NavLink to="/discover?category=food">
            Food
          </NavLink>
          <NavLink to="/about">
            About
          </NavLink>
          <NavLink to="/brands">
            For Brands
          </NavLink>
          <NavLink to="/help">
            Help
          </NavLink>
        </nav>

        {/* Right: Auth */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/login"
            className="text-sm font-medium text-foreground/80 hover:text-foreground"
          >
            Log in
          </Link>
          <Button asChild className="bg-gradient-to-r from-purple-600 to-cyan-500 text-white">
            <Link to="/signup">Sign up</Link>
          </Button>
        </div>

        {/* Mobile: Sheet Menu */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <div className="i-[menu] sr-only" />
                {/* Simple hamburger */}
                <span className="block h-[2px] w-5 bg-foreground" />
                <span className="mt-1 block h-[2px] w-5 bg-foreground" />
                <span className="mt-1 block h-[2px] w-5 bg-foreground" />
              </Button>
            </SheetTrigger>
            {/* z-index and safe-area padding to sit above any cards */}
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

              <div className="flex flex-col gap-2 p-4">
                <NavLink to="/" exact>
                  Home
                </NavLink>
                <NavLink to="/discover">
                  Discover
                </NavLink>
                {/* Food replaces Prompts on mobile too */}
                <NavLink to="/discover?category=food">
                  Food
                </NavLink>
                <NavLink to="/about">
                  About
                </NavLink>
                <NavLink to="/brands">
                  For Brands
                </NavLink>
                <NavLink to="/help">
                  Help
                </NavLink>

                <div className="mt-4 h-px bg-border" />

                <Link
                  to="/login"
                  className="text-sm font-medium text-foreground/80 hover:text-foreground"
                >
                  Log in
                </Link>
                <Button asChild className="bg-gradient-to-r from-purple-600 to-cyan-500 text-white">
                  <Link to="/signup">Sign up</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
