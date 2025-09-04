import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { paymentIntentId, splikId, boostLevel } = await req.json();
    
    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Verify payment was successful
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== "succeeded") {
      throw new Error("Payment not successful");
    }

    // Create Supabase client with service role for database writes
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Calculate boost duration based on level
    const durations = {
      standard: 7,   // 7 days
      premium: 14,   // 14 days
      max: 30,       // 30 days
    };

    const durationDays = durations[boostLevel] || durations.standard;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    // Create boost record
    const { data: boost, error: boostError } = await supabaseService
      .from("boosted_videos")
      .insert({
        splik_id: splikId,
        user_id: user.id,
        amount: paymentIntent.amount,
        boost_level: boostLevel,
        end_date: endDate.toISOString(),
        stripe_payment_intent_id: paymentIntentId,
        status: "active"
      })
      .select()
      .single();

    if (boostError) {
      console.error("Error creating boost record:", boostError);
      throw boostError;
    }

    // Update boost score on the splik
    const boostScores = {
      standard: 250,
      premium: 500,
      max: 1000,
    };

    await supabaseService
      .from("spliks")
      .update({ 
        boost_score: boostScores[boostLevel] || boostScores.standard 
      })
      .eq("id", splikId);

    console.log("Boost activated successfully:", boost.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        boost,
        message: `Your video is now boosted for ${durationDays} days!`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error confirming boost payment:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});