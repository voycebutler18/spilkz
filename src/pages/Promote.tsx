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

/** Small helpers */
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
  { key: "3",  days: 3,  label: "3 days"  },
  { key: "7",  days: 7,  label: "7 days"  },
  { key: "14", days: 14, label: "14 days" },
  { key: "30", days: 30, label: "30 days" },
] as const;

// Simple reach model: ~600 impressions per $1 per day (tune on server)
const estReach = (days: number, dailyBudget: number) =>
  Math.round(days * dailyBudget * 600);

export default function Promote() {
  const { splikId = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [splik, setSplik] = useState<SplikRow | null>(null);

  // Controls
  const [durationKey, setDurationKey] = useState<string>("7");
  const durationDays = useMemo(
    () => DURATIONS.find((d) => d.key === durationKey)?.days ?? 7,
    [durationKey]
  );

  // $1 – $50 per day (slider + input stay in sync)
  const [dailyBudget, setDailyBudget] = useState<number>(5);

  const total = useMemo(() => Number((durationDays * dailyBudget).toFixed(2)), [durationDays, dailyBudget]);
  const reach = useMemo(() => estReach(durationDays, dailyBudget), [durationDays, dailyBudget]);

  /** Load a tiny preview for context */
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
        toast({ title: "Couldn’t load your post", description: e.message || "Please try again.", variant: "destructive" });
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [splikId, toast]);

  /** Robust checkout that accepts JSON OR plain text URL and tries multiple endpoints */
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

      // Candidate endpoints in priority order
      const supaUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
      const endpoints = [
        import.meta.env.VITE_PROMOTE_CHECKOUT_URL as string | undefined,                // optional override
        "/api/promotions/checkout",
        "/api/promote/checkout",
        supaUrl ? `${supaUrl}/functions/v1/promotions/checkout` : undefined,           // Supabase Edge Function (if you deploy it)
      ].filter(Boolean) as string[];

      const tryOnce = async (url: string) => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          // Read a little of the body for debugging
          const peek = (await res.text().catch(() => "")).slice(0, 140);
          throw new Error(`Checkout failed (${res.status}) ${peek ? `– ${peek}` : ""}`);
        }

        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          // JSON path
          const j = await res.json().catch(() => ({} as any));
          const urlField: string | undefined = j.url || j.checkout_url || j.paymentUrl;
          if (urlField && /^https?:\/\//i.test(urlField)) {
            window.location.href = urlField;
            return true;
          }
          if (j.client_secret) {
            // Embedded flow would be handled here if you wire it up
            toast({ title: "Ready to pay", description: "Embedded checkout not wired up in this UI yet." });
            return true;
          }
          throw new Error("Unexpected checkout response (missing URL).");
        } else {
          // Non-JSON: allow plain text URL
          const text = (await res.text()).trim();
          if (/^https?:\/\//i.test(text)) {
            window.location.href = text;
            return true;
          }
          throw new Error(`Unexpected response type (${ct || "no content-type"})`);
        }
      };

      let success = false;
      let lastErr: unknown = null;
      for (const ep of endpoints) {
        try {
          success = await tryOnce(ep);
          if (success) break;
        } catch (e) {
          lastErr = e;
          // try next endpoint
        }
      }

      if (!success) throw lastErr || new Error("No checkout endpoint responded.");
    } catch (e: any) {
      toast({
        title: "Payment error",
        description: e?.message || "We couldn’t start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCheckingOut(false);
    }
  };

  const onClose = () => {
    setOpen(false);
    // small delay so dialog can animate out
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
                  Choose your duration and daily budget. Pay securely; we’ll handle delivery.
                </DialogDescription>
              </div>
            </div>

            <Button variant="ghost" className="h-9 w-9 rounded-full" onClick={onClose} aria-label="Close">
              <XIcon className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* Preview card */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
            <div className="relative w-20 h-14 overflow-hidden rounded-lg bg-black/30 flex-shrink-0">
              {splik?.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
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
            {/* Duration */}
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

            {/* Daily budget */}
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

          {/* Summary */}
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
          <div className="text-xs sm:text-sm text-white/70">
            You’ll review and pay securely on the next screen.
          </div>
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
