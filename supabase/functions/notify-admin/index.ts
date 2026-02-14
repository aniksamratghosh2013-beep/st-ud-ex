import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ADMIN_EMAIL = 'anik080413@gmail.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const { type, data } = await req.json();

    let subject = '';
    let html = '';

    switch (type) {
      case 'chat_message':
        subject = `💬 New Chat: ${data.userName || 'Unknown'}`;
        html = `
          <h2>New Chat Message</h2>
          <p><strong>User:</strong> ${data.userName}</p>
          <p><strong>Channel:</strong> ${data.channelName}</p>
          <p><strong>Message:</strong> ${data.content}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `;
        break;

      case 'ban_request':
        subject = `🚫 Ban Request: ${data.targetName}`;
        html = `
          <h2>Ban Request for Review</h2>
          <p><strong>Target:</strong> ${data.targetName} (${data.targetType})</p>
          <p><strong>Banned by:</strong> ${data.bannedByName}</p>
          <p><strong>Reason:</strong> ${data.reason}</p>
          <p><strong>Ban ID:</strong> ${data.banId}</p>
          <p>Review this ban in the Admin Dashboard.</p>
        `;
        break;

      case 'activity':
        subject = `📋 Activity: ${data.actionType}`;
        html = `
          <h2>User Activity Report</h2>
          <p><strong>User:</strong> ${data.userName}</p>
          <p><strong>Action:</strong> ${data.actionType}</p>
          <p><strong>Details:</strong> ${JSON.stringify(data.details || {})}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `;
        break;

      default:
        subject = `SyncUp Notification`;
        html = `<p>${JSON.stringify(data)}</p>`;
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
    if (!res.ok) throw new Error(`Resend error [${res.status}]: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Notify error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
