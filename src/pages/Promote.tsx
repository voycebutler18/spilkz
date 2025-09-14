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
      };

      console.log("Starting checkout with payload:", payload);

      // Get API base URL from environment, with fallbacks for different setups
      const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
      const supaUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
      
      // Prioritized list of endpoints to try
      const endpoints = [
        // 1. Direct API URL from environment (highest priority)
        import.meta.env.VITE_PROMOTE_CHECKOUT_URL as string | undefined,
        // 2. API base + standard path
        apiBase ? `${apiBase}/api/promotions/checkout` : undefined,
        // 3. Common API naming patterns for Render deployments
        "https://spilkz-promote-api.onrender.com/api/promotions/checkout",
        "https://spilkz-api.onrender.com/api/promotions/checkout", 
        "https://splikz-promote-api.onrender.com/api/promotions/checkout",
        "https://splikz-api.onrender.com/api/promotions/checkout",
        // 4. Relative paths (for same-domain deployments)
        "/api/promotions/checkout",
        "/api/promote/checkout",
        // 5. Supabase Edge Functions (as fallback)
        supaUrl ? `${supaUrl}/functions/v1/promotions/checkout` : undefined,
      ].filter(Boolean) as string[];

      console.log("Will try these endpoints in order:", endpoints);

      const tryEndpoint = async (url: string) => {
        console.log(`Trying endpoint: ${url}`);
        
        const res = await fetch(url, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            // Add CORS headers for debugging
            "Accept": "application/json",
          },
          body: JSON.stringify(payload),
          // Don't include credentials unless needed
          credentials: 'omit'
        });

        console.log(`Response from ${url}:`, {
          status: res.status,
          statusText: res.statusText,
          headers: Object.fromEntries(res.headers.entries())
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          console.error(`Error from ${url}:`, errorText);
          throw new Error(`HTTP ${res.status}: ${errorText.slice(0, 100) || res.statusText}`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const responseData = await res.json();
          console.log(`JSON response from ${url}:`, responseData);
          
          // Look for checkout URL in response
          const checkoutUrl = responseData.url || responseData.checkout_url || responseData.paymentUrl;
          if (checkoutUrl && /^https?:\/\//i.test(checkoutUrl)) {
            console.log("Found checkout URL, redirecting to:", checkoutUrl);
            window.location.href = checkoutUrl;
            return true;
          }
          
          // Handle embedded checkout (client_secret)
          if (responseData.client_secret) {
            console.log("Got client_secret for embedded checkout");
            // Navigate to your Pay.tsx page with the client secret
            const params = new URLSearchParams({
              cs: responseData.client_secret,
              amt: String(Math.round(dailyBudget * durationDays * 100)),
              cur: "USD",
              splik: splikId
            });
            navigate(`/pay?${params.toString()}`);
            return true;
          }
          
          throw new Error("Response missing checkout URL or client_secret");
        } else {
          // Handle plain text URL response
          const text = await res.text();
          console.log(`Text response from ${url}:`, text);
          
          if (/^https?:\/\//i.test(text.trim())) {
            console.log("Found URL in text response, redirecting to:", text.trim());
            window.location.href = text.trim();
            return true;
          }
          
          throw new Error(`Unexpected response format: ${contentType || 'unknown'}`);
        }
      };

      // Try each endpoint until one succeeds
      let success = false;
      let lastError: Error | null = null;
      
      for (const endpoint of endpoints) {
        try {
          success = await tryEndpoint(endpoint);
          if (success) {
            console.log("Checkout successful with endpoint:", endpoint);
            break;
          }
        } catch (error) {
          console.warn(`Endpoint ${endpoint} failed:`, error);
          lastError = error as Error;
          
          // Special handling for CORS errors
          if (error instanceof Error && error.message.includes('CORS')) {
            console.error("CORS error detected. Check your API CORS configuration.");
          }
        }
      }

      if (!success) {
        throw lastError || new Error("All checkout endpoints failed");
      }

    } catch (error: any) {
      console.error("Checkout failed:", error);
      
      // Provide user-friendly error messages
      let errorMessage = "We couldn't start checkout. Please try again.";
      
      if (error.message?.includes("Failed to fetch") || error.message?.includes("CORS")) {
        errorMessage = "Could not reach the payment server. Please check your internet connection and try again.";
      } else if (error.message?.includes("HTTP 404")) {
        errorMessage = "Payment service not found. Please contact support.";
      } else if (error.message?.includes("HTTP 500")) {
        errorMessage = "Payment server error. Please try again in a moment.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive",
      });
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
                  Choose your duration and daily budget. Pay securely; we'll handle delivery.
                </DialogDescription>
              </div>
            </div>

            <Button variant="ghost" className="h-9 w-9 rounded-full" onClick={onClose} aria-label="Close">
              <XIcon className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* Preview */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
            <div className="relative w-20 h-14 overflow-hidden rounded-lg bg-black/30 flex-shrink-0">
              {splik?.thumbnail_url ? (
                <img src={splik.thumbnail_url} alt={splik.title ?? "Post"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-white/50 text-xs">No preview</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-white font-semibold truncate">{splik?.title || "Untitled post"}</div>
              <div className="text-white/70 text-xs line-clamp-2">{splik?.description || "—"}</div>
            </div>
            <Badge className="ml-auto bg-purple-600 text-white">Splik #{splikId}</Badge>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <CalendarClock className="h-4 w-4 text-purple-300" />
                <Label className="text-white">Duration</Label>
              </div>
              <Select value={durationKey} onValueChange={setDurationKey}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-white/20 text-white">
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.key} value={d.key} className="text-white hover:bg-white/10">
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-white/70">
                Starts immediately and runs for <strong className="text-white">{durationDays}</strong> day{durationDays > 1 ? "s" : ""}.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <DollarSign className="h-4 w-4 text-green-300" />
                <Label className="text-white">Daily budget</Label>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  value={[dailyBudget]}
                  min={1}
                  max={50}
                  step={1}
                  onValueChange={(v) => setDailyBudget(v[0] ?? 5)}
                  className="flex-1"
                />
                <div className="w-24">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={dailyBudget}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(50, Number(e.target.value || 0)));
                      setDailyBudget(n);
                    }}
                    className="bg-white/10 border-white/20 text-white"
                  />
                </div>
              </div>
              <p className="text-xs text-white/70">
                We optimize for real people. Increase this for more reach each day.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-purple-500/10 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-white">
                  <TrendingUp className="h-4 w-4 text-yellow-300" />
                  <span className="font-semibold">Estimated reach</span>
                </div>
                <div className="text-white text-2xl font-bold mt-1">{reach.toLocaleString()}</div>
                <div className="text-white/70 text-xs">Approximate impressions across your target audience.</div>
              </div>

              <div className="h-px sm:h-20 sm:w-px sm:bg-white/10" />

              <div className="flex-1">
                <div className="flex items-center gap-2 text-white">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  <span className="font-semibold">Total</span>
                </div>
                <div className="text-white text-2xl font-bold mt-1">{fmtUSD(total)}</div>
                <div className="text-white/70 text-xs">
                  {fmtUSD(dailyBudget)} / day × {durationDays} day{durationDays > 1 ? "s" : ""}.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-white/10 bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs sm:text-sm text-white/70">You'll review and pay securely on the next screen.</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="rounded-xl" disabled={checkingOut}>
              Cancel
            </Button>
            <Button
              onClick={handleCheckout}
              className="rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 text-white hover:from-purple-700 hover:via-pink-700 hover:to-red-700"
              disabled={checkingOut}
            >
              {checkingOut ? "Redirecting…" : "Continue to payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
