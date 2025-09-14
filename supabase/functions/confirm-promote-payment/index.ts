// supabase/functions/confirm-promote-payment/index.ts
// Confirms a Stripe Checkout Session and activates a promotion.
// Mirrors your boost-confirm pattern.

import Stripe from "https://esm.sh/stripe@16.15.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS for browser calls
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Env
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
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

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as any));

    // accept either body.sessionId or ?session_id=...
    const sessionId =
      body.sessionId || body.session_id || url.searchParams.get("session_id");

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "missing_session_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 1) Retrieve the session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // 2) Check payment status
    const paid =
      session.status === "complete" && session.payment_status === "paid";

    if (!paid) {
      // Not paid yet (or canceled). Return the session status for UI.
      return new Response(
        JSON.stringify({
          ok: false,
          status: session.status,
          payment_status: session.payment_status,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 3) Read metadata we set in the create step
    const splikId = session.metadata?.splikId || null;
    const durationDays = Number(session.metadata?.durationDays || 0);
    const dailyBudgetCents = Number(session.metadata?.dailyBudgetCents || 0);
    const userId = session.metadata?.userId || null; // include this in create if you want it

    const now = new Date();
    const ends = new Date(now.getTime() + (durationDays || 7) * 86400000);

    // 4) Idempotent upsert by checkout_session_id into your promotions table
    //    Adjust table/column names if yours differ.
    const { data: existing } = await supabase
      .from("promotions")
      .select("id,status")
      .eq("checkout_session_id", session.id)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabase.from("promotions").insert({
        splik_id: splikId,
        user_id: userId,
        checkout_session_id: session.id,
        duration_days: durationDays,
        daily_budget_cents: dailyBudgetCents,
        amount_total_cents: session.amount_total ?? null,
        currency: session.currency ?? "usd",
        status: "active",
        starts_at: now.toISOString(),
        ends_at: ends.toISOString(),
      });
      if (insErr) throw insErr;
    } else {
      const { error: updErr } = await supabase
        .from("promotions")
        .update({ status: "active" })
        .eq("checkout_session_id", session.id);
      if (updErr) throw updErr;
    }

    return new Response(JSON.stringify({ ok: true, sessionId: session.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("confirm-promote-payment error:", e);
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
