import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useHasOrganization() {
  const { user } = useAuth();
  const [hasOrg, setHasOrg] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setHasOrg(false);
      return;
    }
    const check = async () => {
      const { count } = await supabase
        .from("organization_memberships")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "approved");
      setHasOrg((count ?? 0) > 0);
    };
    check();
  }, [user]);

  return hasOrg;
}
