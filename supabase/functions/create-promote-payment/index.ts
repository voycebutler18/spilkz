// supabase/functions/create-promote-payment/index.ts
// Deno Edge Function – mirrors your boost functions style

// Stripe for Deno (ESM)
import Stripe from "https://esm.sh/stripe@16.15.0?target=deno";

// CORS (same pattern Supabase docs recommend)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

Deno.serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { splikId, durationDays, dailyBudgetCents, currency = "USD" } =
      await req.json();

    if (!splikId || !durationDays || !dailyBudgetCents) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const unitAmount = Number(durationDays) * Number(dailyBudgetCents); // cents
    const site = (Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/$/, "");

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
      success_url: `${site}/dashboard?promo=success&cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: {
        splikId: String(splikId),
        durationDays: String(durationDays),
        dailyBudgetCents: String(dailyBudgetCents),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("create-promote-payment error:", e);
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
