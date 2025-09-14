import express from "express";
import compression from "compression";
import Stripe from "stripe";

/* ENV on Render:
 *  - STRIPE_SECRET_KEY = sk_test_... or sk_live_...
 *  - PUBLIC_SITE_URL   = https://splikz.onrender.com
 */
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || "https://splikz.onrender.com").replace(/\/$/, "");

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

const app = express();
app.set("trust proxy", 1);
app.use(compression());

// quick probes
app.get("/", (_req, res) => res.send("OK: promote API"));
app.get("/health", (_req, res) => res.json({ ok: true }));

async function createCheckout(req, res) {
  try {
    const splikId = String(req.query.splikId || "");
    const userId = String(req.query.userId || "");
    const days = Number(req.query.days || 0);
    const dailyBudgetCents = Math.round(Number(req.query.dailyBudgetCents || 0));
    const currency = String(req.query.currency || "USD").toLowerCase();

    if (!days || !dailyBudgetCents) return res.status(400).send("Missing fields");
    if (days < 1 || days > 30) return res.status(400).send("Invalid days");

    const daily = Math.max(50, Math.min(50000, dailyBudgetCents)); // 50¢..$500/day
    const totalCents = Math.round(days * daily);
    if (!Number.isFinite(totalCents) || totalCents < 50) return res.status(400).send("Invalid amount");

    // back button (Stripe cancel)
    const referer = req.get("referer");
    const cancel_url = referer && /^https?:\/\//i.test(referer) ? referer : `${PUBLIC_SITE_URL}/`;
    // success → home
    const success_url = `${PUBLIC_SITE_URL}/`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: splikId ? `Promotion for Splik #${splikId}` : "Promotion",
            description: `${days} day(s) × ${(daily / 100).toFixed(2)} per day`,
          },
          unit_amount: totalCents,
        },
        quantity: 1,
      }],
      cancel_url,
      success_url,
      client_reference_id: splikId || undefined,
      metadata: {
        splikId,
        userId,
        durationDays: String(days),
        dailyBudgetCents: String(daily),
        totalCents: String(totalCents),
      },
    });

    return res.redirect(303, session.url);
  } catch (err) {
    console.error("checkout error:", err);
    return res.status(500).send("Server error");
  }
}

// ALL supported paths:
app.get("/pay/checkout", createCheckout);
app.get("/api/promotions/checkout", createCheckout);
app.get("/api/promote/checkout", createCheckout);

// explicit 404
app.use((_req, res) => res.status(404).send("Not Found"));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Listening on :${port}`));
