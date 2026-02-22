import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Video, Plus, Users, Calendar, Play } from "lucide-react";
import { motion } from "framer-motion";

export default function Meetings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [orgId, setOrgId] = useState<string>("none");
  const [maxParticipants, setMaxParticipants] = useState(100);

  const { data: meetings, isLoading } = useQuery({
    queryKey: ["meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: orgs } = useQuery({
    queryKey: ["user-orgs-for-meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_memberships")
        .select("organization_id, organizations(id, name)")
        .eq("user_id", user!.id)
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const createMeeting = useMutation({
    mutationFn: async () => {
      const roomName = `syncup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { error } = await supabase.from("meetings").insert({
        title,
        description: description || null,
        organization_id: orgId === "none" ? null : orgId,
        created_by: user!.id,
        room_name: roomName,
        max_participants: maxParticipants,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      setOpen(false);
      setTitle("");
      setDescription("");
      setOrgId("none");
      toast({ title: "Meeting created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "active": return "default";
      case "ended": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">Meetings</h1>
          <p className="text-muted-foreground mt-1">Create and join video calls</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New Meeting</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Meeting</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly Standup" />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Meeting agenda..." />
              </div>
              <div>
                <Label>Organization (optional)</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger><SelectValue placeholder="Personal meeting" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Personal</SelectItem>
                    {orgs?.map((o: any) => (
                      <SelectItem key={o.organization_id} value={o.organization_id}>
                        {o.organizations?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Max Participants</Label>
                <Input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(Number(e.target.value))} min={2} max={1000} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMeeting.mutate()} disabled={!title.trim() || createMeeting.isPending}>
                {createMeeting.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !meetings?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Video className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No meetings yet. Create one to get started!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting: any, i: number) => (
            <motion.div key={meeting.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{meeting.title}</CardTitle>
                    <Badge variant={statusColor(meeting.status)}>{meeting.status}</Badge>
                  </div>
                  {meeting.description && (
                    <CardDescription className="line-clamp-2">{meeting.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{meeting.max_participants}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(meeting.created_at).toLocaleDateString()}</span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => navigate(`/meeting/${meeting.room_name}`)}
                    variant={meeting.status === "active" ? "default" : "outline"}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {meeting.status === "active" ? "Join" : meeting.status === "ended" ? "View" : "Start"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
