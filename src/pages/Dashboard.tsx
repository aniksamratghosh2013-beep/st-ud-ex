import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TrendingOrganizations from "@/components/dashboard/TrendingOrganizations";
import type { Tables } from "@/integrations/supabase/types";

interface ConnectionProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orgCount, setOrgCount] = useState(0);
  const [connectionCount, setConnectionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Expanded card data
  const [myOrgs, setMyOrgs] = useState<Tables<"organizations">[]>([]);
  const [connections, setConnections] = useState<ConnectionProfile[]>([]);
  const [loadingExpanded, setLoadingExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const { count: orgs } = await supabase
        .from("organization_memberships")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "approved");

      setOrgCount(orgs ?? 0);

      // Count unique connections (people in same orgs)
      const { data: myMemberships } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "approved");

      if (myMemberships?.length) {
        const orgIds = myMemberships.map(m => m.organization_id);
        const { count } = await supabase
          .from("organization_memberships")
          .select("user_id", { count: "exact", head: true })
          .in("organization_id", orgIds)
          .eq("status", "approved")
          .neq("user_id", user.id);
        setConnectionCount(count ?? 0);
      }

      setLoading(false);
    };

    fetchStats();
  }, [user]);

  const handleCardClick = async (cardKey: string) => {
    if (expandedCard === cardKey) {
      setExpandedCard(null);
      return;
    }
    setExpandedCard(cardKey);
    setLoadingExpanded(true);

    if (cardKey === "orgs" && user) {
      const { data: memberships } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "approved");

      if (memberships?.length) {
        const orgIds = memberships.map(m => m.organization_id);
        const { data } = await supabase
          .from("organizations")
          .select("*")
          .in("id", orgIds);
        setMyOrgs(data || []);
      } else {
        setMyOrgs([]);
      }
    }

    if (cardKey === "connections" && user) {
      const { data: myMemberships } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "approved");

      if (myMemberships?.length) {
        const orgIds = myMemberships.map(m => m.organization_id);
        const { data: otherMembers } = await supabase
          .from("organization_memberships")
          .select("user_id")
          .in("organization_id", orgIds)
          .eq("status", "approved")
          .neq("user_id", user.id);

        const uniqueIds = [...new Set(otherMembers?.map(m => m.user_id) || [])];
        if (uniqueIds.length) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", uniqueIds);
          setConnections(profiles || []);
        } else {
          setConnections([]);
        }
      } else {
        setConnections([]);
      }
    }

    setLoadingExpanded(false);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const cards = [
    { key: "orgs", title: "My Organizations", value: orgCount, desc: "Active memberships", icon: Building2 },
    { key: "connections", title: "Connections", value: connectionCount, desc: "Team members", icon: Users },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">
          {greeting()}, {user?.user_metadata?.full_name || "there"}
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening across your organizations.</p>
      </motion.div>

      <div className="grid gap-4 grid-cols-2">
        {cards.map((card, i) => (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card
              className={`cursor-pointer hover:shadow-md transition-shadow ${expandedCard === card.key ? "ring-2 ring-primary" : ""}`}
              onClick={() => handleCardClick(card.key)}
            >
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

      <AnimatePresence mode="wait">
        {expandedCard && (
          <motion.div
            key={expandedCard}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              <CardContent className="pt-4">
                {loadingExpanded ? (
                  <div className="flex justify-center py-6">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : expandedCard === "orgs" ? (
                  myOrgs.length > 0 ? (
                    <div className="space-y-2">
                      {myOrgs.map(org => (
                        <div
                          key={org.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/organizations/${org.id}`)}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={org.logo_url || ""} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                              {org.name[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium truncate">{org.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">You haven't subscribed to any organizations yet.</p>
                  )
                ) : (
                  connections.length > 0 ? (
                    <div className="space-y-2">
                      {connections.map(c => (
                        <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={c.avatar_url || ""} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                              {c.full_name?.[0]?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium truncate">{c.full_name || "Unknown"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No connections yet. Subscribe to organizations to connect with others.</p>
                  )
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <TrendingOrganizations />
    </div>
  );
}
