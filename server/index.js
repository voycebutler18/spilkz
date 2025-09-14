import express from "express";
import Stripe from "stripe";
import cors from "cors";

const app = express();
app.use(express.json());

// Allow your app origin (and localhost for dev)
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || "https://spilkz.onrender.com";
app.use(
  cors({
    origin: [ALLOW_ORIGIN, "http://localhost:5173"],
    methods: ["POST", "OPTIONS"],
  })
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const SITE_URL = process.env.PUBLIC_SITE_URL || "https://spilkz.onrender.com";

// Health check (optional)
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// === Create checkout session ===
app.post("/api/promotions/checkout", async (req, res) => {
  try {
    const { splikId, durationDays, dailyBudgetCents, currency = "USD" } = req.body || {};
    if (!splikId || !durationDays || !dailyBudgetCents) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // total = days * daily_budget (in cents). Enforce minimum of $1.00
    const amountTotal = Math.max(100, Number(durationDays) * Number(dailyBudgetCents));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${SITE_URL}/dashboard?promo=success&splik=${encodeURIComponent(splikId)}`,
      cancel_url: `${SITE_URL}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: { splikId, durationDays: String(durationDays) },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: amountTotal, // cents
            product_data: {
              name: "Splik promotion",
              description: `${durationDays} days • $${(dailyBudgetCents / 100).toFixed(2)}/day`,
            },
          },
        },
      ],
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error("checkout error:", e);
    return res.status(500).json({ error: e?.message || "Checkout failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on :${port}`));
