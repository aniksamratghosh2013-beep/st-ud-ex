import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const [orgCount, setOrgCount] = useState(0);
  const [membershipCount, setMembershipCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const { count: orgs } = await supabase
        .from("organization_memberships")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "approved");

      setOrgCount(orgs ?? 0);
      setMembershipCount(orgs ?? 0);
    };

    fetchStats();
  }, [user]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">
          {greeting()}, {user?.user_metadata?.full_name || "there"}
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening across your organizations.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orgCount}</div>
            <p className="text-xs text-muted-foreground">Active memberships</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connections</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{membershipCount}</div>
            <p className="text-xs text-muted-foreground">Team members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Coming in Phase 2</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
