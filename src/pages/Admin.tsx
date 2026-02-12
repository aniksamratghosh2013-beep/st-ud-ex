import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, Shield } from "lucide-react";

export default function Admin() {
  const { user } = useAuth();
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalOrgs, setTotalOrgs] = useState(0);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchAdminData = async () => {
      // Check if super admin
      const { data: saCheck } = await supabase.rpc("is_super_admin", { _user_id: user.id });
      setIsSuperAdmin(saCheck === true);

      // Get counts
      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      setTotalUsers(userCount ?? 0);

      const { count: orgCount } = await supabase
        .from("organizations")
        .select("*", { count: "exact", head: true });
      setTotalOrgs(orgCount ?? 0);

      setLoading(false);
    };

    fetchAdminData();
  }, [user]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">Admin Dashboard</h1>
      </div>

      {!isSuperAdmin && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>You don't have super admin privileges.</p>
            <p className="text-sm mt-1">Contact a super admin to gain access.</p>
          </CardContent>
        </Card>
      )}

      {isSuperAdmin && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalOrgs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Status</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">Active</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
