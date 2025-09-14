import express from "express";
import compression from "compression";
import Stripe from "stripe";

/** ─── ENV ─────────────────────────────────────────────────────────────
 * Set on Render:
 *  - STRIPE_SECRET_KEY = sk_live_or_test_...
 *  - PUBLIC_SITE_URL   = https://splikz.onrender.com
 */
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || "https://splikz.onrender.com").replace(/\/$/, "");

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

const app = express();
app.set("trust proxy", 1);
app.use(compression());

/** Health check */
app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * GET /pay/checkout
 * Query params:
 *   splikId             (string, optional but nice to have)
 *   userId              (string, optional)
 *   days                (int, required: 1..30)
 *   dailyBudgetCents    (int, required: 50..50000)  // 50¢ .. $500.00
 *   currency            (string, default: USD)
 *
 * Behavior: creates a Stripe Checkout Session and 303 redirects to it.
 * Cancel/back goes to the page the user came from (Referer) or home as fallback.
 * Success goes to your HOME PAGE.
 */
app.get("/pay/checkout", async (req, res) => {
  try {
    const splikId = String(req.query.splikId || "");
    const userId = String(req.query.userId || "");
    const days = Number(req.query.days || 0);
    const dailyBudgetCents = Math.round(Number(req.query.dailyBudgetCents || 0));
    const currency = String(req.query.currency || "USD").toLowerCase();

    if (!days || !dailyBudgetCents) {
      return res.status(400).send("Missing fields");
    }
    if (days < 1 || days > 30) return res.status(400).send("Invalid days");
    const daily = Math.max(50, Math.min(50000, dailyBudgetCents)); // clamp 50¢..$500
    const totalCents = Math.round(days * daily);
    if (!Number.isFinite(totalCents) || totalCents < 50) {
      return res.status(400).send("Invalid amount");
    }

    // Where Stripe's “Cancel and return” goes:
    const referer = req.get("referer");
    const cancelUrl =
      (referer && referer.startsWith("http")) ? referer : `${PUBLIC_SITE_URL}/`;

    // Where Stripe sends them after successful payment:
    const successUrl = `${PUBLIC_SITE_URL}/`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: splikId ? `Promotion for Splik #${splikId}` : "Promotion",
              description: `${days} day(s) × ${(daily / 100).toFixed(2)} per day`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      cancel_url: cancelUrl,
      success_url: successUrl,
      client_reference_id: splikId || undefined,
      metadata: {
        splikId,
        userId,
        durationDays: String(days),
        dailyBudgetCents: String(daily),
        totalCents: String(totalCents),
      },
    });

    // send the browser straight to Stripe
    return res.redirect(303, session.url);
  } catch (err) {
    console.error("checkout error:", err);
    return res.status(500).send("Server error");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Listening on :${port}`);
});
