import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useUnreadDMCount } from "@/hooks/useUnreadDMCount";

export default function DMNavButton() {
  const count = useUnreadDMCount();

  return (
    <Link
      to="/messages"
      className="relative inline-flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent"
    >
      <MessageSquare className="h-5 w-5" />
      <span className="text-sm">Messages</span>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[10px] grid place-items-center px-1">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
