// index.js (Node / Express, ESM)
import express from "express";
import compression from "compression";
import Stripe from "stripe";
import cors from "cors";

/* ─────────────── Env ─────────────── */
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const PUBLIC_SITE_URL =
  (process.env.PUBLIC_SITE_URL || "https://spilkz.onrender.com").replace(/\/$/, "");

if (!STRIPE_SECRET_KEY) console.warn("[warn] STRIPE_SECRET_KEY is not set");
if (!PUBLIC_SITE_URL) console.warn("[warn] PUBLIC_SITE_URL is not set");

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

/* ─────────────── App ─────────────── */
const app = express();
app.set("trust proxy", 1);
app.use(compression());
app.use(express.json({ limit: "1mb" }));

// CORS only for the JSON POST endpoint; GET redirect doesn't need it
app.use(
  "/api",
  cors({
    origin: true,
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Origin", "Authorization"],
  })
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* Helpers */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const toInt = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
};

/* ─────────────── GET /pay/checkout ───────────────
   Full-page redirect to Stripe. You are already hitting this path.
   Query params:
     splikId, userId, days, dailyBudgetCents, currency
*/
app.get("/pay/checkout", async (req, res) => {
  try {
    const splikId = String(req.query.splikId || "").trim();
    const userId = (req.query.userId ? String(req.query.userId) : "").trim();
    const days = clamp(toInt(req.query.days, 0), 1, 30);
    const dailyBudgetCents = clamp(toInt(req.query.dailyBudgetCents, 0), 50, 50000); // $0.50–$500/day
    const currency = String(req.query.currency || "USD").toLowerCase();

    if (!splikId || !days || !dailyBudgetCents) {
      return res.status(400).send("Missing or invalid params.");
    }

    const totalCents = days * dailyBudgetCents;
    if (!Number.isFinite(totalCents) || totalCents < 50) {
      return res.status(400).send("Invalid amount.");
    }

    const successUrl = `${PUBLIC_SITE_URL}/?promo=success`;
    const cancelUrl = `${PUBLIC_SITE_URL}/promote/${encodeURIComponent(splikId)}?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `Promotion for Splik #${splikId}`,
              description: `${days} day(s) × ${(dailyBudgetCents / 100).toFixed(2)} per day`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        splikId,
        userId,
        durationDays: String(days),
        dailyBudgetCents: String(dailyBudgetCents),
        totalCents: String(totalCents),
      },
    });

    // ⬇️ Important: 303 redirect straight to Stripe
    return res.redirect(303, session.url);
  } catch (err) {
    console.error("GET /pay/checkout error:", err);
    return res.status(500).send("Server error.");
  }
});

/* ─────────────── POST /api/promotions/checkout ───────────────
   Optional JSON variant (returns {url}) if you ever want to use fetch()
*/
app.post("/api/promotions/checkout", async (req, res) => {
  try {
    const {
      splikId,
      userId = "",
      durationDays,
      dailyBudgetCents,
      currency = "USD",
    } = req.body || {};

    const days = clamp(toInt(durationDays, 0), 1, 30);
    const perDayCents = clamp(toInt(dailyBudgetCents, 0), 50, 50000);

    if (!splikId || !days || !perDayCents) {
      return res.status(400).json({ error: "missing_or_invalid_params" });
    }

    const totalCents = days * perDayCents;
    if (!Number.isFinite(totalCents) || totalCents < 50) {
      return res.status(400).json({ error: "invalid_amount" });
    }

    const successUrl = `${PUBLIC_SITE_URL}/?promo=success`;
    const cancelUrl = `${PUBLIC_SITE_URL}/promote/${encodeURIComponent(splikId)}?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: String(currency).toLowerCase(),
            product_data: {
              name: `Promotion for Splik #${splikId}`,
              description: `${days} day(s) × ${(perDayCents / 100).toFixed(2)} per day`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        splikId: String(splikId),
        userId: String(userId || ""),
        durationDays: String(days),
        dailyBudgetCents: String(perDayCents),
        totalCents: String(totalCents),
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("POST /api/promotions/checkout error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

/* Fallback 404 (helps avoid Render static 404 confusing you) */
app.use((req, res) => {
  res.status(404).send("Not Found – did you mean GET /pay/checkout ?");
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Promote API listening on :${port}`);
  console.log("PUBLIC_SITE_URL:", PUBLIC_SITE_URL);
});
