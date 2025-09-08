// src/components/layout/MobileTabBar.tsx
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, Compass, PlusCircle, MessageSquare, User } from "lucide-react";

interface MobileTabBarProps {
  onUploadClick: () => void;    // open your existing VideoUploadModal
  isAuthed?: boolean;
  profilePath?: string;         // e.g. `/creator/${username}` or `/dashboard`
}

const itemCls =
  "flex flex-col items-center justify-center flex-1 py-2 text-xs transition-colors";

const iconCls = (active: boolean) =>
  `h-6 w-6 ${active ? "text-primary" : "text-muted-foreground"}`;

export default function MobileTabBar({
  onUploadClick,
  isAuthed = false,
  profilePath = "/dashboard",
}: MobileTabBarProps) {
  const nav = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      className="
        md:hidden fixed bottom-0 left-0 right-0 z-40
        border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75
        pb-[env(safe-area-inset-bottom)]
      "
      aria-label="Primary"
    >
      <div className="mx-auto max-w-[520px] grid grid-cols-5">
        <NavLink to="/" className={({ isActive }) => `${itemCls}`}>
          {({ isActive }) => (
            <>
              <Home className={iconCls(isActive || pathname === "/")} />
              <span className={isActive ? "text-primary" : "text-muted-foreground"}>Home</span>
            </>
          )}
        </NavLink>

        <NavLink to="/explore" className={itemCls}>
          {({ isActive }) => (
            <>
              <Compass className={iconCls(isActive)} />
              <span className={isActive ? "text-primary" : "text-muted-foreground"}>
                Discover
              </span>
            </>
          )}
        </NavLink>

        {/* Upload is a button so we don't change routes */}
        <button
          className={`${itemCls} text-primary`}
          onClick={onUploadClick}
          aria-label="Upload"
        >
          <PlusCircle className="h-7 w-7" />
          <span>Upload</span>
        </button>

        <NavLink to="/messages" className={itemCls}>
          {({ isActive }) => (
            <>
              <MessageSquare className={iconCls(isActive)} />
              <span className={isActive ? "text-primary" : "text-muted-foreground"}>
                Inbox
              </span>
            </>
          )}
        </NavLink>

        <button
          className={itemCls}
          onClick={() => nav(isAuthed ? profilePath : "/login")}
          aria-label="Profile"
        >
          <User className={iconCls(pathname.startsWith("/creator") || pathname.startsWith("/dashboard"))} />
          <span className={(pathname.startsWith("/creator") || pathname.startsWith("/dashboard")) ? "text-primary" : "text-muted-foreground"}>
            Profile
          </span>
        </button>
      </div>
    </nav>
  );
}
