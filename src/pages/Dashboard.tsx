import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import TrendingOrganizations from "@/components/dashboard/TrendingOrganizations";

export default function Dashboard() {
  const { user } = useAuth();
  const [orgCount, setOrgCount] = useState(0);
  const [membershipCount, setMembershipCount] = useState(0);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    };

    fetchStats();
  }, [user]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const cards = [
    { title: "My Organizations", value: orgCount, desc: "Active memberships", icon: Building2 },
    { title: "Connections", value: membershipCount, desc: "Team members", icon: Users },
    { title: "Messages", value: "—", desc: "Check your chat", icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">
          {greeting()}, {user?.user_metadata?.full_name || "there"}
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening across your organizations.</p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{card.value}</div>
                )}
                <p className="text-xs text-muted-foreground">{card.desc}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <TrendingOrganizations />
    </div>
  );
}