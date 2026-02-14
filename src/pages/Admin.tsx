import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Building2, Shield, Ban, AlertTriangle, CheckCircle, XCircle, UserPlus } from "lucide-react";
import type { Tables, Enums } from "@/integrations/supabase/types";

interface BanRow {
  id: string;
  banned_user_id: string | null;
  banned_org_id: string | null;
  banned_by: string;
  reason: string;
  status: string;
  reviewed_at: string | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  message_id: string | null;
  channel_id: string | null;
  reported_user_id: string | null;
  reporter_type: string;
  reason: string;
  flagged_content: string | null;
  status: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_banned?: boolean;
}

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalOrgs, setTotalOrgs] = useState(0);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [orgs, setOrgs] = useState<Tables<"organizations">[]>([]);
  const [bans, setBans] = useState<BanRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [banReason, setBanReason] = useState("");
  const [banTarget, setBanTarget] = useState<{ type: "user" | "org"; id: string; name: string } | null>(null);

  const fetchAll = async () => {
    if (!user) return;
    const { data: saCheck } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    setIsSuperAdmin(saCheck === true);
    if (saCheck !== true) { setLoading(false); return; }

    // Use raw queries for new tables not yet in generated types
    const [usersRes, orgsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url"),
      supabase.from("organizations").select("*"),
    ]);

    // Fetch bans and reports via rpc-style or cast
    const bansRes = await (supabase as any).from("bans").select("*").order("created_at", { ascending: false });
    const reportsRes = await (supabase as any).from("moderation_reports").select("*").order("created_at", { ascending: false }).limit(50);

    setUsers((usersRes.data as ProfileRow[]) || []);
    setOrgs(orgsRes.data || []);
    setBans((bansRes.data as BanRow[]) || []);
    setReports((reportsRes.data as ReportRow[]) || []);
    setTotalUsers(usersRes.data?.length || 0);
    setTotalOrgs(orgsRes.data?.length || 0);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [user]);

  const handleBan = async () => {
    if (!banTarget || !banReason.trim() || !user) return;
    const payload: any = { banned_by: user.id, reason: banReason.trim(), status: "pending" };
    if (banTarget.type === "user") payload.banned_user_id = banTarget.id;
    else payload.banned_org_id = banTarget.id;

    const { data: ban, error } = await (supabase as any).from("bans").insert(payload).select().single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.functions.invoke("notify-admin", {
      body: {
        type: "ban_request",
        data: {
          targetName: banTarget.name,
          targetType: banTarget.type,
          bannedByName: "Admin",
          reason: banReason.trim(),
          banId: ban.id,
        },
      },
    });

    toast({ title: "Ban submitted for review" });
    setBanReason("");
    setBanTarget(null);
    fetchAll();
  };

  const handleApproveBan = async (banId: string) => {
    const ban = bans.find(b => b.id === banId);
    if (!ban) return;

    await (supabase as any).from("bans").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", banId);

    if (ban.banned_user_id) {
      await (supabase as any).from("profiles").update({ is_banned: true, ban_reason: ban.reason }).eq("id", ban.banned_user_id);
    }
    if (ban.banned_org_id) {
      await (supabase as any).from("organizations").update({ is_banned: true, ban_reason: ban.reason }).eq("id", ban.banned_org_id);
    }

    toast({ title: "Ban approved" });
    fetchAll();
  };

  const handleRevokeBan = async (banId: string) => {
    const ban = bans.find(b => b.id === banId);
    if (!ban) return;

    await (supabase as any).from("bans").update({ status: "revoked", reviewed_at: new Date().toISOString() }).eq("id", banId);

    if (ban.banned_user_id) {
      await (supabase as any).from("profiles").update({ is_banned: false, ban_reason: null }).eq("id", ban.banned_user_id);
    }
    if (ban.banned_org_id) {
      await (supabase as any).from("organizations").update({ is_banned: false, ban_reason: null }).eq("id", ban.banned_org_id);
    }

    toast({ title: "Ban revoked" });
    fetchAll();
  };

  const handleAssignMinorAdmin = async (userId: string) => {
    if (!user) return;
    // Ensure Admin HQ org exists
    let { data: adminOrg } = await supabase.from("organizations").select("id").eq("name", "Admin HQ").single();

    if (!adminOrg) {
      const { data: newOrg } = await supabase.from("organizations").insert({
        name: "Admin HQ",
        description: "Private organization for platform administrators",
        created_by: user.id,
        is_public: false,
      }).select().single();
      adminOrg = newOrg;
    }

    if (!adminOrg) { toast({ title: "Error creating Admin HQ", variant: "destructive" }); return; }

    // Add user to Admin HQ as approved member
    await supabase.from("organization_memberships").insert({
      organization_id: adminOrg.id,
      user_id: userId,
      status: "approved" as Enums<"membership_status">,
    });

    // Assign org_admin role for Admin HQ
    await supabase.from("user_roles").insert({
      user_id: userId,
      organization_id: adminOrg.id,
      role: "org_admin" as Enums<"app_role">,
    });

    // Notify main admin
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    await supabase.functions.invoke("notify-admin", {
      body: {
        type: "activity",
        data: { userName: profile?.full_name || userId, actionType: "Minor Admin Assigned", details: { userId } },
      },
    });

    toast({ title: "Minor admin assigned to Admin HQ!" });
    fetchAll();
  };

  const handleJoinOrg = async (orgId: string) => {
    if (!user) return;
    await supabase.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: user.id,
      status: "approved" as Enums<"membership_status">,
    });
    toast({ title: "Joined organization" });
  };

  const handleRenameOrg = async (orgId: string, newName: string) => {
    await supabase.from("organizations").update({ name: newName }).eq("id", orgId);
    toast({ title: "Organization renamed" });
    fetchAll();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>;
  }

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Shield className="h-8 w-8 mx-auto mb-2" />
          <p>You don't have super admin privileges.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">Admin Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalUsers}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalOrgs}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Bans</CardTitle>
            <Ban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{bans.filter(b => b.status === "pending").length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged Content</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{reports.filter(r => r.status === "pending").length}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="bans">
        <TabsList>
          <TabsTrigger value="bans">Bans</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="orgs">Organizations</TabsTrigger>
          <TabsTrigger value="reports">Moderation</TabsTrigger>
          <TabsTrigger value="admins">Manage Admins</TabsTrigger>
        </TabsList>

        <TabsContent value="bans" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ban Review Queue</CardTitle>
              <CardDescription>Approve or revoke pending bans</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bans.filter(b => b.status === "pending").length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No pending bans.</p>
              )}
              {bans.filter(b => b.status === "pending").map(ban => (
                <div key={ban.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">
                      {ban.banned_user_id ? `User ban` : `Org ban`}
                    </p>
                    <p className="text-xs text-muted-foreground">{ban.reason}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleApproveBan(ban.id)}>
                      <CheckCircle className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleRevokeBan(ban.id)}>
                      <XCircle className="h-3 w-3 mr-1" /> Revoke
                    </Button>
                  </div>
                </div>
              ))}
              {bans.filter(b => b.status !== "pending").length > 0 && (
                <>
                  <h4 className="text-sm font-medium mt-4">History</h4>
                  {bans.filter(b => b.status !== "pending").map(ban => (
                    <div key={ban.id} className="flex items-center justify-between p-2 text-sm">
                      <span>{ban.reason?.substring(0, 60)}</span>
                      <Badge variant={ban.status === "approved" ? "destructive" : "secondary"}>{ban.status}</Badge>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>All Users</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={u.avatar_url || ""} />
                      <AvatarFallback className="text-xs">{u.full_name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{u.full_name || "Unknown"}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleAssignMinorAdmin(u.id)}>
                      <UserPlus className="h-3 w-3 mr-1" /> Make Admin
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setBanTarget({ type: "user", id: u.id, name: u.full_name || "Unknown" })}>
                      <Ban className="h-3 w-3 mr-1" /> Ban
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orgs" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>All Organizations</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {orgs.map(org => (
                <div key={org.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                  <span className="text-sm font-medium">{org.name}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleJoinOrg(org.id)}>Join</Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">Rename</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Rename Organization</DialogTitle></DialogHeader>
                        <form onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          handleRenameOrg(org.id, fd.get("name") as string);
                        }} className="space-y-4">
                          <Input name="name" defaultValue={org.name} />
                          <Button type="submit">Save</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="destructive" onClick={() => setBanTarget({ type: "org", id: org.id, name: org.name })}>
                      <Ban className="h-3 w-3 mr-1" /> Ban
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flagged Content</CardTitle>
              <CardDescription>Auto-detected swear words and AI-flagged content</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {reports.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No reports yet.</p>}
              {reports.map(r => (
                <div key={r.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.reporter_type === "auto" ? "secondary" : "outline"}>{r.reporter_type}</Badge>
                    <Badge variant={r.status === "pending" ? "destructive" : "secondary"}>{r.status}</Badge>
                  </div>
                  <p className="text-sm"><strong>Reason:</strong> {r.reason}</p>
                  {r.flagged_content && <p className="text-xs text-muted-foreground">Content: {r.flagged_content.substring(0, 100)}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admins" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Manage Minor Admins</CardTitle>
              <CardDescription>Promote users to minor admin via the Users tab. They get added to the private "Admin HQ" organization.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Minor admins can join any org, rename orgs, and submit bans (subject to your approval via email).
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {banTarget && (
        <Dialog open={!!banTarget} onOpenChange={() => setBanTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ban {banTarget.type === "user" ? "User" : "Organization"}: {banTarget.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="Reason for ban..."
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
              />
              <Button onClick={handleBan} disabled={!banReason.trim()} className="w-full" variant="destructive">
                Submit Ban for Review
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
