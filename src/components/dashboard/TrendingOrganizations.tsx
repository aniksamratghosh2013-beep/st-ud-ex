import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Users, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { sanitizeError } from "@/lib/sanitize-error";

interface TrendingOrg {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  member_count: number;
}

export default function TrendingOrganizations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [trending, setTrending] = useState<TrendingOrg[]>([]);
  const [myMemberships, setMyMemberships] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchTrending = async () => {
      // Get all public orgs
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name, description, logo_url")
        .eq("is_public", true)
        .eq("is_banned", false);

      if (!orgs?.length) { setLoading(false); return; }

      // Get membership counts
      const { data: memberships } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("status", "approved");

      const countMap: Record<string, number> = {};
      (memberships || []).forEach((m) => {
        countMap[m.organization_id] = (countMap[m.organization_id] || 0) + 1;
      });

      const withCounts: TrendingOrg[] = orgs.map((org) => ({
        ...org,
        member_count: countMap[org.id] || 0,
      }));

      // Sort by member count desc, take top 5
      withCounts.sort((a, b) => b.member_count - a.member_count);
      setTrending(withCounts.slice(0, 5));

      // Get user's memberships
      const { data: myMems } = await supabase
        .from("organization_memberships")
        .select("organization_id, status")
        .eq("user_id", user.id);

      const map: Record<string, string> = {};
      (myMems || []).forEach((m) => { map[m.organization_id] = m.status; });
      setMyMemberships(map);

      setLoading(false);
    };

    fetchTrending();
  }, [user]);

  const handleJoin = async (orgId: string) => {
    if (!user) return;
    setJoiningId(orgId);
    const { error } = await supabase.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: user.id,
      status: "pending",
    });
    setJoiningId(null);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Join request sent!", description: "Waiting for admin approval." });
      setMyMemberships((prev) => ({ ...prev, [orgId]: "pending" }));
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!trending.length) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <TrendingUp className="h-5 w-5 text-primary" />
        <CardTitle className="text-lg">Trending Organizations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {trending.map((org, i) => (
          <motion.div
            key={org.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
            onClick={() => navigate(`/organizations/${org.id}`)}
          >
            <span className="text-sm font-bold text-muted-foreground w-5 text-center">
              {i + 1}
            </span>
            <Avatar className="h-9 w-9">
              <AvatarImage src={org.logo_url || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {org.name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{org.name}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{org.member_count} member{org.member_count !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              {myMemberships[org.id] === "approved" ? (
                <Button size="sm" variant="secondary" className="h-7 text-xs px-3">Subscribed</Button>
              ) : myMemberships[org.id] === "pending" ? (
                <Badge variant="outline" className="text-xs">Pending</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-3"
                  disabled={joiningId === org.id}
                  onClick={() => handleJoin(org.id)}
                >
                  {joiningId === org.id ? "..." : "Subscribe"}
                </Button>
              )}
            </div>
          </motion.div>
        ))}
        <Button
          variant="ghost"
          className="w-full text-sm text-muted-foreground mt-1"
          onClick={() => navigate("/organizations")}
        >
          View all organizations <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
