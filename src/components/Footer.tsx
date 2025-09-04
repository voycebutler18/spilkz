import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Splikz
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Short. Sweet. Viral.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Talk with motion.
            </p>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-3 text-sm">Legal</h3>
            <nav className="flex flex-col space-y-2">
              <Link to="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Terms
              </Link>
              <Link to="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Privacy
              </Link>
              <Link to="/dmca" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                DMCA
              </Link>
            </nav>
          </div>

          {/* Community */}
          <div>
            <h3 className="font-semibold mb-3 text-sm">Community</h3>
            <nav className="flex flex-col space-y-2">
              <Link to="/guidelines" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Guidelines
              </Link>
              <Link to="/safety" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Safety Center
              </Link>
              <Link to="/accessibility" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Accessibility
              </Link>
            </nav>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold mb-3 text-sm">Support</h3>
            <nav className="flex flex-col space-y-2">
              <Link to="/help" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Help Center
              </Link>
              <Link to="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Contact
              </Link>
              <Link to="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Report Issue
              </Link>
            </nav>
          </div>

          {/* Business */}
          <div>
            <h3 className="font-semibold mb-3 text-sm">Business</h3>
            <nav className="flex flex-col space-y-2">
              <Link to="/brands" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                For Brands
              </Link>
              <Link to="/creators" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                For Creators
              </Link>
              <Link to="/press" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Press
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} Splikz. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
