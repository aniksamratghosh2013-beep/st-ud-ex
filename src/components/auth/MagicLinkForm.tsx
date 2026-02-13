import { useState, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, ArrowLeft } from "lucide-react";

interface Props {
  onSwitch: (view: "login" | "signup" | "forgot" | "magic") => void;
}

export const MagicLinkForm = forwardRef<HTMLDivElement, Props>(({ onSwitch }, ref) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "We've sent you a magic link to sign in." });
    }
  };

  return (
    <Card ref={ref} className="border-0 shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-[family-name:var(--font-heading)]">Magic Link</CardTitle>
        <CardDescription>Sign in without a password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleMagicLink} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="magic-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="magic-email"
                type="email"
                placeholder="you@example.com"
                className="pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send magic link"}
          </Button>
        </form>

        <button
          onClick={() => onSwitch("login")}
          className="mt-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sign in
        </button>
      </CardContent>
    </Card>
  );
});

MagicLinkForm.displayName = "MagicLinkForm";
