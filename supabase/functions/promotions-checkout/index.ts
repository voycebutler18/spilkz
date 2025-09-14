import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@14.26.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 204 });
  }
  if (req.method !== "GET") {
    return new Response("Use GET", { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    const splikId = url.searchParams.get("splikId") ?? "";
    const userId = url.searchParams.get("userId") ?? "";
    const days = Number(url.searchParams.get("days") ?? "0");
    const dailyBudgetCents = Math.round(Number(url.searchParams.get("dailyBudgetCents") ?? "0"));
    const currency = (url.searchParams.get("currency") ?? "USD").toLowerCase();

    if (!splikId || !days || !dailyBudgetCents) {
      return new Response("Missing fields", { status: 400, headers: corsHeaders });
    }
    const clamp = (c: number) => Math.max(50, Math.min(50000, c)); // 50¢..$500/day
    const dailyC = clamp(dailyBudgetCents);
    const totalCents = Math.round(days * dailyC);
    if (!Number.isFinite(totalCents) || totalCents < 50) {
      return new Response("Invalid amount", { status: 400, headers: corsHeaders });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const site = (Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/$/, "");
    const funcsBase = `${new URL(req.url).origin}/functions/v1`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `Promotion for Splik #${splikId}`,
              description: `${days} day(s) × ${(dailyC / 100).toFixed(2)} per day`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      // return to another Edge Function that will write to DB, then send user to your site
      success_url: `${funcsBase}/promotions-success?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: {
        splikId,
        userId,
        durationDays: String(days),
        dailyBudgetCents: String(dailyC),
        totalCents: String(totalCents),
      },
    });

    return new Response(null, {
      status: 303,
      headers: { Location: session.url!, ...corsHeaders },
    });
  } catch (e) {
    console.error("checkout error:", e);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
});
