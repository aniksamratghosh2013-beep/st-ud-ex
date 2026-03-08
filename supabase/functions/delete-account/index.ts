import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create a client with the user's token to verify identity
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Use service role to delete all user data
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Delete in order to respect foreign keys
    // 1. Chat messages by user
    await adminClient.from("chat_messages").delete().eq("user_id", userId);

    // 2. Direct messages
    await adminClient.from("direct_messages").delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    // 3. Meeting participants
    await adminClient.from("meeting_participants").delete().eq("user_id", userId);

    // 4. Meeting polls created by user
    await adminClient.from("meeting_polls").delete().eq("created_by", userId);

    // 5. Meeting recordings
    await adminClient.from("meeting_recordings").delete().eq("recorded_by", userId);

    // 6. Meetings created by user
    await adminClient.from("meetings").delete().eq("created_by", userId);

    // 7. Posts
    await adminClient.from("posts").delete().eq("user_id", userId);

    // 8. Activity logs
    await adminClient.from("activity_logs").delete().eq("user_id", userId);

    // 9. Organization follows created by user
    await adminClient.from("organization_follows").delete().eq("created_by", userId);

    // 10. Follows (personal)
    await adminClient.from("follows").delete().or(`follower_id.eq.${userId},following_id.eq.${userId}`);

    // 11. Organization events created by user
    await adminClient.from("organization_events").delete().eq("created_by", userId);

    // 12. User roles
    await adminClient.from("user_roles").delete().eq("user_id", userId);

    // 13. Organization memberships
    await adminClient.from("organization_memberships").delete().eq("user_id", userId);

    // 14. Bans referencing user
    await adminClient.from("bans").delete().eq("banned_user_id", userId);
    await adminClient.from("bans").delete().eq("banned_by", userId);

    // 15. Moderation reports
    await adminClient.from("moderation_reports").delete().eq("reported_user_id", userId);

    // 16. Organizations created by user (and their dependent data)
    const { data: userOrgs } = await adminClient.from("organizations").select("id").eq("created_by", userId);
    if (userOrgs) {
      for (const org of userOrgs) {
        await adminClient.from("chat_messages").delete().in("channel_id",
          (await adminClient.from("chat_channels").select("id").eq("organization_id", org.id)).data?.map(c => c.id) || []
        );
        await adminClient.from("chat_channels").delete().eq("organization_id", org.id);
        await adminClient.from("organization_events").delete().eq("organization_id", org.id);
        await adminClient.from("organization_follows").delete().or(`follower_org_id.eq.${org.id},following_org_id.eq.${org.id}`);
        await adminClient.from("posts").delete().eq("organization_id", org.id);
        await adminClient.from("user_roles").delete().eq("organization_id", org.id);
        await adminClient.from("organization_memberships").delete().eq("organization_id", org.id);
        await adminClient.from("activity_logs").delete().eq("organization_id", org.id);
        await adminClient.from("meetings").delete().eq("organization_id", org.id);
        await adminClient.from("organizations").delete().eq("id", org.id);
      }
    }

    // 17. Profile
    await adminClient.from("profiles").delete().eq("id", userId);

    // 18. Delete the auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete account" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Delete account error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
