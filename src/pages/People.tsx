import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, UserMinus, MessageSquare, Users, Send, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";
import { sanitizeError } from "@/lib/sanitize-error";
import { FileAttachmentButton, AttachmentPreview } from "@/components/chat/FileAttachment";

interface FollowRecord {
  follower_id: string;
  following_id: string;
}

interface DM {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
}

interface ConversationPartner {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

export default function People() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Users tab state
  const [profiles, setProfiles] = useState<Tables<"profiles">[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});
  const [selectedProfile, setSelectedProfile] = useState<Tables<"profiles"> | null>(null);

  // Chats tab state
  const [conversations, setConversations] = useState<ConversationPartner[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [chatProfile, setChatProfile] = useState<Tables<"profiles"> | null>(null);
  const [messages, setMessages] = useState<DM[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch users data
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

  // Fetch conversations
  const fetchConversations = async () => {
    if (!user) return;
    const { data: allDMs } = await (supabase as any)
      .from("direct_messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (!allDMs) return;

    const partnerMap = new Map<string, { lastMsg: DM; unread: number }>();
    for (const dm of allDMs as DM[]) {
      const partnerId = dm.sender_id === user.id ? dm.receiver_id : dm.sender_id;
      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, { lastMsg: dm, unread: 0 });
      }
      if (!dm.read && dm.receiver_id === user.id) {
        const entry = partnerMap.get(partnerId)!;
        entry.unread++;
      }
    }

    const partnerIds = Array.from(partnerMap.keys());
    if (partnerIds.length === 0) { setConversations([]); return; }

    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", partnerIds);

    const convos: ConversationPartner[] = partnerIds.map(pid => {
      const p = profs?.find(pr => pr.id === pid);
      const entry = partnerMap.get(pid)!;
      return {
        id: pid,
        full_name: p?.full_name || null,
        avatar_url: p?.avatar_url || null,
        lastMessage: entry.lastMsg.content,
        lastMessageAt: entry.lastMsg.created_at,
        unreadCount: entry.unread,
      };
    });
    setConversations(convos);
  };

  useEffect(() => { fetchData(); }, [user]);
  useEffect(() => { fetchConversations(); }, [user, messages.length]);

  // Chat profile
  useEffect(() => {
    if (!selectedUser) { setChatProfile(null); return; }
    supabase.from("profiles").select("*").eq("id", selectedUser).single()
      .then(({ data }) => setChatProfile(data));
  }, [selectedUser]);

  // Fetch messages + realtime
  useEffect(() => {
    if (!selectedUser || !user) return;

    const fetchMessages = async () => {
      const { data } = await (supabase as any)
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser}),and(sender_id.eq.${selectedUser},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: true });
      setMessages((data as DM[]) || []);

      await (supabase as any)
        .from("direct_messages")
        .update({ read: true })
        .eq("sender_id", selectedUser)
        .eq("receiver_id", user.id)
        .eq("read", false);
    };

    fetchMessages();

    const channel = supabase
      .channel(`dm-${selectedUser}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const msg = payload.new as DM;
          if (
            (msg.sender_id === user.id && msg.receiver_id === selectedUser) ||
            (msg.sender_id === selectedUser && msg.receiver_id === user.id)
          ) {
            setMessages(prev => [...prev, msg]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedUser, user]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const uploadAttachment = async (file: File): Promise<{ url: string; name: string; type: string } | null> => {
    const filePath = `dm/${user!.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("chat-attachments").upload(filePath, file);
    if (error) {
      toast({ title: "Upload failed", description: sanitizeError(error), variant: "destructive" });
      return null;
    }
    const { data: urlData, error: urlError } = await supabase.storage.from("chat-attachments").createSignedUrl(filePath, 3600);
    if (urlError || !urlData?.signedUrl) {
      toast({ title: "Failed to get file URL", variant: "destructive" });
      return null;
    }
    return { url: urlData.signedUrl, name: file.name, type: file.type };
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && !attachedFile) || !user || !selectedUser) return;
    const trimmed = newMessage.trim() || (attachedFile ? `📎 ${attachedFile.name}` : "");
    if (trimmed.length > 4000) {
      toast({ title: "Error", description: "Message too long (max 4000 characters)", variant: "destructive" });
      return;
    }
    setSending(true);

    let attachment: { url: string; name: string; type: string } | null = null;
    if (attachedFile) {
      attachment = await uploadAttachment(attachedFile);
      if (!attachment) { setSending(false); return; }
    }

    const { error } = await (supabase as any).from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: selectedUser,
      content: trimmed,
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
    });
    setSending(false);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      setNewMessage("");
      setAttachedFile(null);

      const { data: senderProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      supabase.functions.invoke("notify-user", {
        body: {
          recipientId: selectedUser,
          recipientName: chatProfile?.full_name || "User",
          type: "new_dm",
          data: {
            senderName: senderProfile?.full_name || "Someone",
            content: trimmed.substring(0, 200),
          },
        },
      }).catch(console.error);
    }
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
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">DM's</h1>
      </motion.div>

      <Tabs defaultValue="users">
        <div className="flex justify-center">
        <TabsList className="w-auto">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="chats">Chats</TabsTrigger>
        </TabsList>
        </div>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 mr-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search people..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Badge variant="outline" className="ml-3">{profiles.length - 1} users</Badge>
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
                      <span>{followerCounts[profile.id] || 0} {(followerCounts[profile.id] || 0) === 1 ? "follower" : "followers"}</span>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedUser(profile.id); }}>
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
        </TabsContent>

        {/* Chats Tab */}
        <TabsContent value="chats">
          <div className="flex h-[calc(100vh-14rem)] gap-4">
            {/* Conversations list */}
            <div className="w-64 flex flex-col gap-2 shrink-0">
              <h2 className="text-lg font-semibold px-2">Messages</h2>
              <div className="flex-1 overflow-auto space-y-1">
                {conversations.map(c => (
                  <Button
                    key={c.id}
                    variant={selectedUser === c.id ? "secondary" : "ghost"}
                    className="w-full justify-start text-sm h-auto py-2"
                    onClick={() => setSelectedUser(c.id)}
                  >
                    <Avatar className="h-6 w-6 mr-2 shrink-0">
                      <AvatarImage src={c.avatar_url || ""} />
                      <AvatarFallback className="text-[10px]">{c.full_name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex justify-between items-center">
                        <span className="truncate font-medium">{c.full_name || "Unknown"}</span>
                        {c.unreadCount > 0 && (
                          <Badge className="ml-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]">
                            {c.unreadCount}
                          </Badge>
                        )}
                      </div>
                      {c.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>
                      )}
                    </div>
                  </Button>
                ))}
                {conversations.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No conversations yet. Find people to message!</p>
                )}
              </div>
            </div>

            {/* Chat area */}
            <Card className="flex-1 flex flex-col overflow-hidden">
              {selectedUser && chatProfile ? (
                <>
                  <div className="p-4 border-b flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedUser(null)}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={chatProfile.avatar_url || ""} />
                      <AvatarFallback className="text-xs">{chatProfile.full_name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{chatProfile.full_name || "Unknown"}</span>
                  </div>

                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-3">
                      <AnimatePresence>
                        {messages.map(msg => (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}
                          >
                            <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                              msg.sender_id === user?.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}>
                              <p className="break-words">{msg.content}</p>
                              {msg.attachment_url && (
                                <AttachmentPreview url={msg.attachment_url} name={msg.attachment_name || "file"} type={msg.attachment_type || ""} />
                              )}
                              <span className="text-[10px] opacity-70 mt-1 block">
                                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      <div ref={scrollRef} />
                    </div>
                  </ScrollArea>

                  <div className="p-4 border-t">
                    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
                      <FileAttachmentButton file={attachedFile} onFileSelect={setAttachedFile} disabled={sending} />
                      <Input
                        placeholder={`Message ${chatProfile.full_name || ""}...`}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="flex-1"
                      />
                      <Button type="submit" size="icon" disabled={sending || (!newMessage.trim() && !attachedFile)}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                    <p>Select a conversation to start chatting</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>

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
                  <Button className="flex-1" onClick={() => { setSelectedProfile(null); setSelectedUser(selectedProfile.id); }}>
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
