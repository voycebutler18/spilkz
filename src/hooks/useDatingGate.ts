import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type GateOpts = {
  /** If true, immediately send users with a profile to /dating/discover */
  redirectIfReady?: boolean;
  /** If true, allow being on /dating/onboarding even if the user is ready */
  allowOnboarding?: boolean;
  /** If true, bounce users without a profile to onboarding */
  requireProfile?: boolean;
};

type Status = "checking" | "needs-auth" | "needs-onboarding" | "ready";

export function useDatingGate(opts: GateOpts = {}) {
  const nav = useNavigate();
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;

      if (!user) {
        setStatus("needs-auth");
        return;
      }

      // is there a dating profile?
      const { data, error } = await supabase
        .from("dating_profiles")
        .select("user_id,is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!alive) return;

      const hasProfile = !!data && !error;

      if (hasProfile) {
        setStatus("ready");
        if (opts.redirectIfReady && !opts.allowOnboarding) {
          nav("/dating/discover", { replace: true });
        }
      } else {
        setStatus("needs-onboarding");
        if (opts.requireProfile) {
          nav("/dating/onboarding", { replace: true });
        }
      }
    })();

    // keep status fresh across auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setStatus("checking");
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [nav, opts.redirectIfReady, opts.allowOnboarding, opts.requireProfile]);

  return { status };
}
