import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMTP_TIMEOUT_MS = 4500;

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

async function resolveMx(domain: string) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) throw new Error("mx_lookup_failed");
  const data = await res.json();
  return (data.Answer ?? [])
    .filter((answer: { type: number; data: string }) => answer.type === 15 && answer.data)
    .map((answer: { data: string }) => answer.data.replace(/^\d+\s+/, "").replace(/\.$/, ""));
}

async function smtpProbe(email: string, mxHost: string): Promise<ValidationStatus> {
  let conn: Deno.TcpConn | undefined;
  const timeout = new Promise<ValidationStatus>((resolve) => {
    setTimeout(() => resolve("unverified"), SMTP_TIMEOUT_MS);
  });

  const probe = async (): Promise<ValidationStatus> => {
    conn = await Deno.connect({ hostname: mxHost, port: 25 });
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(2048);

    const read = async () => decoder.decode(buffer.subarray(0, await conn!.read(buffer) ?? 0));
    const write = (line: string) => conn!.write(encoder.encode(`${line}\r\n`));

    await read();
    await write("HELO synedify.app");
    await read();
    await write("MAIL FROM:<verify@synedify.app>");
    await read();
    await write(`RCPT TO:<${email}>`);
    const rcpt = await read();
    await write("QUIT");

    if (/^250|^251/m.test(rcpt)) return "valid";
    if (/^550|^551|^553|user unknown|mailbox unavailable/i.test(rcpt)) return "does_not_exist";
    return "unverified";
  };

  try {
    return await Promise.race([probe(), timeout]);
  } catch {
    return "unverified";
  } finally {
    try { conn?.close(); } catch { /* noop */ }
  }
}

async function logAttempt(email: string, domain: string | null, status: ValidationStatus, reason: string, provider: string, mxHosts: string[]) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  await supabase.from("email_validation_logs").insert({
    email,
    domain,
    status,
    reason,
    provider,
    mx_hosts: mxHosts,
  });
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
    if (mxHosts.length === 0) {
      await logAttempt(email, domain, "does_not_exist", "no_mx_records", "dns", []);
      return response({ valid: false, message: "The entered email does not exist." }, 400);
    }

    const smtpStatus = await smtpProbe(email, mxHosts[0]);
    if (smtpStatus === "does_not_exist") {
      await logAttempt(email, domain, smtpStatus, "smtp_rejected_recipient", "smtp", mxHosts);
      return response({ valid: false, message: "The entered email does not exist." }, 400);
    }

    if (smtpStatus === "unverified") {
      await logAttempt(email, domain, smtpStatus, "mailbox_verification_unavailable", "smtp", mxHosts);
      return response({
        valid: false,
        message: "We couldn't verify this email right now. Please try again or use another email address.",
      }, 503);
    }

    await logAttempt(email, domain, "valid", "smtp_accepted_recipient", "smtp", mxHosts);
    return response({ valid: true, message: "Email verified." });
  } catch {
    await logAttempt(email, domain, "unverified", "verification_error", "dns", []);
    return response({
      valid: false,
      message: "We couldn't verify this email right now. Please try again or use another email address.",
    }, 503);
  }
});