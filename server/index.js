// server/index.js
import express from "express";
import compression from "compression";
import Stripe from "stripe";
import cors from "cors";

/* ─────────────────────────────
   Environment + Stripe setup
────────────────────────────── */
const requiredEnv = ["STRIPE_SECRET_KEY", "PUBLIC_SITE_URL"];
for (const k of requiredEnv) {
  if (!process.env[k]) {
    console.warn(`[warn] Missing env ${k}`);
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

const app = express();
app.set("trust proxy", 1);

/* ─────────────────────────────
   CORS
────────────────────────────── */
const splitList = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/\/$/, ""));

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
    const allowExact = allowedFromEnv.includes(o);
    const allowByHost = (() => {
      try {
        const host = new URL(o).hostname;
        return allowedFromEnv.some((a) => {
          try { return new URL(a).hostname === host; } catch { return false; }
        });
      } catch { return false; }
    })();
    const allowLocalhost = /http:\/\/localhost:\d+$/i.test(o);
    const allowRender = /https:\/\/[^.]+\.onrender\.com$/i.test(o);
    const ok = allowExact || allowByHost || allowLocalhost || allowRender;

    if (!ok) {
      console.log(`CORS BLOCKED: ${o}. Allowed:`, allowedFromEnv);
    } else {
      console.log(`CORS ALLOWED: ${o}`);
    }
    cb(ok ? null : new Error(`CORS blocked: ${o}`), ok);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(compression());
app.use(express.json({ limit: "1mb" }));

/* ─────────────────────────────
   Health
────────────────────────────── */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* ─────────────────────────────
   Checkout (handler)
────────────────────────────── */
async function createPromotionCheckout(req, res) {
  try {
    console.log("Received checkout request:", {
      origin: req.get("origin"),
      body: req.body,
    });

    // ✨ ADD userId here (optional)
    const {
      splikId,
      durationDays,
      dailyBudgetCents,
      currency = "USD",
      userId, // <— NEW
    } = req.body || {};

    if (!splikId || !durationDays || !dailyBudgetCents) {
      console.log("Missing fields:", { splikId, durationDays, dailyBudgetCents });
      return res.status(400).json({ error: "missing_fields" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.log("Stripe not configured");
      return res.status(500).json({ error: "stripe_not_configured" });
    }

    const unitAmount = Number(durationDays) * Number(dailyBudgetCents);
    if (!Number.isFinite(unitAmount) || unitAmount < 50) {
      console.log("Amount too small:", unitAmount);
      return res.status(400).json({ error: "amount_too_small" });
    }

    const successBase = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
    if (!successBase) {
      console.log("Missing PUBLIC_SITE_URL");
      return res.status(500).json({ error: "missing_PUBLIC_SITE_URL" });
    }

    console.log("Creating Stripe session...");
    const meta = {
      splikId: String(splikId),
      durationDays: String(durationDays),
      dailyBudgetCents: String(dailyBudgetCents),
    };
    if (userId) meta.userId = String(userId); // ✨ include if present

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
            unit_amount: Math.round(unitAmount),
          },
          quantity: 1,
        },
      ],
      // ✨ helpful for correlating on Stripe side
      client_reference_id: userId ? String(userId) : undefined,
      success_url: `${successBase}/dashboard?promo=success&cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successBase}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: meta,
    });

    console.log("Stripe session created successfully");
    return res.json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    return res.status(500).json({ error: "server_error", message: err.message });
  }
}

/* ─────────────────────────────
   Routes
────────────────────────────── */
app.post("/api/promotions/checkout", createPromotionCheckout);
app.post("/api/promote/checkout", createPromotionCheckout);

app.get("/api/test", (req, res) => {
  res.json({
    message: "CORS test successful",
    origin: req.get("origin"),
    timestamp: new Date().toISOString(),
  });
});

/* ─────────────────────────────
   Start
────────────────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Promote API listening on :${port}`);
  console.log("Environment check:");
  console.log("- PUBLIC_SITE_URL:", process.env.PUBLIC_SITE_URL || "(missing)");
  console.log("- ALLOWED_ORIGINS:", process.env.ALLOWED_ORIGINS || "(missing)");
  console.log("- STRIPE_SECRET_KEY:", process.env.STRIPE_SECRET_KEY ? "(present)" : "(missing)");
  if (allowedFromEnv.length) {
    console.log("CORS allowed origins:", allowedFromEnv.join(", "));
  } else {
    console.log("CORS allowed origins: (none). Set PUBLIC_SITE_URL and/or ALLOWED_ORIGINS.");
  }
});
