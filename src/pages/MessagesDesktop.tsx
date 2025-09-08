import { Card } from "@/components/ui/card";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import InboxPane from "@/components/DM/InboxPane";
import DetailsPane from "@/components/DM/DetailsPane";
import { Outlet, useParams } from "react-router-dom";

export default function MessagesDesktop() {
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

        {/* Center: this is controlled by nested routes */}
        <Card className="overflow-hidden border">
          {/* When route is /messages -> index element renders (select prompt)
              When route is /messages/:otherId -> MessageThread renders */}
          <Outlet key={otherId || "index"} />
        </Card>

        {/* Right: Details/actions for selected user */}
        <Card className="overflow-hidden border">
          <DetailsPane />
        </Card>
      </div>

      {/* Message for small screens (we’ll do mobile later) */}
      <div className="lg:hidden max-w-xl mx-auto px-4 py-10 text-center text-muted-foreground">
        The wide messaging layout shows on larger screens. Mobile layout coming soon.
      </div>

      <Footer />
    </div>
  );
}
