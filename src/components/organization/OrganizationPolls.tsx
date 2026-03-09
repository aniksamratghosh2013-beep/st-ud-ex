import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, BarChart3, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { sanitizeError } from "@/lib/sanitize-error";

interface OrgPoll {
  id: string;
  organization_id: string;
  created_by: string;
  question: string;
  options: string[];
  is_active: boolean;
  created_at: string;
}

interface PollVote {
  id: string;
  poll_id: string;
  user_id: string;
  option_index: number;
}

interface OrganizationPollsProps {
  organizationId: string;
  isAdmin: boolean;
}

export function OrganizationPolls({ organizationId, isAdmin }: OrganizationPollsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [polls, setPolls] = useState<OrgPoll[]>([]);
  const [votes, setVotes] = useState<Record<string, PollVote[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  const fetchPolls = async () => {
    const { data: pollsData } = await supabase
      .from("organization_polls")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    const typedPolls: OrgPoll[] = (pollsData || []).map((p: any) => ({
      ...p,
      options: Array.isArray(p.options) ? p.options : [],
    }));
    setPolls(typedPolls);

    // Fetch votes for all polls
    if (typedPolls.length > 0) {
      const pollIds = typedPolls.map((p) => p.id);
      const { data: votesData } = await supabase
        .from("organization_poll_votes")
        .select("*")
        .in("poll_id", pollIds);

      const grouped: Record<string, PollVote[]> = {};
      for (const v of votesData || []) {
        if (!grouped[v.poll_id]) grouped[v.poll_id] = [];
        grouped[v.poll_id].push(v);
      }
      setVotes(grouped);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchPolls();
  }, [organizationId]);

  const handleCreate = async () => {
    if (!user || !question.trim()) return;
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      toast({ title: "Error", description: "At least 2 options required", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("organization_polls").insert({
      organization_id: organizationId,
      created_by: user.id,
      question: question.trim().substring(0, 500),
      options: validOptions.map((o) => o.substring(0, 200)),
    });
    setCreating(false);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Poll created!" });
      setQuestion("");
      setOptions(["", ""]);
      setDialogOpen(false);
      fetchPolls();
    }
  };

  const handleVote = async (pollId: string, optionIndex: number) => {
    if (!user) return;
    const existingVote = votes[pollId]?.find((v) => v.user_id === user.id);

    if (existingVote) {
      // Change vote: delete old, insert new
      await supabase.from("organization_poll_votes").delete().eq("id", existingVote.id);
    }

    const { error } = await supabase.from("organization_poll_votes").insert({
      poll_id: pollId,
      user_id: user.id,
      option_index: optionIndex,
    });

    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      fetchPolls();
    }
  };

  const handleDelete = async (pollId: string) => {
    const { error } = await supabase.from("organization_polls").delete().eq("id", pollId);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Poll deleted" });
      fetchPolls();
    }
  };

  const handleToggleActive = async (pollId: string, currentActive: boolean) => {
    const { error } = await supabase
      .from("organization_polls")
      .update({ is_active: !currentActive })
      .eq("id", pollId);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      fetchPolls();
    }
  };

  const addOption = () => {
    if (options.length < 10) setOptions([...options, ""]);
  };

  const removeOption = (index: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="relative">
          <CardTitle className="text-center">Polls</CardTitle>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="absolute right-4 top-4">
                  <Plus className="mr-2 h-4 w-4" /> Create Poll
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Poll</DialogTitle>
                  <DialogDescription>Ask your members a question with multiple options.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Question</Label>
                    <Input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="What would you like to ask?"
                      maxLength={500}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Options</Label>
                    {options.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const updated = [...options];
                            updated[i] = e.target.value;
                            setOptions(updated);
                          }}
                          placeholder={`Option ${i + 1}`}
                          maxLength={200}
                        />
                        {options.length > 2 && (
                          <Button size="icon" variant="ghost" className="shrink-0" onClick={() => removeOption(i)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {options.length < 10 && (
                      <Button variant="outline" size="sm" onClick={addOption} className="w-full">
                        <Plus className="mr-2 h-3 w-3" /> Add Option
                      </Button>
                    )}
                  </div>
                  <Button
                    onClick={handleCreate}
                    disabled={creating || !question.trim() || options.filter((o) => o.trim()).length < 2}
                    className="w-full"
                  >
                    {creating ? "Creating..." : "Create Poll"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
      </Card>

      {polls.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No polls yet.</p>
          </CardContent>
        </Card>
      ) : (
        polls.map((poll) => {
          const pollVotes = votes[poll.id] || [];
          const totalVotes = pollVotes.length;
          const userVote = user ? pollVotes.find((v) => v.user_id === user.id) : null;

          return (
            <Card key={poll.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">{poll.question}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(poll.created_at), { addSuffix: true })}
                      {" · "}
                      {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!poll.is_active && <Badge variant="secondary" className="text-xs">Closed</Badge>}
                    {isAdmin && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7"
                          onClick={() => handleToggleActive(poll.id, poll.is_active)}
                        >
                          {poll.is_active ? "Close" : "Reopen"}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(poll.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {poll.options.map((option, i) => {
                  const optionVotes = pollVotes.filter((v) => v.option_index === i).length;
                  const percentage = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
                  const isSelected = userVote?.option_index === i;

                  return (
                    <button
                      key={i}
                      onClick={() => poll.is_active && handleVote(poll.id, i)}
                      disabled={!poll.is_active}
                      className={`w-full text-left p-3 rounded-lg border transition-colors relative overflow-hidden ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : poll.is_active
                          ? "border-border hover:border-primary/50 hover:bg-muted/50"
                          : "border-border"
                      } ${!poll.is_active ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <div className="flex items-center justify-between relative z-10">
                        <span className="text-sm font-medium">{option}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                          {percentage}% ({optionVotes})
                        </span>
                      </div>
                      <Progress value={percentage} className="mt-2 h-1.5" />
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
