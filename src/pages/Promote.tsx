// src/pages/Promote.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  CalendarClock,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  X as XIcon,
} from "lucide-react";

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

type SplikRow = {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  description: string | null;
  created_at: string;
  user_id: string;
};

const DURATIONS = [
  { key: "3", days: 3, label: "3 days" },
  { key: "7", days: 7, label: "7 days" },
  { key: "14", days: 14, label: "14 days" },
  { key: "30", days: 30, label: "30 days" },
] as const;

const estReach = (days: number, dailyBudget: number) => Math.round(days * dailyBudget * 600);

export default function Promote() {
  const { splikId = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [splik, setSplik] = useState<SplikRow | null>(null);

  // ✨ NEW: capture the signed-in user id
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const [durationKey, setDurationKey] = useState<string>("7");
  const durationDays = useMemo(
    () => DURATIONS.find((d) => d.key === durationKey)?.days ?? 7,
    [durationKey]
  );

  const [dailyBudget, setDailyBudget] = useState<number>(5);
  const total = useMemo(() => Number((durationDays * dailyBudget).toFixed(2)), [durationDays, dailyBudget]);
  const reach = useMemo(() => estReach(durationDays, dailyBudget), [durationDays, dailyBudget]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("spliks")
          .select("id,title,thumbnail_url,description,created_at,user_id")
          .eq("id", splikId)
          .maybeSingle();
        if (error) throw error;
        if (isMounted) setSplik((data as any) ?? null);
      } catch (e: any) {
        toast({
          title: "Couldn't load your post",
          description: e.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [splikId, toast]);

  const handleCheckout = async () => {
    if (checkingOut) return;
    setCheckingOut(true);

    try {
      const payload = {
        splikId,
        durationDays,
        dailyBudgetCents: Math.round(dailyBudget * 100),
        currency: "USD",
        // ✨ NEW: pass who is paying
        userId, // may be null if not signed in
      };

      console.log("Starting checkout with payload:", payload);

      const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
      const supaUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");

      const endpoints = [
        import.meta.env.VITE_PROMOTE_CHECKOUT_URL as string | undefined,
        apiBase ? `${apiBase}/api/promotions/checkout` : undefined,
        "https://spilkz-promote-api.onrender.com/api/promotions/checkout",
        "https://spilkz-api.onrender.com/api/promotions/checkout",
        "https://splikz-promote-api.onrender.com/api/promotions/checkout",
        "https://splikz-api.onrender.com/api/promotions/checkout",
        "/api/promotions/checkout",
        "/api/promote/checkout",
        supaUrl ? `${supaUrl}/functions/v1/promotions/checkout` : undefined,
      ].filter(Boolean) as string[];

      const tryEndpoint = async (url: string) => {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          credentials: "omit",
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${errorText.slice(0, 100) || res.statusText}`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const j = await res.json();
          const checkoutUrl = j.url || j.checkout_url || j.paymentUrl;
          if (checkoutUrl && /^https?:\/\//i.test(checkoutUrl)) {
            window.location.href = checkoutUrl;
            return true;
          }
          if (j.client_secret) {
            const params = new URLSearchParams({
              cs: j.client_secret,
              amt: String(Math.round(dailyBudget * durationDays * 100)),
              cur: "USD",
              splik: splikId,
            });
            navigate(`/pay?${params.toString()}`);
            return true;
          }
          throw new Error("Response missing checkout URL or client_secret");
        } else {
          const text = (await res.text()).trim();
          if (/^https?:\/\//i.test(text)) {
            window.location.href = text;
            return true;
          }
          throw new Error(`Unexpected response format: ${contentType || "unknown"}`);
        }
      };

      let success = false;
      let lastError: Error | null = null;
      for (const ep of endpoints) {
        try {
          success = await tryEndpoint(ep);
          if (success) break;
        } catch (e) {
          lastError = e as Error;
        }
      }
      if (!success) throw lastError || new Error("All checkout endpoints failed");
    } catch (error: any) {
      let errorMessage = "We couldn't start checkout. Please try again.";
      if (error.message?.includes("Failed to fetch") || error.message?.includes("CORS")) {
        errorMessage =
          "Could not reach the payment server. Please check your API URL (VITE_PROMOTE_CHECKOUT_URL) and CORS.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: "Payment Error", description: errorMessage, variant: "destructive" });
    } finally {
      setCheckingOut(false);
    }
  };

  const onClose = () => {
    setOpen(false);
    setTimeout(() => navigate(-1), 120);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : onClose())}>
      <DialogContent
        className="
          max-w-3xl w-[min(96vw,850px)]
          max-h-[90vh] p-0 overflow-hidden rounded-2xl
          bg-slate-900/95 backdrop-blur-2xl border border-white/15 shadow-2xl
          flex flex-col
        "
      >
        {/* Header */}
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 border-b border-white/10 bg-slate-900/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-400 to-pink-500 blur-md opacity-60" />
                <div className="relative rounded-2xl p-2 bg-gradient-to-r from-purple-500 to-pink-500">
                  <Rocket className="h-5 w-5 text-white" />
                </div>
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-bold text-white">Promote your post</DialogTitle>
                <DialogDescription className="text-gray-300">
                  Choose your duration and daily budget. We'll handle delivery after payment.
                </DialogDescription>
              </div>
            </div>

            <Button variant="ghost" className="h-9 w-9 rounded-full" onClick={onClose} aria-label="Close">
              <XIcon className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Body */}
        {/* (…unchanged UI… keep all your content here) */}

        {/* Footer */}
        {/* (…unchanged footer… keep your existing buttons) */}
      </DialogContent>
    </Dialog>
  );
}
