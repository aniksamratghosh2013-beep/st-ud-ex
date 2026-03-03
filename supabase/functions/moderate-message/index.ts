import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Slurs targeting protected categories (race, religion, sexual orientation, gender identity, disability, etc.)
const SLUR_WORDS = [
  'nigger', 'nigga', 'faggot', 'fag', 'dyke', 'tranny', 'retard', 'retarded',
  'cunt', 'kike', 'spic', 'wetback', 'chink', 'gook', 'raghead', 'towelhead',
  'beaner', 'cracker', 'honky', 'gringo', 'paki', 'wog', 'coon', 'darkie',
  'halfbreed', 'mongol', 'mongoloid', 'shemale', 'hermaphrodite', 'gimp',
  'cripple', 'homo', 'lesbo', 'queer',
];

// General profanity (less severe — flagged but not auto-banned)
const SWEAR_WORDS = [
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'bastard', 'dick', 'crap',
  'piss', 'slut', 'whore', 'cock',
];

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function checkWordList(text: string, wordList: string[]): { found: boolean; words: string[] } {
  const lower = text.toLowerCase();
  const found = wordList.filter(w => {
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const authenticatedUserId = user.id;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL');
    if (!ADMIN_EMAIL) throw new Error('ADMIN_EMAIL not configured');

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase env not configured');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { messageId, content, channelId, source } = body;
    // source: 'chat' | 'post' | 'profile' | 'organization'

    const userId = authenticatedUserId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (messageId && (typeof messageId !== 'string' || !uuidRegex.test(messageId))) {
      return new Response(JSON.stringify({ error: 'Invalid messageId' }), { status: 400, headers: corsHeaders });
    }
    if (channelId && (typeof channelId !== 'string' || !uuidRegex.test(channelId))) {
      return new Response(JSON.stringify({ error: 'Invalid channelId' }), { status: 400, headers: corsHeaders });
    }
    if (!content || typeof content !== 'string' || content.length > 4000) {
      return new Response(JSON.stringify({ error: 'Invalid content' }), { status: 400, headers: corsHeaders });
    }

    // Step 1: Slur check (auto-ban worthy)
    const slurCheck = checkWordList(content, SLUR_WORDS);

    // Step 2: Profanity check (flag only)
    const swearCheck = checkWordList(content, SWEAR_WORDS);

    // Step 3: AI moderation for comprehensive categories
    let aiFlag = false;
    let aiReason = '';
    let aiCategory = '';
    let aiSeverity = 'low';
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
              content: `You are a content moderation assistant. Analyze the message for ALL of these categories:
1. Harassment and Bullying
2. Graphic Violence and Gore
3. Self-Harm and Suicide Promotion
4. Illegal Goods and Services (drugs, firearms)
5. Sexually Explicit Content and Nudity
6. Misinformation and False News
7. Spam and Deceptive Practices
8. Impersonation and Fake Accounts
9. Intellectual Property Infringement
10. Doxxing and Privacy Violations
11. Regulated Products (tobacco, prescription drugs)
12. Scams and Fraudulent Financial Schemes
13. Hate Speech and Slurs (race, religion, sexual orientation, gender identity, disability, national origin, caste, disease, age, veteran status)

Respond ONLY with JSON: {"flagged": true/false, "reason": "brief explanation", "category": "category name", "severity": "low|medium|high|critical"}
- severity "critical" = slurs, illegal activity, threats → should result in ban
- severity "high" = harassment, explicit content, doxxing
- severity "medium" = spam, misinformation
- severity "low" = mild issues
Only flag genuinely harmful content.`,
            },
            { role: 'user', content: `Analyze: "${content.substring(0, 1000)}"` },
          ],
          max_tokens: 200,
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
          aiCategory = String(parsed.category || '').substring(0, 100);
          aiSeverity = String(parsed.severity || 'low').substring(0, 20);
        } catch { /* ignore parse errors */ }
      }
    } catch (e) {
      console.error('AI moderation error:', e);
    }

    const isFlagged = slurCheck.found || swearCheck.found || aiFlag;
    // Auto-ban if slurs detected OR AI flags critical severity (illegal activity, threats, etc.)
    const shouldAutoBan = slurCheck.found || aiSeverity === 'critical';

    if (isFlagged) {
      let reason = '';
      if (slurCheck.found) {
        reason = `Slurs detected: ${slurCheck.words.join(', ')}`;
      } else if (swearCheck.found) {
        reason = `Profanity detected: ${swearCheck.words.join(', ')}`;
      }
      if (aiFlag) {
        reason += (reason ? '. ' : '') + `AI [${aiCategory}]: ${aiReason}`;
      }

      // Insert moderation report
      await supabase.from('moderation_reports').insert({
        message_id: messageId || null,
        channel_id: channelId || null,
        reported_user_id: userId,
        reporter_type: 'auto',
        reason: reason.substring(0, 1000),
        flagged_content: content.substring(0, 4000),
      });

      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).single();

      // Auto-ban for slurs or critical illegal activity (pending review)
      if (shouldAutoBan) {
        // Create pending ban (user stays active until admin reviews)
        await supabase.from('bans').insert({
          banned_user_id: userId,
          banned_by: '00000000-0000-0000-0000-000000000000', // system-generated
          reason: `Auto-flagged: ${reason}`.substring(0, 1000),
          status: 'pending',
        });

        // Send ban notification email
        if (RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'SyncUp <onboarding@resend.dev>',
              to: ADMIN_EMAIL,
              subject: `🚨 AUTO-BAN: ${String(profile?.full_name || 'Unknown').substring(0, 50)}`,
              html: `
                <h2>Automatic Ban Applied (Pending Review)</h2>
                <p><strong>User:</strong> ${String(profile?.full_name || 'Unknown').substring(0, 100)}</p>
                <p><strong>Source:</strong> ${String(source || 'unknown').substring(0, 50)}</p>
                <p><strong>Reason:</strong> ${reason.substring(0, 500)}</p>
                <p><strong>Content:</strong> ${content.substring(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                <p><strong>Time:</strong> ${new Date().toISOString()}</p>
                <p>Please review this ban in the Admin Dashboard.</p>
              `,
            }),
          });
        }
      } else {
        // Just send a flag notification for non-critical content
        if (RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'SyncUp <onboarding@resend.dev>',
              to: ADMIN_EMAIL,
              subject: `⚠️ Content Flagged [${String(source || 'unknown').substring(0, 20)}]`,
              html: `
                <h2>Content Moderation Alert</h2>
                <p><strong>User:</strong> ${String(profile?.full_name || 'Unknown').substring(0, 100)}</p>
                <p><strong>Source:</strong> ${String(source || 'unknown').substring(0, 50)}</p>
                <p><strong>Category:</strong> ${aiCategory || 'profanity'}</p>
                <p><strong>Reason:</strong> ${reason.substring(0, 500)}</p>
                <p><strong>Time:</strong> ${new Date().toISOString()}</p>
              `,
            }),
          });
        }
      }
    }

    return new Response(JSON.stringify({ flagged: isFlagged, banned: shouldAutoBan && isFlagged }), {
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
