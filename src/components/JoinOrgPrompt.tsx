import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";

export function JoinOrgPrompt({ feature }: { feature: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
      <Building2 className="h-12 w-12 text-muted-foreground" />
      <h2 className="text-xl font-semibold">Join an Organization</h2>
      <p className="text-muted-foreground max-w-md">
        You need to be a member of at least one organization to access {feature}.
      </p>
      <Button onClick={() => navigate("/organizations")}>
        Browse Organizations
      </Button>
    </div>
  );
}
