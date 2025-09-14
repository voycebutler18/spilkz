// index.js (ESM) — Zero-CORS Stripe checkout with server-side success handling

import express from "express";
import compression from "compression";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/* ─────────────── Env + clients ─────────────── */
const required = ["STRIPE_SECRET_KEY", "PUBLIC_SITE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE"];
for (const k of required) if (!process.env[k]) console.warn(`[warn] Missing env ${k}`);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-06-20" });
const supa = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE || "", {
  auth: { persistSession: false },
});

const app = express();
app.set("trust proxy", 1);
app.use(compression());
app.use(express.json({ limit: "1mb" }));

/* ─────────────── Helpers ─────────────── */
const successBase = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, ""); // e.g. https://splikz.onrender.com
const clampBudget = (cents) => Math.max(50, Math.min(50000, Math.round(Number(cents) || 0))); // 50¢..$500/day
const totalFor = (days, dailyCents) => Math.round(Number(days) * clampBudget(dailyCents));
const apiBaseFromReq = (req) => `${req.protocol}://${req.get("host")}`;

/* ─────────────── Health ─────────────── */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* 
   ─────────────────────────────────────────────────────────────────────────────
   ZERO-CORS FLOW (recommended)
   1) Frontend navigates to /pay/checkout?splikId=...&days=...&dailyBudgetCents=...
   2) API creates Stripe session and 303 redirects to Stripe
   3) Stripe returns to /pay/success?cs=... (this server), which:
      - verifies payment, inserts promotion row, then
      - redirects back to your site’s success page
   ─────────────────────────────────────────────────────────────────────────────
*/

// GET → create session & redirect to Stripe
app.get("/pay/checkout", async (req, res) => {
  try {
    const splikId = String(req.query.splikId || "");
    const userId  = req.query.userId ? String(req.query.userId) : "";
    const days    = Number(req.query.days || "0");
    const dailyC  = Number(req.query.dailyBudgetCents || "0");  // cents
    const currency = String(req.query.currency || "USD").toLowerCase();

    if (!splikId || !days || !dailyC) return res.status(400).send("Missing fields");
    const totalCents = totalFor(days, dailyC);
    if (!Number.isFinite(totalCents) || totalCents < 50) return res.status(400).send("Invalid amount");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: `Promotion for Splik #${splikId}`,
            description: `${days} day(s) × ${(clampBudget(dailyC) / 100).toFixed(2)} per day`,
          },
          unit_amount: totalCents,
        },
        quantity: 1,
      }],
      // after Stripe pays, come back to THIS API to finalize DB (no CORS)
      success_url: `${apiBaseFromReq(req)}/pay/success?cs={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${successBase}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: {
        splikId,
        userId,
        durationDays: String(days),
        dailyBudgetCents: String(clampBudget(dailyC)),
        totalCents: String(totalCents),
      },
    });

    return res.redirect(303, session.url);
  } catch (err) {
    console.error("GET /pay/checkout error:", err);
    return res.status(500).send("Server error");
  }
});

// GET → Stripe returns here; confirm payment, write DB, then send user back to site
app.get("/pay/success", async (req, res) => {
  try {
    const sessionId = String(req.query.cs || "");
    if (!sessionId) return res.status(400).send("Missing session");

    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (!s || s.payment_status !== "paid") return res.status(400).send("Not paid");

    const md = s.metadata || {};
    const splikId = md.splikId;
    const userId = md.userId || null;
    const durationDays = Number(md.durationDays || "0");
    const dailyBudgetCents = Number(md.dailyBudgetCents || "0");
    const totalCents = Number(md.totalCents || "0");

    if (!splikId || !durationDays || !dailyBudgetCents || !totalCents) {
      return res.status(400).send("Invalid metadata");
    }

    const now = new Date();
    const end = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // idempotent insert (add a unique index on checkout_session_id in DB)
    const { error } = await supa.from("promotions").insert({
      splik_id: splikId,
      user_id: userId,
      daily_budget_cents: dailyBudgetCents,
      duration_days: durationDays,
      total_cents: totalCents,
      start_at: now.toISOString(),
      end_at: end.toISOString(),
      status: "active",
      checkout_session_id: sessionId,
    });
    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      console.error("DB insert error:", error);
      return res.status(500).send("DB error");
    }

    // back to your site’s success page
    return res.redirect(303, `${successBase}/promote/success?s=${encodeURIComponent(String(splikId))}`);
  } catch (e) {
    console.error("GET /pay/success error:", e);
    return res.status(500).send("Server error");
  }
});

// Optional: passthrough cancel (not strictly required)
app.get("/pay/cancel", (req, res) => {
  const splikId = String(req.query.splikId || "");
  return res.redirect(303, `${successBase}/promote/${encodeURIComponent(splikId)}?canceled=1`);
});

/* 
   ─────────────────────────────────────────────────────────────────────────────
   LEGACY/COMPAT: keep your POST endpoints (they now also bounce back to /pay/success)
   If your UI still calls POST for any reason, it will still work without CORS
   as long as it’s same-origin. For cross-origin, prefer the GET flow above.
   ─────────────────────────────────────────────────────────────────────────────
*/

app.post("/api/promotions/checkout", async (req, res) => {
  try {
    const { splikId, userId, durationDays, dailyBudgetCents, currency = "USD" } = req.body || {};
    if (!splikId || !durationDays || !dailyBudgetCents) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const days = Number(durationDays);
    const dailyC = clampBudget(Number(dailyBudgetCents));
    const totalCents = totalFor(days, dailyC);
    if (!Number.isFinite(totalCents) || totalCents < 50) {
      return res.status(400).json({ error: "invalid_amount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: String(currency).toLowerCase(),
          product_data: {
            name: `Promotion for Splik #${splikId}`,
            description: `${days} day(s) × ${(dailyC / 100).toFixed(2)} per day`,
          },
          unit_amount: totalCents,
        },
        quantity: 1,
      }],
      // important: success returns to API first, not the site
      success_url: `${apiBaseFromReq(req)}/pay/success?cs={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${successBase}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: {
        splikId: String(splikId),
        userId: userId ? String(userId) : "",
        durationDays: String(days),
        dailyBudgetCents: String(dailyC),
        totalCents: String(totalCents),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// Still available if needed elsewhere (server-to-server)
app.post("/api/promotions/confirm", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "missing_session" });

    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (!s || s.payment_status !== "paid") return res.status(400).json({ error: "not_paid" });

    const md = s.metadata || {};
    const splikId = md.splikId;
    const userId = md.userId || null;
    const durationDays = Number(md.durationDays || "0");
    const dailyBudgetCents = Number(md.dailyBudgetCents || "0");
    const totalCents = Number(md.totalCents || "0");
    if (!splikId || !durationDays || !dailyBudgetCents || !totalCents) {
      return res.status(400).json({ error: "invalid_metadata" });
    }

    const now = new Date();
    const end = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const { error } = await supa.from("promotions").insert({
      splik_id: splikId,
      user_id: userId,
      daily_budget_cents: dailyBudgetCents,
      duration_days: durationDays,
      total_cents: totalCents,
      start_at: now.toISOString(),
      end_at: end.toISOString(),
      status: "active",
      checkout_session_id: sessionId,
    });
    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      console.error(error);
      return res.status(500).json({ error: "db_insert_failed" });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("confirm error:", e);
    return res.status(500).json({ error: "server_error" });
  }
});

/* ─────────────── Optional: expire promotions ─────────────── */
app.post("/api/promotions/expire", async (_req, res) => {
  try {
    const { error } = await supa
      .from("promotions")
      .update({ status: "expired" })
      .lte("end_at", new Date().toISOString())
      .neq("status", "expired");
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error("expire error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

/* ─────────────── Start ─────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Promote API listening on :${port}`);
  console.log(`Public site: ${successBase}`);
  console.log(`Example checkout: /pay/checkout?splikId=123&days=7&dailyBudgetCents=50`);
});
