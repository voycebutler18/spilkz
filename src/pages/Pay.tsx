import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { ShieldCheck, Sparkles } from "lucide-react";

const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setLoading(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin.replace(/\/$/,"")}/dashboard?promo=success`,
      },
      redirect: "if_required",
    });

    if (error) {
      toast({ title: "Payment failed", description: error.message || "Please try again", variant: "destructive" });
      setLoading(false);
      return;
    }

    // If no redirect was needed, payment may already be successful:
    toast({ title: "Payment received", description: "Your promotion will go live shortly." });
    navigate("/dashboard?promo=success");
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button className="w-full mt-2" onClick={handleSubmit} disabled={loading || !stripe || !elements}>
        {loading ? "Processing..." : "Pay now"}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Secured by <span className="font-medium">splikz.com</span>. Cards, wallets, and local methods supported.
      </p>
    </div>
  );
}

export default function Pay() {
  const [params] = useSearchParams();
  const clientSecret = params.get("cs");
  const amount = Number(params.get("amt") || 0);
  const currency = (params.get("cur") || "USD").toUpperCase();
  const splikId = params.get("splik");

  const stripePromise = useMemo(() => (pk ? loadStripe(pk) : null), []);
  const options = useMemo(
    () => (clientSecret ? { clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#a855f7" } } } : undefined),
    [clientSecret]
  );

  if (!pk) {
    return (
      <div className="max-w-md mx-auto p-6">
        <Card className="p-6">
          <p className="text-red-500 font-medium">Missing VITE_STRIPE_PUBLISHABLE_KEY</p>
          <p className="text-sm text-muted-foreground mt-2">Add it to your frontend env and rebuild.</p>
        </Card>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="max-w-md mx-auto p-6">
        <Card className="p-6">
          <p className="text-red-500 font-medium">Missing client secret</p>
          <p className="text-sm text-muted-foreground mt-2">
            Start from the Promote dialog so we can create a payment.
          </p>
          <Link to="/home" className="underline mt-4 inline-block">Back to Home</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-background to-black/40 py-10 px-4">
      <div className="max-w-md mx-auto">
        <Card className="p-6 space-y-5 border border-white/10 bg-black/60">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl p-2 bg-gradient-to-r from-purple-500 to-pink-500">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Complete your promotion</h1>
              {splikId && <Badge className="mt-1">Splik #{splikId}</Badge>}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 p-3 bg-white/5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/80">Total</span>
              <span className="text-lg font-semibold">
                {amount > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100) : "—"}
              </span>
            </div>
            <div className="mt-1 text-xs text-white/60 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> You’ll see this charge from Splikz.
            </div>
          </div>

          {stripePromise && options ? (
            <Elements stripe={stripePromise} options={options}>
              <CheckoutForm />
            </Elements>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
