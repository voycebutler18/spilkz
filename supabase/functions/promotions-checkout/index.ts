// Creates a Stripe Checkout Session and 303-redirects the browser to Stripe.
// Call with a plain GET like:
//   https://YOUR-PROJECT-ref.supabase.co/functions/v1/promotions-checkout
//     ?splikId=abc123&userId=...&days=7&dailyBudgetCents=50&currency=USD
//
// Env (set in Supabase project settings):
//   STRIPE_SECRET_KEY = sk_test_... (or live)
//   PUBLIC_SITE_URL   = https://splikz.onrender.com

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.15.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const PUBLIC_SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://splikz.onrender.com").replace(/\/$/, "");
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const splikId = String(url.searchParams.get("splikId") ?? "");
    const userId = String(url.searchParams.get("userId") ?? "");
    const days = Number(url.searchParams.get("days") ?? "0");
    const dailyBudgetCents = Math.round(Number(url.searchParams.get("dailyBudgetCents") ?? "0"));
    const currency = String(url.searchParams.get("currency") ?? "USD").toLowerCase();

    if (!days || !dailyBudgetCents) {
      return new Response("Missing fields", { status: 400, headers: corsHeaders });
    }
    if (days < 1 || days > 30) {
      return new Response("Invalid days", { status: 400, headers: corsHeaders });
    }

    // clamp to 50¢ .. $500 per day
    const daily = Math.max(50, Math.min(50000, dailyBudgetCents));
    const totalCents = Math.round(days * daily);
    if (!Number.isFinite(totalCents) || totalCents < 50) {
      return new Response("Invalid amount", { status: 400, headers: corsHeaders });
    }

    // Stripe "Cancel and return" goes to the Referer if present, else home.
    const referer = req.headers.get("referer");
    const cancel_url = referer && /^https?:\/\//i.test(referer) ? referer : `${PUBLIC_SITE_URL}/`;
    // After success, send them home.
    const success_url = `${PUBLIC_SITE_URL}/`;

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

    // 303 → Stripe Checkout (no pretty page, straight there)
    return new Response(null, {
      status: 303,
      headers: { ...corsHeaders, Location: session.url! },
    });
  } catch (err) {
    console.error("promotions-checkout error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
});
