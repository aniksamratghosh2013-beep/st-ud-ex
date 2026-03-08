import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";
import { sanitizeError } from "@/lib/sanitize-error";

export default function Organizations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Tables<"organizations">[]>([]);
  const [myMemberships, setMyMemberships] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchOrgs = async () => {
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false });
    setOrgs(data || []);

    if (user) {
      const { data: memberships } = await supabase
        .from("organization_memberships")
        .select("organization_id, status")
        .eq("user_id", user.id);

      const map: Record<string, string> = {};
      memberships?.forEach((m) => { map[m.organization_id] = m.status; });
      setMyMemberships(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchOrgs(); }, [user]);

  const getWordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  const handleCreate = async () => {
    if (!user || !newName.trim()) return;
    const descWordCount = getWordCount(newDesc);
    if (descWordCount < 40) {
      toast({ title: "Too short", description: `Description must be at least 40 words. Current: ${descWordCount} words.`, variant: "destructive" });
      return;
    }
    if (descWordCount > 100) {
      toast({ title: "Too long", description: `Description must be at most 100 words. Current: ${descWordCount} words.`, variant: "destructive" });
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("organizations").insert({
      name: newName.trim(),
      description: newDesc.trim() || null,
      created_by: user.id,
    });
    setCreating(false);

    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Organization created!" });
      setNewName("");
      setNewDesc("");
      setDialogOpen(false);
      fetchOrgs();
    }
  };

  const handleSubscribe = async (orgId: string) => {
    if (!user) return;
    const { error } = await supabase.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: user.id,
      status: "pending",
    });

    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Subscription request sent", description: "Waiting for admin approval." });
      fetchOrgs();
    }
  };

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">Organizations</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>Start a new team, club, or community.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Organization" />
              </div>
              <div className="space-y-2">
                <Label>Description (40–100 words)</Label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Tell us what your organization is dedicated to, and mention the instagram account ☺︎" />
                <span className={`text-xs ${(() => { const wc = getWordCount(newDesc); return wc > 0 && (wc < 40 || wc > 100) ? 'text-destructive' : 'text-muted-foreground'; })()}`}>
                  {getWordCount(newDesc)} / 40–100 words
                </span>
              </div>
              <Button onClick={handleCreate} disabled={creating || !newName.trim() || getWordCount(newDesc) < 40 || getWordCount(newDesc) > 100} className="w-full">
                {creating ? "Creating..." : "Create Organization"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search organizations..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((org) => (
          <Card key={org.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/organizations/${org.id}`)}>
            <CardHeader className="flex flex-row items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={org.logo_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                  {org.name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">{org.name}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                {myMemberships[org.id] === "approved" ? (
                  <Badge>Subscribed</Badge>
                ) : myMemberships[org.id] === "pending" ? (
                  <Badge variant="secondary">Pending</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); handleSubscribe(org.id); }}
                  >
                    Subscribe
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No organizations found.</p>
        </div>
      )}
    </div>
  );
}
