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

// ---- env: supports SUPABASE_* or VITE_* (Render/Web Service)
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (!supabase) {
  console.warn(
    "[server] Supabase env missing (SUPABASE_URL/SUPABASE_ANON_KEY). " +
      "OG routes will use fallback image."
  );
}

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use(cors());

// Cache static assets long; never cache the HTML shell
app.use((req, res, next) => {
  if (/\.(js|css|png|jpe?g|gif|svg|ico|webp|woff2?)$/i.test(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  next();
});
app.use(express.static(DIST, { index: false }));

// ----------------------- utils -----------------------
async function readIndexHtml() {
  const html = await fs.readFile(INDEX_HTML, "utf8");
  return stripStaticSeo(html);
}

// remove any existing og:*, twitter:* and canonical tags so ours are the first ones crawlers see
function stripStaticSeo(html) {
  return html
    .replace(/<meta[^>]+property=['"]og:[^'"]+['"][^>]*>\s*/gi, "")
    .replace(/<meta[^>]+name=['"]twitter:[^'"]+['"][^>]*>\s*/gi, "")
    .replace(/<link[^>]+rel=['"]canonical['"][^>]*>\s*/gi, "");
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

function toAbsoluteHttps(url, base) {
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
  if (url.startsWith("/")) return base + url;
  return `${base}/${url.replace(/^\.?\//, "")}`;
}

// ----------------------- OG for videos -----------------------
async function renderVideoOG(req, res, id) {
  try {
    const base = absoluteBase(req);
    const canonical = `${base}/video/${id}`;

    // Defaults (ensure this image exists in /public -> /dist)
    let ogTitle = "Splikz — 3-Second Video";
    let ogDesc = "Watch this 3-second Splik!";
    let ogImage = toAbsoluteHttps("/splikz-og.png", base);

    if (supabase) {
      const { data, error } = await supabase
        .from("spliks")
        .select("id,title,description,thumbnail_url,poster_url,status")
        .eq("id", id)
        .eq("status", "active")
        .maybeSingle();

      if (error) console.warn("[server] Supabase error:", error.message);

      if (data) {
        ogTitle = data.title || ogTitle;
        ogDesc = (data.description || "").slice(0, 160) || ogDesc;
        const chosen = data.thumbnail_url || data.poster_url || ogImage;
        ogImage = toAbsoluteHttps(chosen, base);
      } else {
        console.warn(`[server] No active video row for id=${id}; using fallback OG image.`);
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
      <meta property="og:image:secure_url" content="${ogImage}">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
      <meta name="twitter:description" content="${escapeHtml(ogDesc)}">
      <meta name="twitter:image" content="${ogImage}">
    `;

    const html = injectHead(await readIndexHtml(), extra);
    res
      .status(200)
      .type("html")
      .set("Cache-Control", "no-cache, no-store, must-revalidate")
      .send(html);
  } catch (err) {
    console.error("OG route error:", err);
    res
      .status(200)
      .set("Cache-Control", "no-cache")
      .sendFile(INDEX_HTML);
  }
}

// ----------------------- routes -----------------------
app.get("/healthz", (_req, res) => res.type("text").send("ok"));

app.get("/video/:id", (req, res) => renderVideoOG(req, res, req.params.id));
app.get("/v/:id", (req, res) => renderVideoOG(req, res, req.params.id));

// Root + SPA fallback
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(INDEX_HTML);
});
app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(INDEX_HTML);
});

// ----------------------- boot -----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
