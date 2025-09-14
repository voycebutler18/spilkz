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
import { Rocket, CalendarClock, DollarSign, TrendingUp, ShieldCheck, X as XIcon } from "lucide-react";

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

const DAY_CHOICES = Array.from({ length: 30 }, (_, i) => i + 1);
const estReach = (days: number, dailyBudget: number) => Math.round(days * dailyBudget * 600);

export default function Promote() {
  const { splikId = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [splik, setSplik] = useState<SplikRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [durationDays, setDurationDays] = useState<number>(7);
  const [dailyBudget, setDailyBudget] = useState<number>(5);

  const total = useMemo(() => Number((durationDays * dailyBudget).toFixed(2)), [durationDays, dailyBudget]);
  const reach = useMemo(() => estReach(durationDays, dailyBudget), [durationDays, dailyBudget]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const [{ data, error }, session] = await Promise.all([
          supabase.from("spliks").select("id,title,thumbnail_url,description,created_at,user_id").eq("id", splikId).maybeSingle(),
          supabase.auth.getUser(),
        ]);
        if (error) throw error;
        if (isMounted) {
          setSplik((data as any) ?? null);
          setUserId(session.data.user?.id ?? null);
        }
      } catch (e: any) {
        toast({ title: "Couldn't load your post", description: e.message || "Please try again.", variant: "destructive" });
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [splikId, toast]);

  /** Checkout → redirect to your function (no fetch, no CORS) */
  const handleCheckout = () => {
    if (checkingOut) return;

    // quick guards
    if (!splikId) {
      toast({ title: "Missing post", description: "We couldn't find that post.", variant: "destructive" });
      return;
    }
    if (durationDays < 1 || durationDays > 30) {
      toast({ title: "Choose a duration", description: "Pick between 1 and 30 days.", variant: "destructive" });
      return;
    }
    if (dailyBudget < 0.5 || dailyBudget > 500) {
      toast({ title: "Daily budget out of range", description: "Pick between $0.50 and $500 per day.", variant: "destructive" });
      return;
    }

    // build target URL from envs
    let raw = (import.meta.env.VITE_PROMOTE_CHECKOUT_URL as string | undefined)?.trim() || "";
    const supa = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") || "";

    // if VITE_PROMOTE_CHECKOUT_URL isn't set, fall back to Supabase function
    if (!raw) {
      if (!supa) {
        toast({ title: "Setup error", description: "Set VITE_PROMOTE_CHECKOUT_URL or VITE_SUPABASE_URL.", variant: "destructive" });
        return;
      }
      raw = `${supa}/functions/v1/promotions-checkout`;
    } else if (!/^https?:\/\//i.test(raw)) {
      // if someone set it to a path like "/functions/v1/promotions-checkout"
      if (!supa) {
        toast({ title: "Setup error", description: "VITE_SUPABASE_URL is required with a relative checkout URL.", variant: "destructive" });
        return;
      }
      raw = `${supa}/${raw.replace(/^\//, "")}`;
    }

    setCheckingOut(true);
    try {
      const url = new URL(raw);
      url.searchParams.set("splikId", splikId);
      if (userId) url.searchParams.set("userId", userId);
      url.searchParams.set("days", String(durationDays));
      url.searchParams.set("dailyBudgetCents", String(Math.round(dailyBudget * 100)));
      url.searchParams.set("currency", "USD");

      console.info("Redirecting to checkout:", url.toString());
      window.location.assign(url.toString());
    } catch (err: any) {
      setCheckingOut(false);
      toast({ title: "Payment error", description: err?.message || "We couldn’t start checkout.", variant: "destructive" });
    }
  };

  const onClose = () => {
    setOpen(false);
    setTimeout(() => navigate(-1), 120);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : onClose())}>
      <DialogContent className="max-w-3xl w-[min(96vw,850px)] max-h-[90vh] p-0 overflow-hidden rounded-2xl bg-slate-900/95 backdrop-blur-2xl border border-white/15 shadow-2xl flex flex-col">
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
                <DialogDescription className="text-gray-300">Choose your duration and daily budget. Pay securely; we'll handle delivery.</DialogDescription>
              </div>
            </div>
            <Button variant="ghost" className="h-9 w-9 rounded-full" onClick={onClose} aria-label="Close">
              <XIcon className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <CalendarClock className="h-4 w-4 text-purple-300" />
                <Label className="text-white">Duration</Label>
              </div>
              <Select value={String(durationDays)} onValueChange={(v) => setDurationDays(Number(v))}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Select days" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-white/20 text-white max-h-64">
                  {DAY_CHOICES.map((d) => (
                    <SelectItem key={d} value={String(d)} className="text-white hover:bg-white/10">
                      {d} {d === 1 ? "day" : "days"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-white/70">Starts immediately and runs for <strong className="text-white">{durationDays}</strong> {durationDays === 1 ? "day" : "days"}.</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <DollarSign className="h-4 w-4 text-green-300" />
                <Label className="text-white">Daily budget</Label>
              </div>
              <div className="flex items-center gap-3">
                <Slider value={[dailyBudget]} min={0.5} max={500} step={0.5} onValueChange={(v) => setDailyBudget(v[0] ?? 5)} className="flex-1" />
                <div className="w-28">
                  <Input
                    type="number"
                    min={0.5}
                    max={500}
                    step={0.5}
                    value={dailyBudget}
                    onChange={(e) => {
                      const n = Math.max(0.5, Math.min(500, parseFloat(e.target.value || "0")));
                      setDailyBudget(Number.isFinite(n) ? Number(n.toFixed(2)) : 0.5);
                    }}
                    className="bg-white/10 border-white/20 text-white"
                  />
                </div>
              </div>
              <p className="text-xs text-white/70">We optimize for real people. Increase this for more reach each day.</p>
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
                <div className="text-white/70 text-xs">{fmtUSD(dailyBudget)} / day × {durationDays} {durationDays === 1 ? "day" : "days"}.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-white/10 bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs sm:text-sm text-white/70">You'll review and pay securely on the next screen.</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="rounded-xl" disabled={checkingOut}>Cancel</Button>
            <Button onClick={handleCheckout} className="rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 text-white hover:from-purple-700 hover:via-pink-700 hover:to-red-700" disabled={checkingOut || loading}>
              {checkingOut ? "Redirecting…" : "Continue to payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
