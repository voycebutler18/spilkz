import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, Trash2, RefreshCw, List, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const maskEmail = (e: string) => {
  const [name, domain] = e.split("@");
  if (!domain) return e;
  const maskedName = name.length <= 2 ? name[0] + "*" : name[0] + "*".repeat(name.length - 2) + name.slice(-1);
  return `${maskedName}@${domain}`;
};

async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard`;
  const res = await fetch(`${base}/${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    let msg = await res.text().catch(() => "");
    try { msg = JSON.parse(msg).error || msg } catch {}
    throw new Error(msg || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Stats
  const [stats, setStats] = useState<any | null>(null);

  // Users
  const [usersLoading, setUsersLoading] = useState(false);
  const [users, setUsers] = useState<Array<any>>([]);
  const [page, setPage] = useState(1);

  // Content (titles)
  const [titlesLoading, setTitlesLoading] = useState(false);
  const [items, setItems] = useState<Array<any>>([]);
  const [cPage, setCPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const s = await authedFetch("stats");
        setStats(s);
      } catch (e: any) {
        if (/403/i.test(e.message)) setForbidden(true);
        toast({ title: "Access error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadUsers = async (p = 1) => {
    setUsersLoading(true);
    try {
      const data = await authedFetch(`users?limit=25&page=${p}`);
      setUsers(data.users || []);
      setPage(p);
    } catch (e: any) {
      toast({ title: "Failed to load users", description: e.message, variant: "destructive" });
    } finally {
      setUsersLoading(false);
    }
  };

  const loadTitles = async (p = 1) => {
    setTitlesLoading(true);
    try {
      const data = await authedFetch(`content?limit=25&page=${p}`);
      setItems(data.items || []);
      setCPage(p);
    } catch (e: any) {
      toast({ title: "Failed to load content", description: e.message, variant: "destructive" });
    } finally {
      setTitlesLoading(false);
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Delete this user and their content? This cannot be undone.")) return;
    try {
      await authedFetch(`users/${id}`, { method: "DELETE" });
      toast({ title: "User deleted" });
      loadUsers(page);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading admin…
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="p-6 max-w-xl">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-red-500" />
              <h1 className="text-lg font-semibold">Admins only</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Your account is not on the admin allow-list. Ask the owner to add your <code>auth.users.id</code> to
              <code>admin_users</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Button variant="outline" onClick={async () => {
          setLoading(true);
          try {
            const s = await authedFetch("stats");
            setStats(s);
          } finally {
            setLoading(false);
          }
        }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Users</div>
          <div className="text-2xl font-semibold">{stats?.users_total ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Spliks</div>
          <div className="text-2xl font-semibold">{stats?.spliks_total ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Food Spliks</div>
          <div className="text-2xl font-semibold">{stats?.food_spliks_total ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Active Creators (24h)</div>
          <div className="text-2xl font-semibold">{stats?.active_creators_24h ?? 0}</div>
        </CardContent></Card>
      </div>

      {/* Users */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <h2 className="text-lg font-semibold">Users</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => loadUsers(Math.max(1, page - 1))}>Prev</Button>
            <Button variant="outline" size="sm" onClick={() => loadUsers(page + 1)}>Next</Button>
            <Button size="sm" onClick={() => loadUsers(page)} disabled={usersLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${usersLoading ? "animate-spin" : ""}`} />
              Load
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Created</th>
                    <th className="text-left p-3">Last Sign-In</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr><td className="p-4" colSpan={4}><Loader2 className="h-4 w-4 animate-spin" /></td></tr>
                  ) : users.length === 0 ? (
                    <tr><td className="p-4 text-muted-foreground" colSpan={4}>No users</td></tr>
                  ) : users.map((u) => (
                    <tr key={u.id} className="border-b">
                      <td className="p-3 font-mono">{u.email ? maskEmail(u.email) : "—"}</td>
                      <td className="p-3">{new Date(u.created_at).toLocaleString()}</td>
                      <td className="p-3">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}</td>
                      <td className="p-3 text-right">
                        <Button variant="destructive" size="sm" onClick={() => deleteUser(u.id)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content (titles only) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="h-4 w-4" />
            <h2 className="text-lg font-semibold">Recent titles</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => loadTitles(Math.max(1, cPage - 1))}>Prev</Button>
            <Button variant="outline" size="sm" onClick={() => loadTitles(cPage + 1)}>Next</Button>
            <Button size="sm" onClick={() => loadTitles(cPage)} disabled={titlesLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${titlesLoading ? "animate-spin" : ""}`} />
              Load
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Title</th>
                    <th className="text-left p-3">User</th>
                    <th className="text-left p-3">Created</th>
                    <th className="text-left p-3">Food</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {titlesLoading ? (
                    <tr><td className="p-4" colSpan={5}><Loader2 className="h-4 w-4 animate-spin" /></td></tr>
                  ) : items.length === 0 ? (
                    <tr><td className="p-4 text-muted-foreground" colSpan={5}>No content</td></tr>
                  ) : items.map((it) => (
                    <tr key={it.id} className="border-b">
                      <td className="p-3">{it.title || <span className="text-muted-foreground">Untitled</span>}</td>
                      <td className="p-3 font-mono text-xs">{it.user_id}</td>
                      <td className="p-3">{new Date(it.created_at).toLocaleString()}</td>
                      <td className="p-3">{it.is_food ? "Yes" : "No"}</td>
                      <td className="p-3">{it.status || "active"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
