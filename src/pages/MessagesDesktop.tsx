import { Card } from "@/components/ui/card";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import InboxPane from "@/components/DM/InboxPane";
import ThreadPane from "@/components/DM/ThreadPane";
import DetailsPane from "@/components/DM/DetailsPane";
import { useParams } from "react-router-dom";

export default function MessagesDesktop() {
  // when the URL is /messages/:otherId, this exists
  const { otherId } = useParams();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* 3-column desktop layout */}
      <div
        className="hidden lg:grid max-w-7xl mx-auto px-4 py-6 gap-4"
        style={{ gridTemplateColumns: "360px 1fr 360px" }}
      >
        {/* Left: Inbox list */}
        <Card className="overflow-hidden border">
          <InboxPane />
        </Card>

        {/* Center: Thread (always center) */}
        <Card className="overflow-hidden border">
          {/* key forces clean remount when switching threads */}
          <ThreadPane key={otherId || "no-thread"} />
        </Card>

        {/* Right: Details */}
        <Card className="overflow-hidden border">
          <DetailsPane />
        </Card>
      </div>

      {/* Mobile note (desktop layout only) */}
      <div className="lg:hidden max-w-xl mx-auto px-4 py-10 text-center text-muted-foreground">
        The wide messaging layout shows on large screens. Use mobile messages for now.
      </div>

      <Footer />
    </div>
  );
}
