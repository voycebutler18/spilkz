// server/server.mjs
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import Ffmpeg from "fluent-ffmpeg";

Ffmpeg.setFfmpegPath(ffmpegPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../dist");
const indexPath = path.join(distDir, "index.html");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const escapeHtml = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const getIndex = () => fs.readFile(indexPath, "utf8");
const originOf = (req) =>
  `${(req.headers["x-forwarded-proto"] || req.protocol).toString().split(",")[0]}://${req.get("host")}`;

async function fetchSplik(id) {
  const { data: v } = await supabase
    .from("spliks")
    .select("*")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (!v) return null;

  let profile = null;
  if (v.user_id) {
    const { data: p } = await supabase
      .from("profiles")
      .select("display_name,username")
      .eq("id", v.user_id)
      .maybeSingle();
    profile = p || null;
  }
  return { ...v, profile };
}

function frameFromVideo(videoUrl, sec = 0.5) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = Ffmpeg(videoUrl)
      .seekInput(sec)
      .outputOptions(["-frames:v 1", "-qscale:v 3"])
      .format("mjpeg")
      .on("error", reject)
      .pipe();
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function withMeta(html, meta) {
  const {
    title = "Splikz",
    description = "Share your perfect 3-second moment.",
    url,
    image,
    videoUrl,
    videoType = "video/mp4",
    width = 720,
    height = 1280,
  } = meta;

  const tags = `
    <link rel="canonical" href="${url}" />
    <meta name="description" content="${escapeHtml(description)}" />

    <meta property="og:type" content="video.other" />
    <meta property="og:site_name" content="Splikz" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:video" content="${videoUrl || ""}" />
    <meta property="og:video:secure_url" content="${videoUrl || ""}" />
    <meta property="og:video:type" content="${videoType}" />
    <meta property="og:video:width" content="${width}" />
    <meta property="og:video:height" content="${height}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${image}" />
  `;
  return html.replace("</head>", `${tags}\n</head>`);
}

const app = express();

// Serve the Vite build (dist) without auto index so we can inject <meta> on /video/:id
app.use(express.static(distDir, { index: false, maxAge: "1y", immutable: true }));

// Dynamic preview image (first frame, no manual thumbnail)
app.get("/og/splik/:id.jpg", async (req, res) => {
  try {
    const splik = await fetchSplik(req.params.id);
    if (!splik?.video_url) return res.status(404).end();

    // If you later store a thumbnail_url, prefer that:
    if (splik.thumbnail_url) {
      res.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
      return res.redirect(302, splik.thumbnail_url);
    }

    const buf = await frameFromVideo(splik.video_url, 0.5);
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
    res.send(buf);
  } catch {
    res.status(500).end();
  }
});

// Inject OG/Twitter meta for share unfurl on /video/:id
app.get("/video/:id", async (req, res) => {
  const base = await getIndex();
  const origin = originOf(req);
  const pageUrl = `${origin}${req.originalUrl}`;

  const splik = await fetchSplik(req.params.id);
  if (splik) {
    const title =
      splik.title || splik.profile?.display_name || splik.profile?.username || "Splikz";
    const description = splik.description || "Share your perfect 3-second moment.";
    const image = `${origin}/og/splik/${splik.id}.jpg`;
    const html = withMeta(base, {
      title,
      description,
      url: pageUrl,
      image,
      videoUrl: splik.video_url,
      videoType: "video/mp4",
      width: 720,
      height: 1280,
    });
    res.set("Cache-Control", "public, max-age=600");
    return res.status(200).send(html);
  }

  // Fallback page (not found/private)
  const html = withMeta(base, {
    title: "Splik not found",
    description: "This Splik is private or no longer exists.",
    url: pageUrl,
    image: `${origin}/og-default.jpg`,
  });
  res.status(200).send(html);
});

// Everything else -> SPA
app.get("*", async (_req, res) => {
  res.status(200).send(await getIndex());
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Splikz server on", port));
