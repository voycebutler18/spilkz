// Supabase Edge Function (Deno)
// Path: supabase/functions/stripe-webhook/index.ts
//
// Sets a Splik to "promoted" after a successful payment.
// Creates a row in `boosts` and updates the related `spliks` record.
//
// ENV REQUIRED (Project Settings → Functions):
//   STRIPE_WEBHOOK_SECRET     e.g. whsec_***
//   STRIPE_SECRET_KEY         e.g. sk_live_***
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Assumes a table `boosts` (we’ll send SQL next if you need it):
//   id uuid pk default gen_random_uuid()
//   splik_id uuid not null
//   user_id uuid not null
//   amount_cents int not null
//   weight int not null
//   duration_days int not null
//   starts_at timestamptz not null
//   ends_at timestamptz not null
//   stripe_session_id text
//   stripe_payment_intent_id text
//   created_at timestamptz default now()
//
// And optional columns on `spliks` (nice-to-have; we can add them next):
//   promoted_until timestamptz
//   boost_weight int default 0
//   is_promoted boolean default false

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // server writes
);

async function json(res: Response, status = 200) {
  return new Response(await res.text(), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!sig || !whSecret) {
    return new Response("Missing webhook signature or secret", { status: 400 });
  }

  let event: Stripe.Event;
  const raw = await req.text();

  try {
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err) {
    console.error("⚠️  Webhook signature verification failed:", err);
    return new Response("Bad signature", { status: 400 });
  }

  // We only care when a Checkout Session is paid
  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Metadata we attached when creating the session
  const splik_id = session.metadata?.splik_id;
  const user_id = session.metadata?.user_id;
  const duration_days = Number(session.metadata?.duration_days ?? 0);
  const weight = Number(session.metadata?.weight ?? 1);

  if (!splik_id || !user_id || !duration_days || !weight) {
    console.error("Missing required metadata:", session.metadata);
    return new Response("Missing metadata", { status: 400 });
  }

  // Amount paid in cents
  const amount_cents =
    typeof session.amount_total === "number" ? session.amount_total : 0;

  const starts_at = new Date();
  const ends_at = new Date(starts_at.getTime() + duration_days * 24 * 60 * 60 * 1000);

  // 1) Record the boost
  const { error: boostErr } = await supabase.from("boosts").insert({
    splik_id,
    user_id,
    amount_cents,
    weight,
    duration_days,
    starts_at: starts_at.toISOString(),
    ends_at: ends_at.toISOString(),
    stripe_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null,
  });

  if (boostErr) {
    console.error("Insert boosts error:", boostErr);
    return new Response("Failed to save boost", { status: 500 });
  }

  // 2) (Optional but recommended) mark the splik as promoted
  // Ignore errors if your columns don't exist yet — we can add them next.
  await supabase
    .from("spliks")
    .update({
      promoted_until: ends_at.toISOString(),
      boost_weight: weight,
      is_promoted: true,
    })
    .eq("id", splik_id);

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
