import express from "express";
import cors from "cors";
import compression from "compression";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const app = express();

// CORS: allow your site + local dev
const ALLOWED_ORIGINS = [
  process.env.PUBLIC_SITE_URL,               // e.g. https://spilkz.onrender.com
  /http:\/\/localhost:\d+$/,                 // dev
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const ok = ALLOWED_ORIGINS.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin
      );
      cb(ok ? null : new Error("Not allowed by CORS"), ok);
    },
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(compression());
app.use(express.json());

// Healthcheck
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Create Checkout session
app.post("/api/promotions/checkout", async (req, res) => {
  try {
    const { splikId, durationDays, dailyBudgetCents, currency = "USD" } =
      req.body || {};

    if (!splikId || !durationDays || !dailyBudgetCents)
      return res.status(400).json({ error: "missing_fields" });

    const unitAmount = Number(durationDays) * Number(dailyBudgetCents); // cents

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
              description: `${durationDays} day(s) × ${(
                dailyBudgetCents / 100
              ).toFixed(2)} per day`,
            },
            unit_amount: unitAmount,
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
});

// (Optional) Stripe webhook for fulfillment — keep body RAW:
// app.post("/api/promotions/webhook", express.raw({ type: "application/json" }), (req, res) => { ... })

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Promote API listening on :${port}`);
});
