// src/pages/Admin.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  RefreshCw,
  Users as UsersIcon,
  Film,
  Utensils,
  Activity,
  LayoutDashboard,
} from "lucide-react";

type Stats = {
  total_users: number;
  total_spliks: number;
  food_spliks: number;
  active_creators_24h: number;
};

type AdminUserRow = {
  user_id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type AdminSplikRow = {
  id: string;
  title: string;
  user_id: string;
  user_email: string | null;
  created_at: string | null;
  is_food: boolean;
  status: string | null;
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export default function Admin() {
  const navigate = useNavigate();

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // stats
  const [stats, setStats] = useState<Stats | null>(null);

  // users
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [uOffset, setUOffset] = useState(0);
  const uLimit = 20;

  // spliks
  const [spliks, setSpliks] = useState<AdminSplikRow[]>([]);
  const [sOffset, setSOffset] = useState(0);
  const sLimit = 20;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id || null;
      setUid(id);
      if (!id) toast.error("Not signed in");
    });
  }, []);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      await Promise.all([loadStats(), loadUsers(0), loadSpliks(0)]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const loadStats = async () => {
    try {
      if (!uid) return;
      const { data, error } = await supabase.rpc("admin_stats", { p_uid: uid });
      if (error) throw error;

      // RETURNS TABLE(...) often comes back as array
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setStats(row as Stats);
      } else {
        setStats({
          total_users: 0,
          total_spliks: 0,
          food_spliks: 0,
          active_creators_24h: 0,
        });
      }
    } catch (e: any) {
      toast.error("Failed to load stats");
      console.error(e);
    }
  };

  const loadUsers = async (offset = uOffset) => {
    try {
      if (!uid) return;
      const { data, error } = await supabase.rpc("admin_list_users", {
        p_uid: uid,
        p_limit: uLimit,
        p_offset: offset,
      });
      if (error) throw error;
      setUsers((data as AdminUserRow[]) || []);
      setUOffset(offset);
    } catch (e: any) {
      toast.error("Failed to load users");
      console.error(e);
    }
  };

  const loadSpliks = async (offset = sOffset) => {
    try {
      if (!uid) return;
      const { data, error } = await supabase.rpc("admin_recent_spliks", {
        p_uid: uid,
        p_limit: sLimit,
        p_offset: offset,
      });
      if (error) throw error;
      setSpliks((data as AdminSplikRow[]) || []);
      setSOffset(offset);
    } catch (e: any) {
      toast.error("Failed to load content");
      console.error(e);
    }
  };

  const refreshing = useMemo(() => loading || !stats, [loading, stats]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Admin</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              title="Back to Creator Dashboard"
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Creator Dashboard
            </Button>
            <Button
              variant="outline"
              onClick={() => Promise.all([loadStats(), loadUsers(), loadSpliks()])}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <UsersIcon className="h-4 w-4 text-primary" /> Total Users
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {refreshing ? "…" : stats?.total_users ?? 0}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Film className="h-4 w-4 text-primary" /> Total Spliks
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {refreshing ? "…" : stats?.total_spliks ?? 0}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Utensils className="h-4 w-4 text-primary" /> Food Spliks
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {refreshing ? "…" : stats?.food_spliks ?? 0}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Active Creators (24h)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {refreshing ? "…" : stats?.active_creators_24h ?? 0}
            </CardContent>
          </Card>
        </div>

        {/* USERS TABLE */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-primary" /> Users
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadUsers(Math.max(0, uOffset - uLimit))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadUsers(uOffset + uLimit)}
              >
                Next
              </Button>
              <Button size="sm" onClick={() => loadUsers(uOffset)}>Load</Button>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Created</th>
                  <th className="text-left p-3">Last Sign-In</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-muted-foreground">
                      No users
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.user_id} className="border-t">
                      <td className="p-3">{u.email ?? "—"}</td>
                      <td className="p-3">{fmt(u.created_at)}</td>
                      <td className="p-3">{fmt(u.last_sign_in_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* RECENT TITLES */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Recent titles</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSpliks(Math.max(0, sOffset - sLimit))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSpliks(sOffset + sLimit)}
              >
                Next
              </Button>
              <Button size="sm" onClick={() => loadSpliks(sOffset)}>Load</Button>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Title</th>
                  <th className="text-left p-3">User (email)</th>
                  <th className="text-left p-3">Created</th>
                  <th className="text-left p-3">Food</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {spliks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-muted-foreground">
                      No content
                    </td>
                  </tr>
                ) : (
                  spliks.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-3">{s.title || "Untitled"}</td>
                      <td className="p-3">{s.user_email ?? "—"}</td>
                      <td className="p-3">{fmt(s.created_at)}</td>
                      <td className="p-3">{s.is_food ? "Yes" : "No"}</td>
                      <td className="p-3">{s.status ?? "active"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
