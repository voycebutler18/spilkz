// src/pages/Auth/Signup.tsx
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sparkles,
  Mail,
  Lock,
  User,
  Calendar,
  MapPin,
  AtSign,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

/* ---------------- helpers ---------------- */

function toDateInputValue(d: Date) {
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

// Lowercase, trim, remove spaces. Allow letters, numbers, underscore, dot.
function normalizeUsername(raw: string) {
  return (raw || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._]/g, "");
}

const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

/**
 * Availability check that:
 *  - uses eq on normalized usernames (you store them normalized)
 *  - if the read fails (RLS, network), returns true so we don't block signup.
 *    The insert remains the source of truth.
 */
async function usernameIsAvailable(normUsername: string) {
  if (!normUsername) return false;
  try {
    const { count, error } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .eq("username", normUsername);

    if (error) {
      console.warn("Username check skipped (read not allowed / failed):", error);
      return true; // don't block on read failure
    }
    return (count ?? 0) === 0;
  } catch (e) {
    console.warn("Username check failed:", e);
    return true; // don't block on exceptions either
  }
}

/* ---------------- component ---------------- */

const Signup = () => {
  // form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");

  const [dob, setDob] = useState("");
  const [city, setCity] = useState("");

  // ui state
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // username validation UI
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameOK, setUsernameOK] = useState<boolean | null>(null);
  const [usernameMsg, setUsernameMsg] = useState<string>("");

  const navigate = useNavigate();
  const { toast } = useToast();

  // derived
  const computedAge = useMemo(() => calcAgeFromDob(dob), [dob]);

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

  /* -------- redirect if already signed in -------- */
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate("/dashboard");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  /* -------- username live check (on blur / submit also re-check) -------- */
  const runUsernameCheck = async (raw: string) => {
    const norm = normalizeUsername(raw);
    setUsername(norm); // show normalized form in the input

    if (!norm) {
      setUsernameOK(null);
      setUsernameMsg("");
      return;
    }
    if (!USERNAME_RE.test(norm)) {
      setUsernameOK(false);
      setUsernameMsg("3–20 chars, letters, numbers, dot or underscore.");
      return;
    }

    setCheckingUsername(true);
    const available = await usernameIsAvailable(norm);
    setCheckingUsername(false);
    setUsernameOK(available);
    setUsernameMsg(available ? "Username is available" : "That username is taken");
  };

  /* -------- handle submit -------- */
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const normEmail = email.trim().toLowerCase();
    const normUsername = normalizeUsername(username);

    // basic validation
    if (!normEmail || !password || !firstName || !lastName || !dob || !city || !normUsername) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    if (!USERNAME_RE.test(normUsername)) {
      toast({
        title: "Invalid username",
        description: "3–20 chars. Use letters, numbers, dot or underscore.",
        variant: "destructive",
      });
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

    // Re-check availability (non-blocking on read failures)
    setCheckingUsername(true);
    const available = await usernameIsAvailable(normUsername);
    setCheckingUsername(false);
    if (!available) {
      setUsernameOK(false);
      setUsernameMsg("That username is taken");
      toast({
        title: "Username taken",
        description: "Please choose another one.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Create auth user
      const { data, error } = await supabase.auth.signUp({
        email: normEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
            dob,
            age: ageNum,
            city,
            username: normUsername,
          },
        },
      });
      if (error) throw error;

      if (data.user) {
        // Create profile row
        const { error: profileError } = await supabase.from("profiles").insert({
          id: data.user.id,
          first_name: firstName,
          last_name: lastName,
          age: ageNum,
          city,
          username: normUsername, // stored normalized
          display_name: `${firstName} ${lastName}`,
        });

        if (profileError) {
          // If your DB has a unique constraint and another user grabbed it in between
          if ((profileError as any).code === "23505") {
            toast({
              title: "Username just got taken",
              description: "Please pick a different username.",
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
          console.error("Profile creation error:", profileError);
        }

        // Optional welcome email (safe to keep)
        try {
          const { error: emailError } = await supabase.functions.invoke("send-welcome-email", {
            body: { email: normEmail, firstName, lastName },
          });
          if (emailError) console.error("Failed to send welcome email:", emailError);
        } catch (emailError) {
          console.error("Error calling email function:", emailError);
        }

        // Sign in immediately for smoother UX
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({ email: normEmail, password });

        if (!signInError && signInData.session) {
          toast({ title: "Account created!", description: "Welcome to Splikz!" });
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
            {/* Names */}
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

            {/* Username (mandatory, unique) */}
            <div className="space-y-2">
              <Label htmlFor="username">Username (unique)</Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder="yourname"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={(e) => runUsernameCheck(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {checkingUsername ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : usernameOK === true ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : usernameOK === false ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : null}
                </div>
              </div>
              {usernameMsg && (
                <p className={`text-xs ${usernameOK ? "text-green-600" : "text-red-600"}`}>
                  {usernameMsg}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                3–20 characters. Letters, numbers, dots or underscores. Not case-sensitive.
              </p>
            </div>

            {/* Email */}
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
                  autoCapitalize="none"
                />
              </div>
            </div>

            {/* Password */}
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
                <Input id="age" type="text" value={computedAge ?? ""} placeholder="—" readOnly disabled />
              </div>
            </div>

            {/* City */}
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
              disabled={loading || checkingUsername || usernameOK === false}
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
