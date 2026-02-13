import { useState, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  onSwitch: (view: "login" | "signup" | "forgot" | "magic") => void;
}

export const SignupForm = forwardRef<HTMLDivElement, Props>(({ onSwitch }, ref) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const passwordChecks = {
    length: password.length >= 6,
    hasLetter: /[a-zA-Z]/.test(password),
    hasNumber: /\d/.test(password),
  };
  const passwordValid = passwordChecks.length && passwordChecks.hasLetter && passwordChecks.hasNumber;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      setError("Password must be at least 6 characters with letters and numbers.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      toast({
        title: "Check your email",
        description: "We've sent you a verification link. Please check your inbox.",
      });
      onSwitch("login");
    }
  };

  return (
    <Card ref={ref} className="border-0 shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-[family-name:var(--font-heading)]">Create account</CardTitle>
        <CardDescription>Join SyncUp to start collaborating</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="name"
                placeholder="Jane Doe"
                className="pl-9"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="signup-email"
                type="email"
                placeholder="you@example.com"
                className="pl-9"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="signup-password"
                type="password"
                placeholder="••••••••"
                className="pl-9"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                required
              />
            </div>
            {password.length > 0 && (
              <div className="space-y-1 mt-2">
                {[
                  { check: passwordChecks.length, label: "At least 6 characters" },
                  { check: passwordChecks.hasLetter, label: "Contains a letter" },
                  { check: passwordChecks.hasNumber, label: "Contains a number" },
                ].map(({ check, label }) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className={`h-3 w-3 ${check ? "text-success" : "text-muted-foreground"}`} />
                    <span className={check ? "text-success" : "text-muted-foreground"}>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading || !passwordValid}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button onClick={() => onSwitch("login")} className="text-primary font-medium hover:underline">
            Sign in
          </button>
        </p>
      </CardContent>
    </Card>
  );
});

SignupForm.displayName = "SignupForm";
