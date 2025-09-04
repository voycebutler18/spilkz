import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check if this is a password recovery flow
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type');
        
        // Get the session from the URL hash
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Auth callback error:", error);
          navigate("/login");
          return;
        }

        if (session) {
          // Check if this is a password recovery
          if (type === 'recovery') {
            navigate("/reset-password");
            return;
          }
          
          // Check if email is verified
          if (session.user.email_confirmed_at) {
            // User is authenticated and verified, redirect to dashboard
            navigate("/dashboard");
          } else {
            // Email not verified yet
            navigate("/login");
          }
        } else {
          // No session, redirect to login
          navigate("/login");
        }
      } catch (error) {
        console.error("Auth callback error:", error);
        navigate("/login");
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Authenticating...</p>
      </div>
    </div>
  );
};

export default AuthCallback;