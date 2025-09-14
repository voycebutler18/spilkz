import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function PromoteConfirm() {
  const [search] = useSearchParams();
  const sessionId = search.get("cs") || search.get("session_id") || "";
  const navigate = useNavigate();
  const { toast } = useToast();
  const [working, setWorking] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!sessionId) {
        toast({ title: "Missing session", description: "No session id provided.", variant: "destructive" });
        navigate("/dashboard");
        return;
      }
      try {
        // Prefer explicit URL if set, else relative
        const url =
          (import.meta.env.VITE_API_BASE_URL
            ? `${import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")}/api/promotions/confirm`
            : "/api/promotions/confirm");
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }

        toast({ title: "Promotion started!", description: "Your promotion is now running." });
      } catch (e: any) {
        toast({
          title: "Confirmation failed",
          description: e?.message || "We couldn't confirm your payment.",
          variant: "destructive",
        });
      } finally {
        setWorking(false);
        setTimeout(() => navigate("/dashboard"), 800);
      }
    };
    run();
  }, [navigate, sessionId, toast]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
      <h1 className="text-xl font-semibold mb-1">Finalizing your promotion…</h1>
      <p className="text-muted-foreground mb-6">Hang tight while we confirm your payment.</p>
      {!working && (
        <Button onClick={() => navigate("/dashboard")}>
          Go to dashboard
        </Button>
      )}
    </div>
  );
}
