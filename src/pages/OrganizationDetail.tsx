import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, X, UserMinus, Shield, Pencil, Camera } from "lucide-react";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { sanitizeError } from "@/lib/sanitize-error";

interface MemberWithProfile {
  id: string;
  user_id: string;
  status: Enums<"membership_status">;
  profile: Tables<"profiles"> | null;
  role: Enums<"app_role"> | null;
}

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [org, setOrg] = useState<Tables<"organizations"> | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isFounder, setIsFounder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState("");

  const canManage = isAdmin || isSuperAdmin;

  const fetchData = async () => {
    if (!id) return;

    const { data: orgData } = await supabase.from("organizations").select("*").eq("id", id).single();
    setOrg(orgData);
    setBioText(orgData?.description || "");

    const { data: memberships } = await supabase
      .from("organization_memberships")
      .select("id, user_id, status")
      .eq("organization_id", id);

    if (memberships) {
      const memberData: MemberWithProfile[] = [];
      for (const m of memberships) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", m.user_id).single();
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", m.user_id)
          .eq("organization_id", id);

        memberData.push({
          ...m,
          profile,
          role: roles?.[0]?.role ?? null,
        });
      }
      setMembers(memberData);
    }

    if (user) {
      const [{ data: adminCheck }, { data: superCheck }] = await Promise.all([
        supabase.rpc("is_org_admin", { _user_id: user.id, _org_id: id }),
        supabase.rpc("is_super_admin", { _user_id: user.id }),
      ]);
      setIsAdmin(adminCheck === true);
      setIsSuperAdmin(superCheck === true);
      setIsFounder(orgData?.created_by === user.id);
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id, user]);

  const handleMembership = async (membershipId: string, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("organization_memberships")
      .update({ status })
      .eq("id", membershipId);

    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      if (status === "approved") {
        const membership = members.find((m) => m.id === membershipId);
        if (membership && id) {
          await supabase.from("user_roles").insert({
            user_id: membership.user_id,
            organization_id: id,
            role: "member" as Enums<"app_role">,
          });
        }
      }
      toast({ title: `Member ${status}` });
      fetchData();
    }
  };

  const handleRoleChange = async (userId: string, newRole: Enums<"app_role">) => {
    if (!id) return;
    const member = members.find(m => m.user_id === userId && m.status === 'approved');
    if (!member) {
      toast({ title: "Error", description: "User must be an approved member", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("user_roles")
      .upsert(
        { user_id: userId, organization_id: id, role: newRole },
        { onConflict: 'user_id,organization_id' }
      );
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Role updated" });
    }
    fetchData();
  };

  const handleRemove = async (userId: string) => {
    if (!id) return;
    await supabase.from("organization_memberships").delete().eq("user_id", userId).eq("organization_id", id);
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("organization_id", id);
    toast({ title: "Member removed" });
    fetchData();
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const filePath = `${id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("org-logos")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Upload failed", description: sanitizeError(uploadError), variant: "destructive" });
      return;
    }

    const { data: urlData } = supabase.storage.from("org-logos").getPublicUrl(filePath);
    await supabase.from("organizations").update({ logo_url: urlData.publicUrl }).eq("id", id);
    setOrg((o) => o ? { ...o, logo_url: urlData.publicUrl } : o);
    toast({ title: "Logo updated" });
  };

  const handleSaveBio = async () => {
    if (!id) return;
    const { error } = await supabase
      .from("organizations")
      .update({ description: bioText.trim().substring(0, 2000) })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Organization bio updated" });
      setEditingBio(false);
      fetchData();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>;
  }

  if (!org) {
    return <div className="text-center py-12 text-muted-foreground">Organization not found.</div>;
  }

  const pendingMembers = members.filter((m) => m.status === "pending");
  const approvedMembers = members.filter((m) => m.status === "approved");
  const canEditBio = isFounder || isAdmin || isSuperAdmin;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="relative">
          <Avatar className="h-16 w-16">
            <AvatarImage src={org.logo_url || ""} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">
              {org.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {canEditBio && (
            <label className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
              <Camera className="h-3.5 w-3.5" />
              <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
            </label>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">{org.name}</h1>
          {editingBio ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={bioText}
                onChange={(e) => setBioText(e.target.value)}
                placeholder="Write a bio for this organization..."
                className="min-h-[100px] resize-none"
                maxLength={2000}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveBio}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditingBio(false); setBioText(org.description || ""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 mt-1">
              <p className="text-muted-foreground whitespace-pre-wrap">{org.description || "No description"}</p>
              {canEditBio && (
                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditingBio(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pending Requests */}
      {canManage && pendingMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Pending Requests ({pendingMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingMembers.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={m.profile?.avatar_url || ""} />
                    <AvatarFallback className="text-xs">{m.profile?.full_name?.[0] || "?"}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{m.profile?.full_name || "Unknown"}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleMembership(m.id, "approved")}>
                    <Check className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleMembership(m.id, "rejected")}>
                    <X className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members ({approvedMembers.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {approvedMembers.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={m.profile?.avatar_url || ""} />
                  <AvatarFallback className="text-xs">{m.profile?.full_name?.[0] || "?"}</AvatarFallback>
                </Avatar>
                <div>
                  <span className="text-sm font-medium">{m.profile?.full_name || "Unknown"}</span>
                  <Badge variant="outline" className="ml-2 text-xs">{m.role === "founder" ? "🏆 Founder" : m.role || "member"}</Badge>
                </div>
              </div>
              {canManage && m.user_id !== user?.id && (
                <div className="flex items-center gap-2">
                  <Select
                    value={m.role || "member"}
                    onValueChange={(v) => handleRoleChange(m.user_id, v as Enums<"app_role">)}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="org_admin">Admin</SelectItem>
                      {(isFounder || isSuperAdmin) && <SelectItem value="founder">Founder</SelectItem>}
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleRemove(m.user_id)}>
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {approvedMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No members yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
