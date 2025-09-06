// src/pages/Auth/Signup.tsx
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Mail, Lock, User, Calendar, MapPin, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

function toDateInputValue(d: Date) {
  // Normalize to local date (avoid TZ off-by-one)
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOff).toISOString().split("T")[0];
}

function calcAgeFromDob(dobStr: string): number | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : null;
}

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState(""); // YYYY-MM-DD (from <input type="date">)
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Derived age from DOB
  const computedAge = useMemo(() => calcAgeFromDob(dob), [dob]);

  // Date limits for DOB picker (120 years ago to 13 years ago)
  const maxDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 13);
    return toDateInputValue(d);
  }, []);
  const minDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 120);
    return toDateInputValue(d);
  }, []);

  // Check if user already logged in and redirect
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          navigate("/dashboard");
          return;
        }
      } catch (error) {
        console.error("Auth check error:", error);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate("/dashboard");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password || !firstName || !lastName || !dob || !city) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    const ageNum = computedAge ?? NaN;
    if (Number.isNaN(ageNum) || ageNum < 13 || ageNum > 120) {
      toast({
        title: "Invalid age",
        description: "Your date of birth must indicate an age between 13 and 120.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
            dob,                 // store in auth metadata
            age: ageNum,         // store in auth metadata
            city,
          },
        },
      });
      if (error) throw error;

      if (data.user) {
        // Create profile (store age; omit dob to avoid DB errors if column doesn't exist yet)
        const { error: profileError } = await supabase
          .from("profiles")
          .insert({
            id: data.user.id,
            first_name: firstName,
            last_name: lastName,
            age: ageNum,
            city,
            username: email.split("@")[0],
            display_name: `${firstName} ${lastName}`,
          });
        if (profileError) console.error("Profile creation error:", profileError);

        // Optional: welcome email (ignore failure)
        try {
          const { error: emailError } = await supabase.functions.invoke("send-welcome-email", {
            body: { email, firstName, lastName },
          });
          if (emailError) console.error("Failed to send welcome email:", emailError);
        } catch (emailError) {
          console.error("Error calling email function:", emailError);
        }

        // Dev convenience: sign in immediately
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (!signInError && signInData.session) {
          toast({
            title: "Account created!",
            description: "Welcome to Splikz! Check your email for a welcome message.",
          });
          navigate("/dashboard");
        } else {
          toast({
            title: "Account created!",
            description: "Please check your email and log in to continue",
          });
          navigate("/login");
        }
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create account",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Sparkles className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Join Splikz and start sharing your gestures</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            {/* DOB + auto Age */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    min={minDob}
                    max={maxDob}
                    required
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  For safety, your DOB helps us verify age and can’t be changed later.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="text"
                  value={computedAge ?? ""}
                  placeholder="—"
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="city"
                  type="text"
                  placeholder="New York"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By signing up, you agree to our{" "}
              <Link to="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </p>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Log in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Signup;
