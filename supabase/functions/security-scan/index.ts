import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate: require secret header OR super_admin JWT
  const scanSecret = req.headers.get("x-scan-secret");
  const expectedSecret = Deno.env.get("SCAN_SECRET");

  if (scanSecret && expectedSecret && scanSecret === expectedSecret) {
    // Trusted caller (cron job) — proceed
  } else {
    // Fall back to JWT + super_admin check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: isAdmin } = await serviceClient.rpc("is_super_admin", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const scanResults: { check: string; status: string; details: string }[] = [];

    // 1. Check for banned users still active
    const { data: bannedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_banned", true);
    scanResults.push({
      check: "banned_users_audit",
      status: (bannedProfiles?.length || 0) > 0 ? "warning" : "pass",
      details: `${bannedProfiles?.length || 0} banned user(s) found`,
    });

    // 2. Check for banned organizations
    const { data: bannedOrgs } = await supabase
      .from("organizations")
      .select("id")
      .eq("is_banned", true);
    scanResults.push({
      check: "banned_orgs_audit",
      status: (bannedOrgs?.length || 0) > 0 ? "warning" : "pass",
      details: `${bannedOrgs?.length || 0} banned org(s) found`,
    });

    // 3. Check for pending moderation reports
    const { count: pendingReports } = await supabase
      .from("moderation_reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    scanResults.push({
      check: "pending_moderation",
      status: (pendingReports || 0) > 10 ? "warning" : "pass",
      details: `${pendingReports || 0} pending moderation report(s)`,
    });

    // 4. Check for orphaned memberships (orgs that don't exist)
    const { data: allOrgs } = await supabase.from("organizations").select("id");
    const orgIds = new Set((allOrgs || []).map((o) => o.id));
    const { data: memberships } = await supabase.from("organization_memberships").select("id, organization_id");
    const orphaned = (memberships || []).filter((m) => !orgIds.has(m.organization_id));
    scanResults.push({
      check: "orphaned_memberships",
      status: orphaned.length > 0 ? "warning" : "pass",
      details: `${orphaned.length} orphaned membership(s)`,
    });

    // 5. Check for excessive failed login patterns (activity logs)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentActivity } = await supabase
      .from("activity_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneHourAgo);
    scanResults.push({
      check: "activity_volume",
      status: (recentActivity || 0) > 500 ? "warning" : "pass",
      details: `${recentActivity || 0} activity log(s) in last hour`,
    });

    // 6. Check for users with no profile (data integrity)
    const { data: roles } = await supabase.from("user_roles").select("user_id");
    const roleUserIds = [...new Set((roles || []).map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .in("id", roleUserIds.length > 0 ? roleUserIds : ["00000000-0000-0000-0000-000000000000"]);
    const profileIds = new Set((profiles || []).map((p) => p.id));
    const missingProfiles = roleUserIds.filter((id) => !profileIds.has(id));
    scanResults.push({
      check: "missing_profiles",
      status: missingProfiles.length > 0 ? "warning" : "pass",
      details: `${missingProfiles.length} user(s) with roles but no profile`,
    });

    // 7. Check for suspicious large message volume from single user
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("user_id")
      .gte("created_at", oneHourAgo);
    const msgCountByUser: Record<string, number> = {};
    (recentMessages || []).forEach((m) => {
      msgCountByUser[m.user_id] = (msgCountByUser[m.user_id] || 0) + 1;
    });
    const spamUsers = Object.entries(msgCountByUser).filter(([, c]) => c > 100);
    scanResults.push({
      check: "spam_detection",
      status: spamUsers.length > 0 ? "critical" : "pass",
      details: `${spamUsers.length} user(s) sent >100 messages in last hour`,
    });

    // 8. Check for pending bans
    const { count: pendingBans } = await supabase
      .from("bans")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    scanResults.push({
      check: "pending_bans",
      status: (pendingBans || 0) > 0 ? "info" : "pass",
      details: `${pendingBans || 0} pending ban(s) to review`,
    });

    // 9. Check for organizations with no members
    const { data: orgMemberships } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("status", "approved");
    const orgsWithMembers = new Set((orgMemberships || []).map((m) => m.organization_id));
    const emptyOrgs = (allOrgs || []).filter((o) => !orgsWithMembers.has(o.id));
    scanResults.push({
      check: "empty_organizations",
      status: emptyOrgs.length > 5 ? "info" : "pass",
      details: `${emptyOrgs.length} organization(s) with no approved members`,
    });

    // 10. Check direct message volume for abuse
    const { data: recentDMs } = await supabase
      .from("direct_messages")
      .select("sender_id")
      .gte("created_at", oneHourAgo);
    const dmCountByUser: Record<string, number> = {};
    (recentDMs || []).forEach((m) => {
      dmCountByUser[m.sender_id] = (dmCountByUser[m.sender_id] || 0) + 1;
    });
    const dmSpamUsers = Object.entries(dmCountByUser).filter(([, c]) => c > 50);
    scanResults.push({
      check: "dm_spam_detection",
      status: dmSpamUsers.length > 0 ? "critical" : "pass",
      details: `${dmSpamUsers.length} user(s) sent >50 DMs in last hour`,
    });

    // Log the scan result
    const overallStatus = scanResults.some((r) => r.status === "critical")
      ? "critical"
      : scanResults.some((r) => r.status === "warning")
        ? "warning"
        : "healthy";

    await supabase.from("activity_logs").insert({
      action_type: "security_scan",
      details: { scan_results: scanResults, overall: overallStatus, scanned_at: new Date().toISOString() },
    });

    return new Response(
      JSON.stringify({ success: true, overall: overallStatus, checks: scanResults.length, results: scanResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
