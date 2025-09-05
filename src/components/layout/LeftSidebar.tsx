import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Compass, Sandwich, Info, Store, HelpCircle } from "lucide-react";

/** Fixed (sticky) left sidebar for desktop */
export default function LeftSidebar() {
  const { pathname, search } = useLocation();
  const isActive = (to: string, exact = false) =>
    exact ? pathname === to : (pathname + search).startsWith(to);

  const Item = ({
    to,
    icon,
    label,
    exact,
  }: {
    to: string;
    icon: React.ReactNode;
    label: string;
    exact?: boolean;
  }) => (
    <Link
      to={to}
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
        "text-foreground/80 hover:bg-muted/40 hover:text-foreground",
        isActive(to, exact) && "bg-muted/40 text-foreground"
      )}
    >
      <span className="text-muted-foreground group-hover:text-foreground">
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );

  return (
    <aside
      className="
        sticky top-14               /* sits below your Header (h-14) */
        hidden md:block             /* desktop only */
        h-[calc(100dvh-56px)]       /* full height minus header */
        w-56 flex-shrink-0
        overflow-y-auto
        border-r bg-background/40
        px-2 py-3
      "
    >
      <nav className="flex flex-col gap-1">
        <Item to="/explore" icon={<Compass className="h-4 w-4" />} label="Discover" />
        <Item to="/food" icon={<Sandwich className="h-4 w-4" />} label="Food" />
        <Item to="/about" icon={<Info className="h-4 w-4" />} label="About" />
        <Item to="/brands" icon={<Store className="h-4 w-4" />} label="For Brands" />
        <Item to="/help" icon={<HelpCircle className="h-4 w-4" />} label="Help" />
      </nav>
    </aside>
  );
}
