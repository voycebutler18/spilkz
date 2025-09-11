import AmenButton from "@/components/prayers/AmenButton";
import ReplyList from "@/components/prayers/ReplyList";
import { Link } from "react-router-dom";
import { format } from "date-fns";

export default function PrayerCard({
  item
}: {
  item: {
    id: string;
    type: "request" | "testimony" | "quote";
    body: string;
    amen_count: number;
    reply_count: number;
    answered: boolean;
    created_at: string;
  };
}) {
  const day = format(new Date(item.created_at), "MMM d, yyyy");
  const time = format(new Date(item.created_at), "h:mm a");

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 capitalize">
          {item.type}
        </span>
        {item.answered && (
          <span className="inline-flex rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
            Answered
          </span>
        )}
        <span className="text-muted-foreground ml-auto">
          {day} at {time}
        </span>
      </div>

      <Link to={`/prayers/${item.id}`} className="whitespace-pre-wrap leading-7">
        {item.body}
      </Link>

      <div className="mt-3 flex items-center gap-4 text-sm">
        <AmenButton id={item.id} count={item.amen_count} />
        <ReplyList prayerId={item.id} initialCount={item.reply_count} />
      </div>
    </div>
  );
}
