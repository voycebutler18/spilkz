// supabase/functions/og-splik/index.ts
// Deno (Supabase Edge Functions)
import { serve } from "https://deno.land/std/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PUBLIC_SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://your-domain.com").replace(/\/$/, "");

function esc(s: string) {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}

serve(async (req) => {
  // Route: /og-splik/:id
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts.pop();
  if (!id) return new Response("Missing id", { status: 400 });

  // Fetch the video record
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/spliks?id=eq.${encodeURIComponent(id)}&select=id,title,description,thumbnail_url,video_url`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) return new Response("Not found", { status: 404 });
  const rows = await res.json();
  if (!rows?.length) return new Response("Not found", { status: 404 });

  const v = rows[0] as {
    id: string;
    title?: string | null;
    description?: string | null;
    thumbnail_url?: string | null;
    video_url?: string | null;
  };

  const pageUrl = `${PUBLIC_SITE_URL}/video/${v.id}`;
  const title = v.title?.trim() || "Watch this Splik";
  const desc = v.description?.trim() || "Splikz • short video";
  const image = v.thumbnail_url || `${PUBLIC_SITE_URL}/og-default.jpg`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)} — Splikz</title>
<link rel="canonical" href="${pageUrl}"/>

<meta property="og:site_name" content="Splikz"/>
<meta property="og:type" content="video.other"/>
<meta property="og:url" content="${pageUrl}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:image" content="${image}"/>
${v.video_url ? `<meta property="og:video" content="${v.video_url}"/>` : ""}

<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
<meta name="twitter:image" content="${image}"/>

<meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body>
<script>location.replace(${JSON.stringify(pageUrl)});</script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
});
