// server/server.mjs
import express from "express";
import compression from "compression";
import { createClient } from "@supabase/supabase-js";

const PORT = process.env.PORT || 3000;

// Prefer server env, fall back to your existing VITE_* if needed
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Your public site origin (used in <meta og:url> and redirects)
const SITE_ORIGIN =
  process.env.SITE_ORIGIN ||
  process.env.PUBLIC_SITE_URL ||
  "https://www.splikz.com";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Render will show this clearly in logs
  throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = express();
app.disable("x-powered-by");
app.use(compression());

// health
app.get("/healthz", (_req, res) => res.type("text/plain").send("ok"));

/**
 * /v/:id -> tiny HTML page with OG/Twitter tags
 * Real users are redirected to /video/:id immediately.
 * Bots (FB/Twitter/iMessage/Slack/etc) read the <meta> tags.
 */
app.get("/v/:id", async (req, res) => {
  const { id } = req.params;

  // cache for bots; OK to re-fetch every 5 min
  res.set("Cache-Control", "public, max-age=60, s-maxage=300");

  // 1) fetch video
  let splik = null;
  let creator = null;

  // Try single query with join (works if your policy allows it)
  const { data: joined } = await supabase
    .from("spliks")
    .select(
      "id,title,description,video_url,thumbnail_url,status,user_id,profiles(display_name,username)"
    )
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();

  if (joined) {
    splik = {
      id: joined.id,
      title: joined.title,
      description: joined.description,
      video_url: joined.video_url,
      thumbnail_url: joined.thumbnail_url,
      status: joined.status,
      user_id: joined.user_id,
    };
    creator =
      joined.profiles?.display_name ||
      joined.profiles?.username ||
      "Splikz Creator";
  } else {
    // If join blocked by RLS, fetch separately
    const { data: v } = await supabase
      .from("spliks")
      .select(
        "id,title,description,video_url,thumbnail_url,status,user_id"
      )
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();

    splik = v || null;

    if (splik?.user_id) {
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name,username")
        .eq("id", splik.user_id)
        .maybeSingle();
      creator = p?.display_name || p?.username || "Splikz Creator";
    }
  }

  // Not found or not public
  if (!splik) {
    return res
      .status(404)
      .type("text/html")
      .send(`<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>404 — Splikz</title>
<meta property="og:title" content="Splik not found">
<meta property="og:description" content="This splik doesn’t exist or isn’t public.">
<meta property="og:image" content="${SITE_ORIGIN}/og/cover.png">
<meta property="og:type" content="website">
</head><body>
<h1>404</h1>
<p>This splik doesn’t exist or isn’t public.</p>
</body></html>`);
  }

  const canonical = `${SITE_ORIGIN}/video/${splik.id}`;

  const title =
    splik.title?.trim() ||
    (creator ? `${creator} on Splikz` : "Watch on Splikz");
  const desc =
    splik.description?.trim() ||
    (creator
      ? `A 3-second moment by ${creator} — watch on Splikz.`
      : "Watch this 3-second moment on Splikz.");
  const image =
    splik.thumbnail_url ||
    `${SITE_ORIGIN}/og/cover.png`; // fallback image if no poster yet

  // most link unfurlers require an image; we also include video tags
  const og = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${canonical}">
<meta name="viewport" content="width=device-width, initial-scale=1">

<meta property="og:site_name" content="Splikz">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:type" content="video.other">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta property="og:image:alt" content="${escapeHtml(title)}">
<meta property="og:video" content="${splik.video_url}">
<meta property="og:video:secure_url" content="${splik.video_url}">
<meta property="og:video:type" content="video/mp4">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${image}">

<meta name="robots" content="max-image-preview:large">
<script>
  // humans are redirected to the real page instantly
  if (typeof window !== 'undefined') {
    window.location.replace(${JSON.stringify(canonical)});
  }
</script>
<noscript><meta http-equiv="refresh" content="0;url=${canonical}"/></noscript>
</head>
<body>
Redirecting to <a href="${canonical}">${canonical}</a>…
</body>
</html>`;

  res.status(200).type("text/html").send(og);
});

// (optional) super-simple embeddable player if you ever switch to twitter:player
app.get("/embed/:id", async (req, res) => {
  const { id } = req.params;
  const { data: v } = await supabase
    .from("spliks")
    .select("video_url,status")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();

  if (!v) return res.status(404).type("text/plain").send("Not found");

  res.set("Cache-Control", "public, max-age=60, s-maxage=300");
  res.type("text/html").send(`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#000;height:100%}video{width:100%;height:100%;object-fit:cover}</style>
</head><body>
<video autoplay muted loop playsinline controls src="${v.video_url}"></video>
</body></html>`);
});

app.listen(PORT, () =>
  console.log(`OG server running on :${PORT} (origin ${SITE_ORIGIN})`)
);

// tiny helper
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
