import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'admin@example.com';

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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const body = await req.json();
    const { type, data } = body;

    // Validate input
    const allowedTypes = ['chat_message', 'ban_request', 'activity'];
    if (!type || typeof type !== 'string' || !allowedTypes.includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid notification type' }), { status: 400, headers: corsHeaders });
    }
    if (data && typeof data !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid data' }), { status: 400, headers: corsHeaders });
    }

    let subject = '';
    let html = '';

    switch (type) {
      case 'chat_message':
        subject = `💬 New Chat: ${escapeHtml(data?.userName || 'Unknown').substring(0, 50)}`;
        html = `
          <h2>New Chat Message</h2>
          <p><strong>User:</strong> ${escapeHtml(data?.userName || '').substring(0, 100)}</p>
          <p><strong>Channel:</strong> ${escapeHtml(data?.channelName || '').substring(0, 100)}</p>
          <p><strong>Message:</strong> ${escapeHtml(data?.content || '').substring(0, 500)}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `;
        break;

      case 'ban_request':
        subject = `🚫 Ban Request: ${escapeHtml(data?.targetName || '').substring(0, 50)}`;
        html = `
          <h2>Ban Request for Review</h2>
          <p><strong>Target:</strong> ${escapeHtml(data?.targetName || '')} (${escapeHtml(data?.targetType || '')})</p>
          <p><strong>Banned by:</strong> ${escapeHtml(data?.bannedByName || '')}</p>
          <p><strong>Reason:</strong> ${escapeHtml(data?.reason || '').substring(0, 500)}</p>
          <p>Review this ban in the Admin Dashboard.</p>
        `;
        break;

      case 'activity':
        subject = `📋 Activity: ${escapeHtml(data?.actionType || '').substring(0, 50)}`;
        html = `
          <h2>User Activity Report</h2>
          <p><strong>User:</strong> ${escapeHtml(data?.userName || '')}</p>
          <p><strong>Action:</strong> ${escapeHtml(data?.actionType || '')}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `;
        break;

      default:
        subject = `SyncUp Notification`;
        html = `<p>Notification received</p>`;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SyncUp <onboarding@resend.dev>',
        to: ADMIN_EMAIL,
        subject,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(`Resend error: ${res.status}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Notify error:', error);
    return new Response(JSON.stringify({ error: 'Notification failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
