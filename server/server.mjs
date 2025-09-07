// server/server.mjs
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3000
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://splikz.com'
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const distDir = path.resolve(__dirname, '../dist')
const indexHtmlPath = path.join(distDir, 'index.html')

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
}

function esc(s = '') {
  return String(s).replace(/[&<>"]/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])
  )
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const p = url.pathname

    // health
    if (p === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
      return
    }

    // OG route: /v/:id
    if (p.startsWith('/v/')) {
      const id = p.split('/')[2]
      if (!id) {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end('missing id')
        return
      }

      const { data: v } = await supabase
        .from('spliks')
        .select('*')
        .eq('id', id)
        .eq('status', 'active')
        .maybeSingle()

      let title = 'Splikz'
      let desc = 'Share your perfect 3-second moment.'
      let image = `${SITE_ORIGIN}/og-default.jpg`
      let videoUrl = undefined

      if (v) {
        title = v.title || title
        desc = v.description || desc
        image = v.thumbnail_url || image
        videoUrl = v.video_url
      }

      const pageUrl = `${SITE_ORIGIN}/video/${id}`
      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${pageUrl}">

<meta property="og:type" content="video.other">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${image}">
${videoUrl ? `<meta property="og:video" content="${videoUrl}">
<meta property="og:video:secure_url" content="${videoUrl}">
<meta property="og:video:type" content="video/mp4">` : ''}

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${image}">
<meta name="viewport" content="width=device-width, initial-scale=1">

<meta http-equiv="refresh" content="0; url=${pageUrl}">
</head>
<body>Redirecting to <a href="${pageUrl}">${pageUrl}</a>…</body>
</html>`

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    // static from /dist + SPA fallback
    let filePath = path.join(distDir, decodeURIComponent(p))
    if (p.endsWith('/')) filePath = path.join(filePath, 'index.html')

    try {
      const stat = await fs.stat(filePath)
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html')
      const ext = path.extname(filePath)
      const buf = await fs.readFile(filePath)
      res.writeHead(200, { 'content-type': mime[ext] || 'application/octet-stream' })
      res.end(buf)
      return
    } catch {
      const buf = await fs.readFile(indexHtmlPath)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(buf)
      return
    }
  } catch (err) {
    console.error(err)
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end('server error')
  }
})

server.listen(PORT, () => {
  console.log('listening on', PORT)
})
