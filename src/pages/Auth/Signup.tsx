// src/pages/Auth/Signup.tsx
import { useState, useEffect, useMemo } from "react";// src/pages/Auth/Signup.tsx
/**
 * IMPORTANT (run once in Supabase SQL editor for true case-insensitive uniqueness):
 *
 *   update public.profiles
 *     set username = lower(username)
 *     where username is not null and username <> lower(username);
 *
 *   create unique index if not exists profiles_username_unique_ci
 *     on public.profiles (lower(username));
 *
 *   -- (Optional) allow only a–z 0–9 . _
 *   alter table public.profiles
 *     add constraint profiles_username_valid
 *     check (username ~ '^[a-z0-9._]{3,20}$');
 */

import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Sparkles, Mail, Lock, User, Calendar, MapPin, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
const USERNAME_RE = /^[a-z0-9._]{3,20}$/;
const normalizeUsername = (v: string) =>
  v.trim().toLowerCase().replace(/[^a-z0-9._]/g, "");

const Signup = () => {
  // auth fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // profile fields
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [city, setCity] = useState("");

  // state
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  // Derived age & DOB limits
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

  // Redirect if already signed in
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

  // Username onChange: normalize and clear availability status
  const onUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const norm = normalizeUsername(raw);
    setUsername(norm);
    setUsernameAvailable(null);
  };

  // Username availability check (onBlur to keep it snappy)
  const checkUsername = async () => {
    const norm = normalizeUsername(username);
    if (!norm || !USERNAME_RE.test(norm)) {
      setUsernameAvailable(null);
      return;
    }
    setCheckingUsername(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        // ILIKE without wildcards behaves like case-insensitive equality
        .ilike("username", norm)
        .maybeSingle();
      if (error) {
        console.error(error);
        setUsernameAvailable(null);
      } else {
        setUsernameAvailable(!data); // available if no row returned
      }
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const normUsername = normalizeUsername(username);

    // Required fields
    if (!email || !password || !firstName || !lastName || !dob || !city || !normUsername) {
      toast({ title: "Error", description: "Please fill in all fields, including a username.", variant: "destructive" });
      return;
    }

    // Password min
    if (password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    // Age bounds
    const ageNum = computedAge ?? NaN;
    if (Number.isNaN(ageNum) || ageNum < 13 || ageNum > 120) {
      toast({
        title: "Invalid age",
        description: "Your date of birth must indicate an age between 13 and 120.",
        variant: "destructive",
      });
      return;
    }

    // Username rule + preflight uniqueness
    if (!USERNAME_RE.test(normUsername)) {
      toast({
        title: "Invalid username",
        description: "Use 3–20 chars: a–z, 0–9, dot or underscore.",
        variant: "destructive",
      });
      return;
    }
    // If we already checked and it’s taken, block fast
    if (usernameAvailable === false) {
      toast({ title: "Username taken", description: "Please choose another username.", variant: "destructive" });
      return;
    }
    // Preflight query (in case user didn’t blur)
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", normUsername)
      .maybeSingle();
    if (existing) {
      toast({ title: "Username taken", description: "Please choose another username.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Create auth user (store basic metadata too)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
            dob,
            age: ageNum,
            city,
            username: normUsername, // also in auth metadata (non-authoritative)
          },
        },
      });
      if (error) throw error;

      if (data.user) {
        // Insert profile row
        const { error: profileError } = await supabase
          .from("profiles")
          .insert({
            id: data.user.id,
            first_name: firstName,
            last_name: lastName,
            age: ageNum,
            city,
            username: normUsername,                // normalized lowercase
            display_name: `${firstName} ${lastName}`,
          });

        // If unique index rejects duplicate (race), surface it clearly
        // Postgres code for unique violation is 23505
        // @ts-expect-error - supabase error has 'code'
        if (profileError?.code === "23505") {
          toast({
            title: "Username already taken",
            description: "Please choose a different username.",
            variant: "destructive",
          });
          return;
        } else if (profileError) {
          console.error("Profile creation error:", profileError);
        }

        // Optional: welcome email (best-effort)
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
          toast({ title: "Account created!", description: "Welcome to Splikz 🎉" });
          navigate("/dashboard");
        } else {
          toast({
            title: "Account created!",
            description: "Please verify your email and log in to continue.",
          });
          navigate("/login");
        }
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to create account",
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
            {/* Name */}
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
                />
              </div>
            </div>

            {/* Username (mandatory) */}
            <div className="space-y-2">
              <Label htmlFor="username">Username (unique)</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder="yourname"
                  value={username}
                  onChange={onUsernameChange}
                  onBlur={checkUsername}
                  className="pl-10"
                  disabled={loading}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span>3–20 chars: a–z, 0–9, “.” or “_”.</span>
                {checkingUsername && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {username &&
                  !checkingUsername &&
                  USERNAME_RE.test(username) &&
                  usernameAvailable === true && (
                    <span className="text-green-600">Available</span>
                  )}
                {username &&
                  !checkingUsername &&
                  USERNAME_RE.test(username) &&
                  usernameAvailable === false && (
                    <span className="text-red-600">Taken</span>
                  )}
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
