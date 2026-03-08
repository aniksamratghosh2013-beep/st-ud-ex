import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, UserMinus, MessageSquare, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";

interface FollowRecord {
  follower_id: string;
  following_id: string;
}

export default function People() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Tables<"profiles">[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});
  const [selectedProfile, setSelectedProfile] = useState<Tables<"profiles"> | null>(null);

  const fetchData = async () => {
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");
    setProfiles(allProfiles || []);

    if (user) {
      const { data: follows } = await (supabase as any)
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      setMyFollowing(new Set((follows as FollowRecord[] || []).map((f: any) => f.following_id)));
    }

    const { data: allFollows } = await (supabase as any).from("follows").select("following_id");
    const counts: Record<string, number> = {};
    (allFollows || []).forEach((f: any) => {
      counts[f.following_id] = (counts[f.following_id] || 0) + 1;
    });
    setFollowerCounts(counts);

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleFollow = async (targetId: string) => {
    if (!user) return;
    const { error } = await (supabase as any).from("follows").insert({
      follower_id: user.id,
      following_id: targetId,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMyFollowing(prev => new Set(prev).add(targetId));
      setFollowerCounts(prev => ({ ...prev, [targetId]: (prev[targetId] || 0) + 1 }));
      toast({ title: "Following!" });
    }
  };

  const handleUnfollow = async (targetId: string) => {
    if (!user) return;
    await (supabase as any).from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
    setMyFollowing(prev => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    setFollowerCounts(prev => ({ ...prev, [targetId]: Math.max(0, (prev[targetId] || 1) - 1) }));
    toast({ title: "Unfollowed" });
  };

  const filtered = profiles.filter(p =>
    p.id !== user?.id &&
    (p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
     p.bio?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">DM's</h1>
        <Badge variant="outline">{profiles.length - 1} users</Badge>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search people..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((profile) => (
          <Card key={profile.id} className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedProfile(profile)}>
            <CardHeader className="flex flex-row items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={profile.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {profile.full_name?.[0]?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">{profile.full_name || "Unknown"}</CardTitle>
                <p className="text-xs text-muted-foreground truncate">{profile.bio || "No bio"}</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span>{followerCounts[profile.id] || 0} followers</span>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/messages/${profile.id}`)}>
                    <MessageSquare className="h-3 w-3" />
                  </Button>
                  {myFollowing.has(profile.id) ? (
                    <Button size="sm" variant="secondary" onClick={() => handleUnfollow(profile.id)}>
                      <UserMinus className="h-3 w-3 mr-1" /> Unfollow
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => handleFollow(profile.id)}>
                      <UserPlus className="h-3 w-3 mr-1" /> Follow
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No people found.</div>
      )}

      {/* Profile Dialog */}
      <Dialog open={!!selectedProfile} onOpenChange={() => setSelectedProfile(null)}>
        <DialogContent className="max-w-md">
          {selectedProfile && (
            <>
              <DialogHeader>
                <DialogTitle>Profile</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={selectedProfile.avatar_url || ""} />
                  <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
                    {selectedProfile.full_name?.[0]?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <h2 className="text-xl font-bold">{selectedProfile.full_name || "Unknown"}</h2>
                  <p className="text-sm text-muted-foreground">{selectedProfile.bio || "No bio"}</p>
                </div>

                <div className="flex gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold">{followerCounts[selectedProfile.id] || 0}</div>
                    <div className="text-xs text-muted-foreground">Followers</div>
                  </div>
                </div>

                {selectedProfile.skills && selectedProfile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedProfile.skills.map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                )}

                {selectedProfile.interests && selectedProfile.interests.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedProfile.interests.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 w-full">
                  <Button className="flex-1" onClick={() => { setSelectedProfile(null); navigate(`/messages/${selectedProfile.id}`); }}>
                    <MessageSquare className="h-4 w-4 mr-2" /> Message
                  </Button>
                  {myFollowing.has(selectedProfile.id) ? (
                    <Button variant="secondary" className="flex-1" onClick={() => handleUnfollow(selectedProfile.id)}>
                      <UserMinus className="h-4 w-4 mr-2" /> Unfollow
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1" onClick={() => handleFollow(selectedProfile.id)}>
                      <UserPlus className="h-4 w-4 mr-2" /> Follow
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
