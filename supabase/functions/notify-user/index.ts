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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Use service role to look up recipient email
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify calling user
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

    const { recipientEmail: providedEmail, recipientId, recipientName, type, data } = await req.json();

    // Resolve recipient email: use provided or look up by recipientId
    let recipientEmail = providedEmail;
    if (!recipientEmail && recipientId) {
      const { data: recipientUser } = await supabaseAdmin.auth.admin.getUserById(recipientId);
      recipientEmail = recipientUser?.user?.email;
    }
    // If still no email and we have data about a receiver, try looking up from the DM context
    if (!recipientEmail && data?.receiverId) {
      const { data: recipientUser } = await supabaseAdmin.auth.admin.getUserById(data.receiverId);
      recipientEmail = recipientUser?.user?.email;
    }

    if (!recipientEmail || typeof recipientEmail !== 'string') {
      return new Response(JSON.stringify({ error: 'Could not resolve recipient email' }), { status: 400, headers: corsHeaders });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail) || recipientEmail.length > 320) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), { status: 400, headers: corsHeaders });
    }

    let subject = '';
    let html = '';

    switch (type) {
      case 'new_message':
        subject = `💬 New message from ${escapeHtml(data?.senderName || 'Someone').substring(0, 50)}`;
        html = `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #333;">New Message on Synedify</h2>
            <p><strong>${escapeHtml(data?.senderName || 'Someone').substring(0, 100)}</strong> sent you a message${data?.channelName ? ` in <strong>#${escapeHtml(data.channelName).substring(0, 100)}</strong>` : ''}:</p>
            <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; color: #555;">${escapeHtml(data?.content || '').substring(0, 500)}</p>
            </div>
            <p style="color: #888; font-size: 12px;">This email was sent because you have notifications enabled on Synedify.</p>
          </div>
        `;
        break;

      case 'new_dm':
        subject = `✉️ Direct message from ${escapeHtml(data?.senderName || 'Someone').substring(0, 50)}`;
        html = `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #333;">New Direct Message</h2>
            <p><strong>${escapeHtml(data?.senderName || 'Someone').substring(0, 100)}</strong> sent you a direct message:</p>
            <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; color: #555;">${escapeHtml(data?.content || '').substring(0, 500)}</p>
            </div>
            <p style="color: #888; font-size: 12px;">This email was sent because you have notifications enabled on Synedify.</p>
          </div>
        `;
        break;

      case 'mention':
        subject = `🔔 You were mentioned by ${escapeHtml(data?.senderName || 'Someone').substring(0, 50)}`;
        html = `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #333;">You Were Mentioned</h2>
            <p><strong>${escapeHtml(data?.senderName || 'Someone').substring(0, 100)}</strong> mentioned you in a message:</p>
            <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; color: #555;">${escapeHtml(data?.content || '').substring(0, 500)}</p>
            </div>
          </div>
        `;
        break;

      default:
        subject = `🔔 Synedify Notification`;
        html = `<p>You have a new notification on Synedify.</p>`;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Synedify <onboarding@resend.dev>',
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
