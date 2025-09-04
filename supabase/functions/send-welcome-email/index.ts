import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  firstName: string;
  lastName: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName, lastName }: WelcomeEmailRequest = await req.json();

    console.log("Sending welcome email to:", email);

    // For development/testing: Use a fallback email if domain not verified
    // Change this to your verified domain email once configured
    const fromEmail = "Splikz <onboarding@resend.dev>";
    
    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "Welcome to Splikz! 🎉",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">Welcome to Splikz, ${firstName}! 🎬</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Hey ${firstName} ${lastName},
            </p>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Thank you for joining Splikz! We're thrilled to have you as part of our creative community.
            </p>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Get started by:
            </p>
            
            <ul style="color: #374151; font-size: 16px; line-height: 1.8;">
              <li>📹 Creating your first Splik</li>
              <li>🔍 Exploring trending content</li>
              <li>👥 Following your favorite creators</li>
              <li>💬 Engaging with the community</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://izeheflwfguwinizihmx.supabase.co/dashboard" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 12px 30px; 
                        text-decoration: none; 
                        border-radius: 5px; 
                        display: inline-block;
                        font-weight: bold;">
                Start Creating
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              If you have any questions, feel free to reach out to our support team. We're here to help!
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              © 2024 Splikz. All rights reserved.<br>
              You're receiving this email because you signed up for Splikz.
            </p>
          </div>
        </div>
      `,
    });

    if (emailResponse.error) {
      console.error("Resend API error:", emailResponse.error);
      // Log the error but don't fail the signup process
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Email could not be sent, but signup was successful",
          details: emailResponse.error
        }), 
        {
          status: 200, // Return 200 to not block signup
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-welcome-email function:", error);
    // Don't fail the signup process due to email errors
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Email service error", 
        details: error.message 
      }),
      {
        status: 200, // Return 200 to not block signup
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);