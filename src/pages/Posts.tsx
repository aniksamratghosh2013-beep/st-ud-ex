import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { sanitizeError } from "@/lib/sanitize-error";
import type { Tables } from "@/integrations/supabase/types";

interface PostWithAuthor {
  id: string;
  title: string;
  content: string;
  user_id: string;
  organization_id: string | null;
  created_at: string;
  profile: Tables<"profiles"> | null;
  org: Tables<"organizations"> | null;
}

export default function Posts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [myOrgs, setMyOrgs] = useState<Tables<"organizations">[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postAs, setPostAs] = useState<string>("personal");
  const [creating, setCreating] = useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  const fetchPosts = async () => {
    const { data: postsData } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (postsData) {
      const enriched: PostWithAuthor[] = [];
      for (const p of postsData) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", p.user_id).single();
        let org: Tables<"organizations"> | null = null;
        if (p.organization_id) {
          const { data: orgData } = await supabase.from("organizations").select("*").eq("id", p.organization_id).single();
          org = orgData;
        }
        enriched.push({ ...p, profile, org });
      }
      setPosts(enriched);
    }
    setLoading(false);
  };

  const fetchMyOrgs = async () => {
    if (!user) return;
    const { data: memberships } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("status", "approved");

    if (memberships?.length) {
      const orgIds = memberships.map((m) => m.organization_id);
      const { data: orgs } = await supabase.from("organizations").select("*").in("id", orgIds);
      setMyOrgs(orgs || []);
    }

    // Check if user is a founder or org_admin of any org
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["founder", "org_admin", "super_admin"]);

    setIsOrgAdmin((roles?.length ?? 0) > 0);
  };

  useEffect(() => {
    fetchPosts();
    fetchMyOrgs();
  }, [user]);

  useEffect(() => {
    const channel = supabase
      .channel("posts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        fetchPosts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleCreate = async () => {
    if (!user || !title.trim() || !content.trim()) return;
    setCreating(true);

    const insertData: {
      user_id: string;
      title: string;
      content: string;
      organization_id?: string;
    } = {
      user_id: user.id,
      title: title.trim().substring(0, 200),
      content: content.trim().substring(0, 4000),
    };

    if (postAs !== "personal") {
      insertData.organization_id = postAs;
    }

    const { data: postData, error } = await supabase.from("posts").insert(insertData).select().single();
    setCreating(false);

    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Post created!" });
      setTitle("");
      setContent("");
      setPostAs("personal");
      setDialogOpen(false);

      if (postData) {
        supabase.functions.invoke("moderate-message", {
          body: {
            messageId: postData.id,
            content: `${insertData.title} ${insertData.content}`,
            source: "post",
          },
        }).catch(console.error);
      }
    }
  };

  const handleDelete = async (postId: string) => {
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Post deleted" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">Posts</h1>
        {isOrgAdmin && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Post
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a Post</DialogTitle>
              <DialogDescription>Share something with the community.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Post as</Label>
                <Select value={postAs} onValueChange={setPostAs}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Yourself</SelectItem>
                    {myOrgs.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Post title"
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's on your mind?"
                  className="min-h-[120px] resize-none"
                  maxLength={4000}
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={creating || !title.trim() || !content.trim()}
                className="w-full"
              >
                {creating ? "Posting..." : "Post"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {posts.map((post) => (
          <Card
            key={post.id}
            className={post.organization_id ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
            onClick={() => {
              if (post.organization_id) {
                navigate(`/organizations/${post.organization_id}`);
              }
            }}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={post.org?.logo_url || post.profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {post.org ? post.org.name[0]?.toUpperCase() : post.profile?.full_name?.[0]?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-base">{post.title}</CardTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {post.org ? post.org.name : post.profile?.full_name || "Unknown"}
                      </span>
                      {post.org && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Org</Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
                {user?.id === post.user_id && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(post.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap">{post.content}</p>
            </CardContent>
          </Card>
        ))}

        {posts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No posts yet. Be the first to share something!</p>
          </div>
        )}
      </div>
    </div>
  );
}
