import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

const DASHBOARD_PATH = "/dashboard"; // <-- change if your desktop header uses a different path

const MobileMenu = ({ open, onClose }: MobileMenuProps) => {
  const [isAuthed, setIsAuthed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    // initial session check
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthed(!!data.session);
    });

    // live auth updates
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onClose();
    navigate("/");
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-[280px] sm:w-[350px]">
        <SheetHeader>
          <SheetTitle className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Splikz
            </span>
          </SheetTitle>
        </SheetHeader>

        <nav className="mt-8 flex flex-col space-y-4">
          <Link to="/" onClick={onClose} className="text-sm font-medium transition-colors hover:text-primary">
            Home
          </Link>
          <Link to="/explore" onClick={onClose} className="text-sm font-medium transition-colors hover:text-primary">
            Discover
          </Link>
          <Link to="/prompts" onClick={onClose} className="text-sm font-medium transition-colors hover:text-primary">
            Prompts
          </Link>
          <Link to="/about" onClick={onClose} className="text-sm font-medium transition-colors hover:text-primary">
            About
          </Link>
          <Link to="/brands" onClick={onClose} className="text-sm font-medium transition-colors hover:text-primary">
            For Brands
          </Link>
          <Link to="/help" onClick={onClose} className="text-sm font-medium transition-colors hover:text-primary">
            Help
          </Link>
        </nav>

        <div className="mt-8 flex flex-col space-y-2">
          {isAuthed ? (
            <>
              <Button variant="outline" asChild onClick={onClose}>
                <Link to={DASHBOARD_PATH}>Creator Dashboard</Link>
              </Button>
              <Button variant="destructive" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" asChild onClick={onClose}>
                <Link to="/login">Log in</Link>
              </Button>
              <Button
                className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                asChild
                onClick={onClose}
              >
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileMenu;
