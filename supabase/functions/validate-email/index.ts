import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ValidationStatus = "valid" | "invalid_format" | "does_not_exist" | "unverified";

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(email: unknown) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

async function resolveMx(domain: string): Promise<string[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) throw new Error("mx_lookup_failed");
  const data = await res.json();
  return (data.Answer ?? [])
    .filter((a: { type: number; data: string }) => a.type === 15 && a.data)
    .map((a: { data: string }) => a.data.replace(/^\d+\s+/, "").replace(/\.$/, ""));
}

async function resolveA(domain: string): Promise<boolean> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) return false;
  const data = await res.json();
  return (data.Answer ?? []).some((a: { type: number }) => a.type === 1);
}

async function logAttempt(email: string, domain: string | null, status: ValidationStatus, reason: string, provider: string, mxHosts: string[]) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await supabase.from("email_validation_logs").insert({
      email,
      domain,
      status,
      reason,
      provider,
      mx_hosts: mxHosts,
    });
  } catch (e) {
    console.error("log_attempt_failed", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return response({ valid: false, message: "Method not allowed." }, 405);

  const { email: rawEmail } = await req.json().catch(() => ({ email: "" }));
  const email = normalizeEmail(rawEmail);
  const domain = email.includes("@") ? email.split("@").pop() ?? null : null;

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    await logAttempt(email || "invalid", domain, "invalid_format", "syntax", "local", []);
    return response({ valid: false, message: "Please enter a valid email address." }, 400);
  }

  try {
    const mxHosts = await resolveMx(domain!);
    if (mxHosts.length > 0) {
      await logAttempt(email, domain, "valid", "mx_records_found", "dns", mxHosts);
      return response({ valid: true, message: "Email domain verified." });
    }

    // Fallback: some domains accept mail via A record
    const hasA = await resolveA(domain!);
    if (hasA) {
      await logAttempt(email, domain, "valid", "a_record_fallback", "dns", []);
      return response({ valid: true, message: "Email domain verified." });
    }

    await logAttempt(email, domain, "does_not_exist", "no_mx_or_a_records", "dns", []);
    return response({ valid: false, message: "The entered email does not exist." }, 400);
  } catch (e) {
    console.error("validation_error", e);
    // Don't block signup on transient DNS errors
    await logAttempt(email, domain, "unverified", "verification_error", "dns", []);
    return response({ valid: true, message: "Email accepted (verification skipped)." });
  }
});
