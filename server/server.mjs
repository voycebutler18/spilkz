// server/server.mjs
import express from "express";
import compression from "compression";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST = path.join(__dirname, "../dist");
const INDEX_HTML = path.join(DIST, "index.html");

// ---- env: works with either SUPABASE_* (server) or VITE_* (client) names
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ---------------------------------------------------------------------------

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use(cors());

// cache static files long-term (but NOT index.html)
app.use((req, res, next) => {
  if (/\.(js|css|png|jpe?g|gif|svg|ico|webp|woff2?)$/i.test(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  next();
});
app.use(express.static(DIST, { index: false }));

async function getIndexHtml() {
  return fs.readFile(INDEX_HTML, "utf8");
}
function injectHead(html, extraHead) {
  return html.replace("</head>", `${extraHead}\n</head>`);
}
function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function absoluteBase(req) {
  const envBase = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (envBase) return envBase;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  return `${proto}://${req.get("host")}`;
}

// Dynamic OG for /video/:id (also /v/:id if you want shorter links)
async function renderVideoOG(req, res, id) {
  try {
    const base = absoluteBase(req);
    const canonical = `${base}/video/${id}`;

    // sensible defaults if DB isn’t reachable
    let ogTitle = "Splikz — 3-Second Video";
    let ogDesc = "Watch this 3-second Splik!";
    // Put a brand fallback image into /public/splikz-og.png (bundled to /dist)
    let ogImage = `${base}/splikz-og.png`;

    if (supabase) {
      const { data } = await supabase
        .from("spliks")
        .select("id,title,description,thumbnail_url,poster_url,status")
        .eq("id", id)
        .eq("status", "active")
        .maybeSingle();

      if (data) {
        ogTitle = data.title || ogTitle;
        ogDesc = (data.description || "").slice(0, 160) || ogDesc;
        ogImage = data.thumbnail_url || data.poster_url || ogImage;
      }
    }

    const extra = `
      <link rel="canonical" href="${canonical}">
      <meta property="og:type" content="video.other">
      <meta property="og:site_name" content="Splikz">
      <meta property="og:url" content="${canonical}">
      <meta property="og:title" content="${escapeHtml(ogTitle)}">
      <meta property="og:description" content="${escapeHtml(ogDesc)}">
      <meta property="og:image" content="${ogImage}">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
      <meta name="twitter:description" content="${escapeHtml(ogDesc)}">
      <meta name="twitter:image" content="${ogImage}">
    `;

    const html = injectHead(await getIndexHtml(), extra);
    res.status(200).type("html").send(html);
  } catch (err) {
    console.error("OG route error:", err);
    res.sendFile(INDEX_HTML); // SPA fallback
  }
}

// Health check
app.get("/healthz", (_req, res) => res.type("text").send("ok"));

// OG routes
app.get("/video/:id", (req, res) => renderVideoOG(req, res, req.params.id));
app.get("/v/:id", (req, res) => renderVideoOG(req, res, req.params.id));

// Root + SPA fallback (fixes “Cannot GET /”)
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(INDEX_HTML);
});
app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(INDEX_HTML);
});

// Boot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
