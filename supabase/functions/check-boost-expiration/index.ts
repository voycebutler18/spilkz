import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    // Create Supabase client with service role for database operations
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    console.log("Starting boost expiration check...");

    // Expire old boosts
    const { error: expireError } = await supabaseService.rpc('expire_old_boosts');
    
    if (expireError) {
      console.error("Error expiring old boosts:", expireError);
      throw expireError;
    }

    // Update boost flags
    const { error: flagError } = await supabaseService.rpc('update_boost_flags');
    
    if (flagError) {
      console.error("Error updating boost flags:", flagError);
      throw flagError;
    }

    console.log("Boost expiration check completed successfully");

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Boost expiration check completed"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in check-boost-expiration:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});