import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SWEAR_WORDS = [
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'bastard', 'dick', 'crap',
  'piss', 'slut', 'whore', 'cock', 'cunt', 'nigger', 'faggot', 'retard',
];

function containsSwearWords(text: string): { found: boolean; words: string[] } {
  const lower = text.toLowerCase();
  const found = SWEAR_WORDS.filter(w => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(lower);
  });
  return { found: found.length > 0, words: found };
}

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

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

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const authenticatedUserId = claimsData.claims.sub;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase env not configured');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { messageId, content, channelId } = body;

    // Use the authenticated user's ID, not client-supplied userId
    const userId = authenticatedUserId;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Validate inputs
    if (!messageId || typeof messageId !== 'string' || !uuidRegex.test(messageId)) {
      return new Response(JSON.stringify({ error: 'Invalid messageId' }), { status: 400, headers: corsHeaders });
    }
    if (channelId && (typeof channelId !== 'string' || !uuidRegex.test(channelId))) {
      return new Response(JSON.stringify({ error: 'Invalid channelId' }), { status: 400, headers: corsHeaders });
    }
    if (!content || typeof content !== 'string' || content.length > 4000) {
      return new Response(JSON.stringify({ error: 'Invalid content' }), { status: 400, headers: corsHeaders });
    }

    // Step 1: Basic word filter
    const wordCheck = containsSwearWords(content);
    
    // Step 2: AI moderation for nuanced detection
    let aiFlag = false;
    let aiReason = '';
    try {
      const aiRes = await fetch(AI_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            {
              role: 'system',
              content: 'You are a content moderation assistant. Analyze the message for: harassment, threats, hate speech, spam, scams, or suspicious activity. Respond with JSON: {"flagged": true/false, "reason": "brief explanation"}. Only flag genuinely harmful content.',
            },
            { role: 'user', content: `Analyze this message: "${content.substring(0, 1000)}"` },
          ],
          max_tokens: 150,
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const aiText = aiData.choices?.[0]?.message?.content || '';
        try {
          const cleanJson = aiText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          aiFlag = parsed.flagged === true;
          aiReason = String(parsed.reason || '').substring(0, 500);
        } catch { /* ignore parse errors */ }
      }
    } catch (e) {
      console.error('AI moderation error:', e);
    }

    const isFlagged = wordCheck.found || aiFlag;

    if (isFlagged) {
      const reason = wordCheck.found
        ? `Swear words detected: ${wordCheck.words.join(', ')}${aiFlag ? '. AI: ' + aiReason : ''}`
        : `AI moderation: ${aiReason}`;

      // Insert moderation report
      await supabase.from('moderation_reports').insert({
        message_id: messageId,
        channel_id: channelId,
        reported_user_id: userId,
        reporter_type: 'auto',
        reason: reason.substring(0, 1000),
        flagged_content: content.substring(0, 4000),
      });

      // Get user profile
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).single();

      // Send email to main admin
      if (RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'SyncUp <onboarding@resend.dev>',
            to: Deno.env.get('ADMIN_EMAIL') || 'admin@example.com',
            subject: `⚠️ Content Flagged`,
            html: `
              <h2>Content Moderation Alert</h2>
              <p><strong>User:</strong> ${String(profile?.full_name || 'Unknown').substring(0, 100)}</p>
              <p><strong>Reason:</strong> ${reason.substring(0, 500)}</p>
              <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            `,
          }),
        });
      }
    }

    return new Response(JSON.stringify({ flagged: isFlagged }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Moderation error:', error);
    return new Response(JSON.stringify({ error: 'Moderation failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
