import express from "express";
import compression from "compression";
import Stripe from "stripe";
import cors from "cors";
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

/* ─────────────── CORS ─────────────── */
const splitList = (s) =>
  (s || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\/$/, ""));

const allowedFromEnv = [
  (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, ""),
  ...splitList(process.env.ALLOWED_ORIGINS),
  "https://spilkz.onrender.com",
  "https://splikz.com",
  "https://www.splikz.com",
].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const o = origin.replace(/\/$/, "");
    const sameHost = (() => {
      try {
        const host = new URL(o).hostname;
        return allowedFromEnv.some((a) => {
          try { return new URL(a).hostname === host; } catch { return false; }
        });
      } catch { return false; }
    })();
    const ok = allowedFromEnv.includes(o) || sameHost || /http:\/\/localhost:\d+$/i.test(o) || /https:\/\/[^.]+\.onrender\.com$/i.test(o);
    cb(ok ? null : new Error(`CORS blocked: ${o}`), ok);
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","Accept","Origin"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: "1mb" }));

/* ─────────────── Health ─────────────── */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* ─────────────── Checkout ─────────────── */
app.post("/api/promotions/checkout", async (req, res) => {
  try {
    const { splikId, userId, durationDays, dailyBudgetCents, currency = "USD" } = req.body || {};
    if (!splikId || !durationDays || !dailyBudgetCents) {
      return res.status(400).json({ error: "missing_fields" });
    }

    // Bounds
    const minDaily = 50;     // $0.50
    const maxDaily = 50000;  // $500.00
    if (dailyBudgetCents < minDaily) return res.status(400).json({ error: "amount_too_small" });
    if (dailyBudgetCents > maxDaily) return res.status(400).json({ error: "amount_too_large" });

    const totalCents = Math.round(Number(durationDays) * Number(dailyBudgetCents));
    if (!Number.isFinite(totalCents) || totalCents < 50) {
      return res.status(400).json({ error: "invalid_amount" });
    }

    const successBase = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Promotion for Splik #${splikId}`,
              description: `${durationDays} day(s) × ${(dailyBudgetCents / 100).toFixed(2)} per day`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${successBase}/promote/confirm?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successBase}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: {
        splikId: String(splikId),
        userId: userId ? String(userId) : "",
        durationDays: String(durationDays),
        dailyBudgetCents: String(dailyBudgetCents),
        totalCents: String(totalCents),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

/* ─────────────── Confirm (creates promotion row) ─────────────── */
app.post("/api/promotions/confirm", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "missing_session" });

    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (!s || s.payment_status !== "paid") {
      return res.status(400).json({ error: "not_paid" });
    }

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

    // Insert promotion row
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
    if (error && !String(error.message || "").includes("duplicate key")) {
      console.error(error);
      return res.status(500).json({ error: "db_insert_failed" });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("confirm error:", e);
    return res.status(500).json({ error: "server_error" });
  }
});

/* ─────────────── Optional: expire promotions (cron-safe) ─────────────── */
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

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Promote API listening on :${port}`);
  console.log("CORS allowed:", allowedFromEnv.join(", "));
});
