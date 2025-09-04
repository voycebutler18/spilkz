import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

const MobileMenu = ({ open, onClose }: MobileMenuProps) => {
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
          <Link
            to="/"
            onClick={onClose}
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Home
          </Link>
          <Link
            to="/explore"
            onClick={onClose}
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Discover
          </Link>
          <Link
            to="/prompts"
            onClick={onClose}
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Prompts
          </Link>
          <Link
            to="/about"
            onClick={onClose}
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            About
          </Link>
          <Link
            to="/brands"
            onClick={onClose}
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            For Brands
          </Link>
          <Link
            to="/help"
            onClick={onClose}
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Help
          </Link>
        </nav>

        <div className="mt-8 flex flex-col space-y-2">
          <Button variant="outline" asChild onClick={onClose}>
            <Link to="/login">Log in</Link>
          </Button>
          <Button className="bg-gradient-to-r from-primary to-secondary hover:opacity-90" asChild onClick={onClose}>
            <Link to="/signup">Sign up</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileMenu;