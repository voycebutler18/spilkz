// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@12";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PlanKey = "standard" | "premium" | "max";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  // keep it current for your Stripe account
  apiVersion: "2024-06-20" as any,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function scoreForPlan(plan: PlanKey) {
  switch (plan) {
    case "max":
      return 3;
    case "premium":
      return 2;
    default:
      return 1; // standard
  }
}

serve(async (req) => {
  // Stripe needs the raw body
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("❌ Webhook signature verification failed", err);
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const meta = session.metadata ?? {};
        // these are set when you create the Checkout Session
        const splikId = (meta.splik_id || meta.splikId) as string | undefined;
        const userId = (meta.user_id || meta.userId || session.client_reference_id) as
          | string
          | undefined;
        const planKey = ((meta.plan_key || "standard") as PlanKey);
        const durationDays = parseInt(String(meta.duration_days ?? "7"), 10);

        if (!splikId) {
          console.warn("checkout.session.completed without splik_id metadata");
          break;
        }

        const now = new Date();
        const ends = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

        // 1) Record the boost purchase
        const { error: insErr } = await supabase.from("splik_boosts").insert({
          splik_id: splikId,
          user_id: userId ?? null,
          plan_key: planKey,
          amount: session.amount_total ?? null,
          currency: session.currency ?? "usd",
          stripe_session_id: session.id,
          stripe_payment_intent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent as any)?.id ?? null,
          starts_at: now.toISOString(),
          ends_at: ends.toISOString(),
          status: "active",
        });

        if (insErr) console.error("insert splik_boosts error:", insErr);

        // 2) Mark the video as boosted
        const { error: updErr } = await supabase
          .from("spliks")
          .update({
            is_currently_boosted: true,
            boost_tier: planKey,
            boost_score: scoreForPlan(planKey),
            boost_ends_at: ends.toISOString(),
          })
          .eq("id", splikId);

        if (updErr) console.error("update spliks error:", updErr);

        break;
      }

      // (Optional) If you enabled these events in Stripe, you can tidy up state:
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const meta = session.metadata ?? {};
        const splikId = (meta.splik_id || meta.splikId) as string | undefined;

        if (splikId) {
          // Mark the most recent “pending” boost row as expired (if you create such a state)
          await supabase
            .from("splik_boosts")
            .update({ status: "expired" })
            .eq("stripe_session_id", session.id);
        }
        break;
      }

      default:
        // ignore other events
        break;
    }
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    // Still 200 so Stripe doesn't hammer retries for transient app bugs
    return new Response("ok", { status: 200 });
  }

  return new Response("ok", { status: 200 });
});
