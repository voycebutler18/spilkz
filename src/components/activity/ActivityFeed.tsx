// src/components/activity/ActivityFeed.tsx
import * as React from "react";
import RightActivityRail from "@/components/RightActivityRail";

// Same behavior, HomePage-style name
export const ActivityFeed: React.FC<{ limit?: number }> = ({ limit = 60 }) => {
  return <RightActivityRail limit={limit} />;
};

export default ActivityFeed;
