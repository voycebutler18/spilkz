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
   CORS - UPDATED
   Allow your production site, any origins listed in ALLOWED_ORIGINS,
   and localhost for dev.
────────────────────────────── */
const splitList = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/\/$/, "")); // strip trailing slash

// Add default allowed origins if env vars are missing
const allowedFromEnv = [
  (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, ""),
  ...splitList(process.env.ALLOWED_ORIGINS),
  // Add your known domains as fallbacks
  "https://spilkz.onrender.com",
  "https://splikz.com",
  "https://www.splikz.com", // with www subdomain
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
    
    // Also allow any *.onrender.com domain for development
    const allowRender = /https:\/\/[^\.]+\.onrender\.com$/i.test(o);

    const ok = allowExact || allowByHost || allowLocalhost || allowRender;
    
    // Log for debugging
    if (!ok) {
      console.log(`CORS BLOCKED: ${o}. Allowed origins:`, allowedFromEnv);
    } else {
      console.log(`CORS ALLOWED: ${o}`);
    }
    
    cb(ok ? null : new Error(`CORS blocked: ${o}`), ok);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With",
    "Accept",
    "Origin"
  ],
  credentials: true, // Add this if your frontend sends credentials
  optionsSuccessStatus: 200 // For legacy browser support
};

// Apply CORS before other middleware
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
    console.log("Received checkout request:", {
      origin: req.get('origin'),
      body: req.body
    });

    const {
      splikId,
      durationDays,
      dailyBudgetCents,
      currency = "USD",
    } = req.body || {};

    if (!splikId || !durationDays || !dailyBudgetCents) {
      console.log("Missing fields:", { splikId, durationDays, dailyBudgetCents });
      return res.status(400).json({ error: "missing_fields" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.log("Stripe not configured");
      return res.status(500).json({ error: "stripe_not_configured" });
    }

    const unitAmount = Number(durationDays) * Number(dailyBudgetCents); // cents
    if (!Number.isFinite(unitAmount) || unitAmount < 50) {
      // Stripe min is $0.50 (50 cents)
      console.log("Amount too small:", unitAmount);
      return res.status(400).json({ error: "amount_too_small" });
    }

    const successBase = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
    if (!successBase) {
      console.log("Missing PUBLIC_SITE_URL");
      return res.status(500).json({ error: "missing_PUBLIC_SITE_URL" });
    }

    console.log("Creating Stripe session...");
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

    console.log("Stripe session created successfully");
    return res.json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    return res.status(500).json({ error: "server_error", message: err.message });
  }
}

/* ─────────────────────────────
   Routes
   (both paths supported for your frontend fallbacks)
────────────────────────────── */
app.post("/api/promotions/checkout", createPromotionCheckout);
app.post("/api/promote/checkout", createPromotionCheckout); // alias

// Add a test endpoint to verify CORS
app.get("/api/test", (req, res) => {
  res.json({ 
    message: "CORS test successful",
    origin: req.get('origin'),
    timestamp: new Date().toISOString()
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
    console.log(
      "CORS allowed origins: (none from env). Set PUBLIC_SITE_URL and/or ALLOWED_ORIGINS."
    );
  }
});
