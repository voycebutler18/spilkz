// server/index.js
import express from "express";
import compression from "compression";
import Stripe from "stripe";
import cors from "cors";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const app = express();

// --- CORS (from step #2)
const splitList = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/\/$/, ""));
const allowedFromEnv = [process.env.PUBLIC_SITE_URL, ...splitList(process.env.ALLOWED_ORIGINS)];
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const o = origin.replace(/\/$/, "");
      const ok =
        allowedFromEnv.includes(o) ||
        (() => {
          try {
            const host = new URL(o).hostname;
            return allowedFromEnv.some((a) => {
              try { return new URL(a).hostname === host; } catch { return false; }
            });
          } catch { return false; }
        })() ||
        /http:\/\/localhost:\d+$/i.test(o);
      cb(ok ? null : new Error(`CORS blocked: ${o}`), ok);
    },
    methods: ["GET","POST","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization"],
  })
);

app.use(compression());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/promotions/checkout", async (req, res) => {
  try {
    const { splikId, durationDays, dailyBudgetCents, currency = "USD" } = req.body || {};
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
              description: `${durationDays} day(s) × ${(dailyBudgetCents / 100).toFixed(2)} per day`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${successBase}/dashboard?promo=success&cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successBase}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: { splikId: String(splikId), durationDays: String(durationDays), dailyBudgetCents: String(dailyBudgetCents) },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Promote API on :${port}`));
