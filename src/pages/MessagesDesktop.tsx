import { Outlet, useParams, useNavigate, Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import InboxPane from "@/components/DM/InboxPane";
import ThreadPane from "@/components/DM/ThreadPane";
import DetailsPane from "@/components/DM/DetailsPane";

export default function MessagesDesktop() {
  const { otherId } = useParams();
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Desktop 3-column layout */}
      <div className="hidden md:grid max-w-7xl mx-auto px-4 py-6 gap-4"
           style={{ gridTemplateColumns: "360px 1fr 360px" }}>
        {/* Left: conversation list */}
        <Card className="overflow-hidden border">
          <div className="flex items-center justify-between p-4 border-b">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Messages
            </h1>
            <Button variant="outline" size="sm" onClick={() => nav("/dashboard")}>
              Creator Dashboard
            </Button>
          </div>
          <InboxPane />
        </Card>

        {/* Middle: active thread */}
        <Card className="overflow-hidden border">
          <ThreadPane />
        </Card>

        {/* Right: profile / actions for selected partner */}
        <Card className="overflow-hidden border">
          <DetailsPane />
        </Card>
      </div>

      {/* Mobile placeholder (we’ll do a separate mobile layout later) */}
      <div className="md:hidden max-w-xl mx-auto px-4 py-10 text-center text-muted-foreground">
        The desktop messaging layout is shown on larger screens. Mobile layout coming soon.
      </div>

      <Footer />
    </div>
  );
}
