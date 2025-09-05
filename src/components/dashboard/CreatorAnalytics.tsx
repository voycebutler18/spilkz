import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Heart, MessageCircle, Video, Sparkles } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type Splik = {
  id: string;
  title: string | null;
  created_at: string;
  likes_count?: number | null;
  comments_count?: number | null;
  thumbnail_url?: string | null;
};

type Stats = {
  totalSpliks: number;
  followers: number;
  totalReactions: number;
  avgReactionsPerVideo: number;
};

export default function CreatorAnalytics({
  spliks,
  stats,
}: {
  spliks: Splik[];
  stats: Stats;
}) {
  // —— Helpers
  const likeSum = (spliks ?? []).reduce((a, s) => a + (s.likes_count || 0), 0);
  const commentSum = (spliks ?? []).reduce((a, s) => a + (s.comments_count || 0), 0);

  // Last 7 days uploads (sparkline)
  const uploads7d = useMemo(() => {
    const today = new Date();
    const days: { day: string; uploads: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      days.push({ day: key, uploads: 0 });
    }
    const map = new Map(days.map((d) => [d.day, d]));
    for (const s of spliks) {
      const d = new Date(s.created_at);
      const key = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (map.has(key)) {
        map.get(key)!.uploads += 1;
      }
    }
    return days;
  }, [spliks]);

  // Top videos by reactions
  const topVideos = useMemo(() => {
    const rows = (spliks || [])
      .map((s) => ({
        id: s.id,
        name: s.title || "Untitled",
        reactions: (s.likes_count || 0) + (s.comments_count || 0),
      }))
      .sort((a, b) => b.reactions - a.reactions)
      .slice(0, 6);
    return rows;
  }, [spliks]);

  const donutData = [
    { name: "Likes", value: likeSum },
    { name: "Comments", value: commentSum },
  ];
  const donutColors = ["#8b5cf6", "#06b6d4"];

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Analytics Overview
        </h2>
        <Badge variant="secondary">Live</Badge>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={<Video className="h-4 w-4" />}
          label="Total Videos"
          value={stats.totalSpliks}
          sub="Videos uploaded"
          gradient="from-violet-500/10 to-teal-400/10"
        />
        <Kpi
          icon={
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
            </div>
          }
          label="Total Reactions"
          value={stats.totalReactions}
          sub="Likes + Comments"
          gradient="from-teal-400/10 to-amber-400/10"
        />
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label="Avg Reactions / Video"
          value={stats.avgReactionsPerVideo}
          sub="Average engagement"
          gradient="from-rose-400/10 to-violet-500/10"
        />
        <Kpi
          icon={<span className="font-semibold text-xs">✨</span>}
          label="Followers"
          value={stats.followers}
          sub="Build your community"
          gradient="from-emerald-400/10 to-cyan-400/10"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Uploads sparkline */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Uploads — last 7 days
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={uploads7d}>
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                <YAxis allowDecimals={false} width={28} stroke="currentColor" className="text-muted-foreground" />
                <Tooltip cursor={{ opacity: 0.1 }} />
                <Line type="monotone" dataKey="uploads" stroke="#06b6d4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Reactions donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Reactions Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="85%"
                  paddingAngle={2}
                >
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={donutColors[i % donutColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <LegendDot color={donutColors[0]} label="Likes" value={likeSum} />
              <LegendDot color={donutColors[1]} label="Comments" value={commentSum} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top videos chart + table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Top Videos by Reactions
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topVideos}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} dy={10} height={50} stroke="currentColor" className="text-muted-foreground" />
                <YAxis allowDecimals={false} width={30} stroke="currentColor" className="text-muted-foreground" />
                <Tooltip />
                <Bar dataKey="reactions" radius={[6, 6, 0, 0]} fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Recent Uploads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {spliks
                .slice(0, 5)
                .map((s) => {
                  const r = (s.likes_count || 0) + (s.comments_count || 0);
                  return (
                    <li key={s.id} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.title || "Untitled"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-sm font-semibold">{r}</span>
                    </li>
                  );
                })}
              {!spliks.length && (
                <p className="text-xs text-muted-foreground">No uploads yet</p>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  gradient,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  gradient: string;
}) {
  return (
    <Card className={`overflow-hidden`}>
      <div className={`h-1 w-full bg-gradient-to-r ${gradient}`} />
      <CardHeader className="pb-1">
        <CardTitle className="text-xs text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-primary">{icon}</div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

function LegendDot({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
