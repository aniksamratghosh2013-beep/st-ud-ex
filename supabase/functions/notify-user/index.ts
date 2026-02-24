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

    const { recipientEmail, recipientName, type, data } = await req.json();

    if (!recipientEmail || typeof recipientEmail !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid recipient email' }), { status: 400, headers: corsHeaders });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail) || recipientEmail.length > 320) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), { status: 400, headers: corsHeaders });
    }

    let subject = '';
    let html = '';

    switch (type) {
      case 'new_message':
        subject = `💬 New message from ${String(data?.senderName || 'Someone').substring(0, 50)}`;
        html = `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #333;">New Message on SyncUp</h2>
            <p><strong>${String(data?.senderName || 'Someone').substring(0, 100)}</strong> sent you a message${data?.channelName ? ` in <strong>#${String(data.channelName).substring(0, 100)}</strong>` : ''}:</p>
            <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; color: #555;">${String(data?.content || '').substring(0, 500)}</p>
            </div>
            <p style="color: #888; font-size: 12px;">This email was sent because you have notifications enabled on SyncUp.</p>
          </div>
        `;
        break;

      case 'new_dm':
        subject = `✉️ Direct message from ${String(data?.senderName || 'Someone').substring(0, 50)}`;
        html = `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #333;">New Direct Message</h2>
            <p><strong>${String(data?.senderName || 'Someone').substring(0, 100)}</strong> sent you a direct message:</p>
            <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; color: #555;">${String(data?.content || '').substring(0, 500)}</p>
            </div>
            <p style="color: #888; font-size: 12px;">This email was sent because you have notifications enabled on SyncUp.</p>
          </div>
        `;
        break;

      case 'mention':
        subject = `🔔 You were mentioned by ${String(data?.senderName || 'Someone').substring(0, 50)}`;
        html = `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #333;">You Were Mentioned</h2>
            <p><strong>${String(data?.senderName || 'Someone').substring(0, 100)}</strong> mentioned you in a message:</p>
            <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; color: #555;">${String(data?.content || '').substring(0, 500)}</p>
            </div>
          </div>
        `;
        break;

      default:
        subject = `🔔 SyncUp Notification`;
        html = `<p>You have a new notification on SyncUp.</p>`;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SyncUp <onboarding@resend.dev>',
        to: recipientEmail,
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
    console.error('Notify user error:', error);
    return new Response(JSON.stringify({ error: 'Notification failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
