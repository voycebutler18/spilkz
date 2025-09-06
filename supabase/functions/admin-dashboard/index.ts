// supabase/functions/admin-dashboard/index.ts
// Deno Edge Function (server-only)
// Endpoints:
//   GET  /stats
//   GET  /users?limit=&page=
//   DELETE /users/:id
//   GET  /content?limit=&page=  (titles only; no URLs)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*"; // set to https://spilkz.com

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET,DELETE,OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });

const text = (msg: string, status = 400) =>
  new Response(msg, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Browser session token -> identify caller
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userWrap, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userWrap?.user) return text("Unauthorized", 401);
  const user = userWrap.user;

  // Verify caller is in admin_users
  const { data: adminRow } = await userClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) return text("Forbidden", 403);

  // Service client for privileged actions (emails, delete user, etc.)
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const url = new URL(req.url);
  // Path after .../admin-dashboard
  const path = url.pathname.split("/").slice(3).join("/");

  // ---------- /stats ----------
  if (req.method === "GET" && path === "stats") {
    // Users count (via profiles to avoid iterating auth list)
    const { count: profileCount } = await svc
      .from("profiles")
      .select("*", { count: "exact", head: true });

    // Spliks totals
    const { count: splikCount } = await svc
      .from("spliks")
      .select("*", { count: "exact", head: true });
    const { count: foodCount } = await svc
      .from("spliks")
      .select("*", { count: "exact", head: true })
      .eq("is_food", true);

    // Last 24h active (approx via updated spliks)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: activeCreators } = await svc
      .from("spliks")
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", since);

    return json({
      users_total: profileCount ?? 0,
      spliks_total: splikCount ?? 0,
      food_spliks_total: foodCount ?? 0,
      active_creators_24h: activeCreators ?? 0,
      now: new Date().toISOString(),
    });
  }

  // ---------- /users ----------
  if (req.method === "GET" && path === "users") {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || "25")));
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageToken = undefined; // simple forward pagination

    // Emails require admin API:
    const resp = await svc.auth.admin.listUsers({ page, perPage: limit });
    // Return only safe fields
    const users = resp.data.users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      phone: u.phone ?? null,
      identities: (u.identities ?? []).map((i) => i.provider),
    }));

    return json({
      page,
      count: users.length,
      users,
    });
  }

  // ---------- DELETE /users/:id ----------
  if (req.method === "DELETE" && path.startsWith("users/")) {
    const id = path.split("/")[1];
    if (!id) return text("Missing id", 400);
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) return text(error.message, 400);

    // Optional: clean app-side rows owned by that user
    await svc.from("spliks").delete().eq("user_id", id);
    await svc.from("profiles").delete().eq("id", id);

    return json({ ok: true });
  }

  // ---------- /content (titles only) ----------
  if (req.method === "GET" && path === "content") {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || "50")));
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await svc
      .from("spliks")
      .select("id,title,user_id,created_at,is_food,status", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return text(error.message, 400);

    return json({
      page,
      count: data?.length ?? 0,
      total: count ?? 0,
      items: data ?? [],
    });
  }

  return text("Not found", 404);
});
