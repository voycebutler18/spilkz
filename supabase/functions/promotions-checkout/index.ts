// supabase/functions/promotions-checkout/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@14.26.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS, status: 204 });
  if (req.method !== "GET") return new Response("Use GET", { status: 405, headers: CORS });

  try {
    const url = new URL(req.url);
    const splikId = url.searchParams.get("splikId") ?? "";
    const userId = url.searchParams.get("userId") ?? "";
    const days = Number(url.searchParams.get("days") ?? "0");
    const dailyBudgetCents = Math.round(Number(url.searchParams.get("dailyBudgetCents") ?? "0"));
    const currency = (url.searchParams.get("currency") ?? "USD").toLowerCase();

    if (!splikId || !days || !dailyBudgetCents) {
      return new Response("Missing fields", { status: 400, headers: CORS });
    }

    const clamp = (c: number) => Math.max(50, Math.min(50000, c)); // 50¢..$500/day
    const dailyC = clamp(dailyBudgetCents);
    const totalCents = Math.round(days * dailyC);
    if (!Number.isFinite(totalCents) || totalCents < 50) {
      return new Response("Invalid amount", { status: 400, headers: CORS });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const site = (Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/$/, "");
    const funcsBase = `${new URL(req.url).origin}/functions/v1`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency,
          product_data: { name: `Promotion for Splik #${splikId}`, description: `${days} day(s) × ${(dailyC/100).toFixed(2)} per day` },
          unit_amount: totalCents,
        },
        quantity: 1,
      }],
      // after pay, we send them back to your site (skip DB for now to keep it simple)
      success_url: `${site}/promote/success?s=${encodeURIComponent(splikId)}&cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/promote/${encodeURIComponent(splikId)}?canceled=1`,
      metadata: {
        splikId, userId,
        durationDays: String(days),
        dailyBudgetCents: String(dailyC),
        totalCents: String(totalCents),
      },
    });

    return new Response(null, { status: 303, headers: { Location: session.url!, ...CORS } });
  } catch (e) {
    console.error(e);
    return new Response("Server error", { status: 500, headers: CORS });
  }
});
