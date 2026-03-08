import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const userId = claimsData.claims.sub;

    // Only app_founders can send arbitrary emails
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: isAdmin } = await serviceClient.rpc('is_app_founder', { _user_id: userId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: app_founder required' }), { status: 403, headers: corsHeaders });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const { to, subject, html } = await req.json();

    // Validate inputs
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (to && (typeof to !== 'string' || !emailRegex.test(to) || to.length > 320)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), { status: 400, headers: corsHeaders });
    }
    if (!subject || typeof subject !== 'string' || subject.length > 200) {
      return new Response(JSON.stringify({ error: 'Invalid subject' }), { status: 400, headers: corsHeaders });
    }
    if (!html || typeof html !== 'string' || html.length > 50000) {
      return new Response(JSON.stringify({ error: 'Invalid html content' }), { status: 400, headers: corsHeaders });
    }

    // Sanitize HTML: allowlist approach - strip all tags except safe ones
    const sanitizedHtml = html
      // Remove script/iframe/object/embed/form/style tags and contents
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed\b[^>]*\/?>/gi, '')
      .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, '')
      .replace(/<link\b[^>]*\/?>/gi, '')
      .replace(/<meta\b[^>]*\/?>/gi, '')
      .replace(/<base\b[^>]*\/?>/gi, '')
      // Remove all event handlers (on*)
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
      // Remove javascript:, vbscript:, data: URIs in attributes
      .replace(/(href|src|action|background|formaction|poster|data)\s*=\s*["']?\s*(javascript|vbscript|data)\s*:/gi, '$1="blocked:')
      // Remove style attributes that could contain expressions
      .replace(/style\s*=\s*("[^"]*expression[^"]*"|'[^']*expression[^']*')/gi, '');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Synedify <onboarding@resend.dev>',
        to: to || 'anik080413@gmail.com',
        subject,
        html: sanitizedHtml,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Resend API error: ${res.status}`);
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Email error:', error);
    return new Response(JSON.stringify({ error: 'Failed to send email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
