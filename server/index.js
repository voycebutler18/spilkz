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
    // Log but don't crash in case you're building locally
    console.warn(`[warn] Missing env ${k}`);
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

const app = express();
app.set("trust proxy", 1); // good default behind proxies (Render, etc.)

/* ─────────────────────────────
   CORS
   Allow your production site, any origins listed in ALLOWED_ORIGINS,
   and localhost for dev.
────────────────────────────── */
const splitList = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/\/$/, "")); // strip trailing slash

const allowedFromEnv = [
  (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, ""),
  ...splitList(process.env.ALLOWED_ORIGINS),
].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // server-to-server, curl, etc.

    // normalize
    const o = origin.replace(/\/$/, "");
    const allowExact = allowedFromEnv.includes(o);

    const allowByHost = (() => {
      try {
        const host = new URL(o).hostname;
        return allowedFromEnv.some((a) => {
          try {
            return new URL(a).hostname === host;
          } catch {
            return false;
          }
        });
      } catch {
        return false;
      }
    })();

    const allowLocalhost = /http:\/\/localhost:\d+$/i.test(o);

    const ok = allowExact || allowByHost || allowLocalhost;
    cb(ok ? null : new Error(`CORS blocked: ${o}`), ok);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // preflight
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
    const {
      splikId,
      durationDays,
      dailyBudgetCents,
      currency = "USD",
    } = req.body || {};

    if (!splikId || !durationDays || !dailyBudgetCents) {
      return res.status(400).json({ error: "missing_fields" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "stripe_not_configured" });
    }

    const unitAmount = Number(durationDays) * Number(dailyBudgetCents); // cents
    if (!Number.isFinite(unitAmount) || unitAmount < 50) {
      // Stripe min is $0.50 (50 cents)
      return res.status(400).json({ error: "amount_too_small" });
    }

    const successBase = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
    if (!successBase) {
      return res.status(500).json({ error: "missing_PUBLIC_SITE_URL" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Promotion for Splik #${splikId}`,
              description: `${durationDays} day(s) × ${(dailyBudgetCents / 100).toFixed(
                2
              )} per day`,
            },
            unit_amount: Math.round(unitAmount),
          },
          quantity: 1,
        },
      ],
      success_url: `${successBase}/dashboard?promo=success&cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successBase}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: {
        splikId: String(splikId),
        durationDays: String(durationDays),
        dailyBudgetCents: String(dailyBudgetCents),
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    return res.status(500).json({ error: "server_error" });
  }
}

/* ─────────────────────────────
   Routes
   (both paths supported for your frontend fallbacks)
────────────────────────────── */
app.post("/api/promotions/checkout", createPromotionCheckout);
app.post("/api/promote/checkout", createPromotionCheckout); // alias

/* ─────────────────────────────
   Start
────────────────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Promote API listening on :${port}`);
  if (allowedFromEnv.length) {
    console.log("CORS allowed origins:", allowedFromEnv.join(", "));
  } else {
    console.log(
      "CORS allowed origins: (none from env). Set PUBLIC_SITE_URL and/or ALLOWED_ORIGINS."
    );
  }
});
