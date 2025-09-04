import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Zap, TrendingUp, Rocket, CreditCard, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Stripe publishable key (this is safe to be public)
const stripePromise = loadStripe("pk_test_51QaWjcGHCCtRJQBKy6HJQ5e9pJxCqXBnBQ9oGPYFBH1VXbjeVcdl7sV6kEyPNT7NWGGrLWlx5m3YKAvOzQVMWUAe00aKvgABRY");

interface BoostModalProps {
  isOpen: boolean;
  onClose: () => void;
  splikId: string;
  videoTitle?: string;
}

const boostPlans = [
  {
    id: "standard",
    name: "Standard Boost",
    price: "$5",
    duration: "7 days",
    features: ["2x more views", "Basic promotion", "Standard placement"],
    icon: Zap,
    color: "from-blue-500 to-blue-600",
  },
  {
    id: "premium",
    name: "Premium Boost",
    price: "$15",
    duration: "14 days",
    features: ["5x more views", "Priority promotion", "Featured placement"],
    icon: TrendingUp,
    color: "from-purple-500 to-purple-600",
    popular: true,
  },
  {
    id: "max",
    name: "Maximum Impact",
    price: "$30",
    duration: "30 days",
    features: ["10x more views", "Top priority", "Homepage feature"],
    icon: Rocket,
    color: "from-orange-500 to-red-600",
  },
];

function CheckoutForm({ splikId, selectedPlan, onSuccess, onClose }: any) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      // Get the payment intent from our edge function
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke(
        "create-boost-payment",
        {
          body: {
            splikId,
            boostLevel: selectedPlan,
          },
        }
      );

      if (paymentError) throw paymentError;

      // Confirm the payment with the card details
      const { error: stripeError } = await stripe.confirmCardPayment(
        paymentData.clientSecret,
        {
          payment_method: {
            card: elements.getElement(CardElement)!,
          },
        }
      );

      if (stripeError) {
        setPaymentError(stripeError.message || "Payment failed");
        setIsProcessing(false);
        return;
      }

      // Confirm boost activation on our backend
      const { data: confirmData, error: confirmError } = await supabase.functions.invoke(
        "confirm-boost-payment",
        {
          body: {
            paymentIntentId: paymentData.paymentIntentId,
            splikId,
            boostLevel: selectedPlan,
          },
        }
      );

      if (confirmError) throw confirmError;

      toast.success(confirmData.message || "Your video is now boosted!");
      onSuccess();
    } catch (error: any) {
      console.error("Payment error:", error);
      setPaymentError(error.message || "Payment failed. Please try again.");
      toast.error("Payment failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg bg-muted/50">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "16px",
                color: "#424770",
                "::placeholder": {
                  color: "#aab7c4",
                },
              },
              invalid: {
                color: "#9e2146",
              },
            },
          }}
        />
      </div>

      {paymentError && (
        <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
          {paymentError}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isProcessing}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 bg-gradient-to-r from-primary to-secondary"
        >
          {isProcessing ? "Processing..." : `Pay ${boostPlans.find(p => p.id === selectedPlan)?.price}`}
        </Button>
      </div>
    </form>
  );
}

export default function BoostModal({ isOpen, onClose, splikId, videoTitle }: BoostModalProps) {
  const [selectedPlan, setSelectedPlan] = useState("premium");
  const [showPayment, setShowPayment] = useState(false);

  const handleSuccess = () => {
    setShowPayment(false);
    onClose();
    // Optionally refresh the page or update UI
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            Boost Your Video
          </DialogTitle>
          {videoTitle && (
            <p className="text-sm text-muted-foreground mt-1">
              Boosting: {videoTitle}
            </p>
          )}
        </DialogHeader>

        <div className="pb-4">
          {!showPayment ? (
            <>
              <div className="grid md:grid-cols-3 sm:grid-cols-1 gap-4 my-6">
                {boostPlans.map((plan) => {
                const Icon = plan.icon;
                const isSelected = selectedPlan === plan.id;
                
                return (
                  <Card
                    key={plan.id}
                    className={cn(
                      "relative cursor-pointer transition-all",
                      isSelected && "ring-2 ring-primary scale-105",
                      plan.popular && "border-primary"
                    )}
                    onClick={() => setSelectedPlan(plan.id)}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full">
                          Most Popular
                        </span>
                      </div>
                    )}
                    
                    <div className={cn(
                      "p-6 space-y-4 h-full flex flex-col"
                    )}>
                      <div className={cn(
                        "h-12 w-12 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                        plan.color
                      )}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      
                      <div>
                        <h3 className="font-semibold">{plan.name}</h3>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-3xl font-bold">{plan.price}</span>
                          <span className="text-muted-foreground">/ {plan.duration}</span>
                        </div>
                      </div>
                      
                      <ul className="space-y-2 flex-grow">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Check className="h-4 w-4 text-primary mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      
                      {isSelected && (
                        <div className="absolute top-3 right-3">
                          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-4 w-4 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
              </div>

              <div className="flex gap-3 sticky bottom-0 bg-background pt-4 pb-2">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={() => setShowPayment(true)}
                  className="flex-1 bg-gradient-to-r from-primary to-secondary"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Continue to Payment
                </Button>
              </div>
            </>
          ) : (
            <Elements stripe={stripePromise}>
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Selected Plan</p>
                  <p className="font-semibold">
                    {boostPlans.find(p => p.id === selectedPlan)?.name} - {boostPlans.find(p => p.id === selectedPlan)?.price}
                  </p>
                </div>
                
                <CheckoutForm
                  splikId={splikId}
                  selectedPlan={selectedPlan}
                  onSuccess={handleSuccess}
                  onClose={() => setShowPayment(false)}
                />
              </div>
            </Elements>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}