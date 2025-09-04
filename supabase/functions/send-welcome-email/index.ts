// supabase/functions/send-welcome-email/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

// 👇 Set this in Supabase: PUBLIC_SITE_URL=https://spilkz.onrender.com
const SITE_URL =
  Deno.env.get("PUBLIC_SITE_URL")?.replace(/\/+$/, "") ||
  "https://spilkz.onrender.com";

// 👇 Set this to a verified sender if you’ve added a domain in Resend,
// e.g. RESEND_FROM="Splikz <hello@mail.splikz.com>"
const FROM =
  Deno.env.get("RESEND_FROM") || "Splikz <onboarding@resend.dev>";

// If your “Creator Dashboard” route is different, edit this path only.
const CTA_PATH = "/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type WelcomeEmailRequest = {
  email: string;
  firstName: string;
  lastName: string;
};

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName, lastName } =
      (await req.json()) as WelcomeEmailRequest;

    const ctaUrl = `${SITE_URL}${CTA_PATH}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Welcome to Splikz, ${firstName}! 🎬</h1>
        </div>

        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Hey ${firstName} ${lastName},
          </p>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Thanks for joining Splikz! We're thrilled to have you as part of our creative community.
          </p>

          <ul style="color: #374151; font-size: 16px; line-height: 1.8; margin: 16px 0;">
            <li>📹 Create your first Splik</li>
            <li>🔍 Explore trending content</li>
            <li>👥 Follow your favorite creators</li>
            <li>💬 Engage with the community</li>
          </ul>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${ctaUrl}"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: #fff; padding: 12px 28px; text-decoration: none;
                      border-radius: 8px; display: inline-block; font-weight: 700;">
              Start Creating
            </a>
          </div>

          <p style="color: #6b7280; font-size: 14px;">
            Or copy & paste this link into your browser:<br>
            <a href="${ctaUrl}" style="color:#4f46e5;">${ctaUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            © 2024 Splikz. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const text = `Welcome to Splikz, ${firstName}!

Thanks for joining Splikz. Start creating here:
${ctaUrl}

- Create your first Splik
- Explore trending content
- Follow creators
- Join the community

© 2024 Splikz. All rights reserved.`;

    const emailResponse = await resend.emails.send({
      from: FROM,
      to: [email],
      subject: "Welcome to Splikz! 🎉",
      html,
      text,
      // Helpful for deliverability (optional if you support unsubscribes)
      headers: {
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "List-Unsubscribe": `<${SITE_URL}/unsubscribe>`,
      },
    });

    // Don’t block sign-up if the email provider returns a soft error
    if ((emailResponse as any)?.error) {
      console.error("Resend API error:", (emailResponse as any).error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email could not be sent, but signup was successful",
          details: (emailResponse as any).error,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-welcome-email error:", err);
    // Also don’t block signup on errors
    return new Response(
      JSON.stringify({ success: false, error: "Email service error", details: err?.message }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
