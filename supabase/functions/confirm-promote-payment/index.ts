// Confirms a paid Stripe Checkout Session and (optionally) writes a promotion row.
// Call from your success page or a server job with { sessionId } in the JSON body.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.15.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE") ?? "";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId) return new Response(JSON.stringify({ error: "missing_session" }), { status: 400, headers: corsHeaders });

    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (!s || s.payment_status !== "paid") {
      return new Response(JSON.stringify({ error: "not_paid" }), { status: 400, headers: corsHeaders });
    }

    const md = s.metadata ?? {};
    const splikId = md.splikId ?? "";
    const userId = md.userId || null;
    const durationDays = Number(md.durationDays || "0");
    const dailyBudgetCents = Number(md.dailyBudgetCents || "0");
    const totalCents = Number(md.totalCents || "0");

    if (!splikId || !durationDays || !dailyBudgetCents || !totalCents) {
      return new Response(JSON.stringify({ error: "invalid_metadata" }), { status: 400, headers: corsHeaders });
    }

    const now = new Date();
    const end = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Insert promotion row (adjust table/columns to your schema)
    const { error } = await supa.from("promotions").insert({
      splik_id: splikId,
      user_id: userId,
      daily_budget_cents: dailyBudgetCents,
      duration_days: durationDays,
      total_cents: totalCents,
      start_at: now.toISOString(),
      end_at: end.toISOString(),
      status: "active",
      checkout_session_id: sessionId,
    });

    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      console.error("DB insert failed:", error);
      return new Response(JSON.stringify({ error: "db_insert_failed" }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, sessionId }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("confirm-promote-payment error:", e);
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: corsHeaders });
  }
});
