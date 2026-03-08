import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  Check, X, UserMinus, Shield, Pencil, Camera, CalendarDays, FileText, Clock,
  Trash2, Edit, Hash, Plus, Send, MessageSquare, MapPin, CalendarIcon,
} from "lucide-react";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { sanitizeError } from "@/lib/sanitize-error";
import { formatDistanceToNow, format, isSameDay, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { FileAttachmentButton, AttachmentPreview } from "@/components/chat/FileAttachment";

interface PostWithAuthor {
  id: string;
  title: string;
  content: string;
  user_id: string;
  created_at: string;
  profile_name: string | null;
}

interface MemberWithProfile {
  id: string;
  user_id: string;
  status: Enums<"membership_status">;
  profile: Tables<"profiles"> | null;
  role: Enums<"app_role"> | null;
}

interface OrgEvent {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  location: string | null;
  created_at: string;
}

interface MessageWithProfile {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  channel_id: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  profile: Tables<"profiles"> | null;
}

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [org, setOrg] = useState<Tables<"organizations"> | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isFounder, setIsFounder] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState("");
  const [orgPosts, setOrgPosts] = useState<PostWithAuthor[]>([]);

  // Founder rename/delete state
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  // Calendar state
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [calDialogOpen, setCalDialogOpen] = useState(false);
  const [calTitle, setCalTitle] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calDate, setCalDate] = useState("");
  const [calTime, setCalTime] = useState("");
  const [calLocation, setCalLocation] = useState("");
  const [calCreating, setCalCreating] = useState(false);

  // Chat state
  const [channels, setChannels] = useState<Tables<"chat_channels">[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithProfile[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canManage = isAdmin || isSuperAdmin;

  const fetchData = async () => {
    if (!id) return;

    const { data: orgData } = await supabase.from("organizations").select("*").eq("id", id).single();
    setOrg(orgData);
    setBioText(orgData?.description || "");
    setNewOrgName(orgData?.name || "");

    const { data: memberships } = await supabase
      .from("organization_memberships")
      .select("id, user_id, status")
      .eq("organization_id", id);

    if (memberships) {
      const memberData: MemberWithProfile[] = [];
      for (const m of memberships) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", m.user_id).single();
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", m.user_id)
          .eq("organization_id", id);

        memberData.push({
          ...m,
          profile,
          role: roles?.[0]?.role ?? null,
        });
      }
      setMembers(memberData);

      // Check if current user is subscribed (approved member)
      if (user) {
        const myMembership = memberships.find(m => m.user_id === user.id);
        setIsSubscribed(myMembership?.status === "approved");
      }
    }

    if (user) {
      const [{ data: adminCheck }, { data: superCheck }] = await Promise.all([
        supabase.rpc("is_org_admin", { _user_id: user.id, _org_id: id }),
        supabase.rpc("is_super_admin", { _user_id: user.id }),
      ]);
      setIsAdmin(adminCheck === true);
      setIsSuperAdmin(superCheck === true);
      setIsFounder(orgData?.created_by === user.id);
    }

    const { data: postsData } = await supabase
      .from("posts")
      .select("*")
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (postsData) {
      const enriched: PostWithAuthor[] = [];
      for (const p of postsData) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", p.user_id).single();
        enriched.push({ ...p, profile_name: profile?.full_name || null });
      }
      setOrgPosts(enriched);
    }

    // Fetch events
    const { data: eventsData } = await supabase
      .from("organization_events")
      .select("*")
      .eq("organization_id", id)
      .order("event_date", { ascending: true });
    setEvents(eventsData || []);

    // Fetch chat channels
    const { data: channelsData } = await supabase
      .from("chat_channels")
      .select("*")
      .eq("organization_id", id)
      .order("created_at");
    setChannels(channelsData || []);

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id, user]);

  // Chat messages + realtime
  useEffect(() => {
    if (!selectedChannel) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("channel_id", selectedChannel)
        .order("created_at", { ascending: true })
        .limit(200);

      if (data) {
        const withProfiles: MessageWithProfile[] = [];
        const profileCache: Record<string, Tables<"profiles"> | null> = {};
        for (const msg of data) {
          if (!profileCache[msg.user_id]) {
            const { data: p } = await supabase.from("profiles").select("*").eq("id", msg.user_id).single();
            profileCache[msg.user_id] = p;
          }
          withProfiles.push({ ...msg, profile: profileCache[msg.user_id] });
        }
        setMessages(withProfiles);
      }
    };

    fetchMessages();

    const channel = supabase
      .channel(`messages-${selectedChannel}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${selectedChannel}` },
        async (payload) => {
          const newMsg = payload.new as Tables<"chat_messages">;
          const { data: p } = await supabase.from("profiles").select("*").eq("id", newMsg.user_id).single();
          setMessages((prev) => [...prev, { ...newMsg, profile: p }]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedChannel]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleMembership = async (membershipId: string, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("organization_memberships")
      .update({ status })
      .eq("id", membershipId);

    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      if (status === "approved") {
        const membership = members.find((m) => m.id === membershipId);
        if (membership && id) {
          await supabase.from("user_roles").insert({
            user_id: membership.user_id,
            organization_id: id,
            role: "member" as Enums<"app_role">,
          });
        }
      }
      toast({ title: `Member ${status}` });
      fetchData();
    }
  };

  const handleRoleChange = async (userId: string, newRole: Enums<"app_role">) => {
    if (!id || !isFounder) {
      toast({ title: "Error", description: "Only the founder can change roles", variant: "destructive" });
      return;
    }
    const member = members.find(m => m.user_id === userId && m.status === 'approved');
    if (!member) {
      toast({ title: "Error", description: "User must be an approved member", variant: "destructive" });
      return;
    }
    // Delete existing role then insert new one (no unique constraint for upsert)
    await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("organization_id", id);
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, organization_id: id, role: newRole });
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Role updated" });
    }
    fetchData();
  };

  const handleRemove = async (userId: string) => {
    if (!id) return;
    await supabase.from("organization_memberships").delete().eq("user_id", userId).eq("organization_id", id);
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("organization_id", id);
    toast({ title: "Member removed" });
    fetchData();
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const filePath = `${id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("org-logos")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Upload failed", description: sanitizeError(uploadError), variant: "destructive" });
      return;
    }

    const { data: urlData } = supabase.storage.from("org-logos").getPublicUrl(filePath);
    await supabase.from("organizations").update({ logo_url: urlData.publicUrl }).eq("id", id);
    setOrg((o) => o ? { ...o, logo_url: urlData.publicUrl } : o);
    toast({ title: "Logo updated" });
  };

  const getWordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  const handleSaveBio = async () => {
    if (!id) return;
    const wordCount = getWordCount(bioText);
    if (wordCount < 40) {
      toast({ title: "Too short", description: `Description must be at least 40 words. Current: ${wordCount} words.`, variant: "destructive" });
      return;
    }
    if (wordCount > 100) {
      toast({ title: "Too long", description: `Description must be at most 100 words. Current: ${wordCount} words.`, variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("organizations")
      .update({ description: bioText.trim().substring(0, 2000) })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Organization bio updated" });
      setEditingBio(false);
      fetchData();
    }
  };

  const handleRename = async () => {
    if (!id || !newOrgName.trim()) return;
    const { error } = await supabase.from("organizations").update({ name: newOrgName.trim() }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Organization renamed" });
      setRenameOpen(false);
      fetchData();
    }
  };

  const handleDelete = async () => {
    if (!id || deleteConfirm !== org?.name) return;
    await supabase.from("user_roles").delete().eq("organization_id", id);
    await supabase.from("organization_memberships").delete().eq("organization_id", id);
    await supabase.from("organization_follows").delete().or(`follower_org_id.eq.${id},following_org_id.eq.${id}`);
    await supabase.from("chat_channels").delete().eq("organization_id", id);
    await supabase.from("posts").delete().eq("organization_id", id);
    await supabase.from("organization_events").delete().eq("organization_id", id);
    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Organization deleted" });
      navigate("/organizations");
    }
  };

  // Calendar handlers
  const handleCreateEvent = async () => {
    if (!user || !id || !calTitle.trim() || !calDate) return;
    setCalCreating(true);
    const { error } = await supabase.from("organization_events").insert({
      organization_id: id,
      created_by: user.id,
      title: calTitle.trim().substring(0, 200),
      description: calDesc.trim().substring(0, 2000) || null,
      event_date: calDate,
      event_time: calTime || null,
      location: calLocation.trim().substring(0, 200) || null,
    });
    setCalCreating(false);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Event created!" });
      setCalTitle(""); setCalDesc(""); setCalDate(""); setCalTime(""); setCalLocation("");
      setCalDialogOpen(false);
      fetchData();
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const { error } = await supabase.from("organization_events").delete().eq("id", eventId);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Event deleted" });
      fetchData();
    }
  };

  // Chat handlers
  const uploadAttachment = async (file: File): Promise<{ url: string; name: string; type: string } | null> => {
    const filePath = `chat/${user!.id}/${Date.now()}-${file.name}`;
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

  const currentChannel = channels.find((c) => c.id === selectedChannel);

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !attachedFile) || !user || !selectedChannel) return;
    const content = newMessage.trim() || (attachedFile ? `📎 ${attachedFile.name}` : "");
    if (content.length > 4000) {
      toast({ title: "Error", description: "Message too long (max 4000 characters)", variant: "destructive" });
      return;
    }
    setSending(true);

    let attachment: { url: string; name: string; type: string } | null = null;
    if (attachedFile) {
      attachment = await uploadAttachment(attachedFile);
      if (!attachment) { setSending(false); return; }
    }

    const { data: msgData, error } = await supabase.from("chat_messages").insert({
      channel_id: selectedChannel,
      user_id: user.id,
      content,
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
    }).select().single();
    setSending(false);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      setNewMessage("");
      setAttachedFile(null);
      if (msgData) {
        supabase.functions.invoke("moderate-message", {
          body: { messageId: msgData.id, content, channelId: selectedChannel, source: "chat" },
        }).catch(console.error);
      }
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !user || !id) return;
    const { error } = await supabase.from("chat_channels").insert({
      organization_id: id,
      name: newChannelName.trim(),
      created_by: user.id,
    });
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      setNewChannelName("");
      const { data } = await supabase.from("chat_channels").select("*").eq("organization_id", id).order("created_at");
      setChannels(data || []);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>;
  }

  if (!org) {
    return <div className="text-center py-12 text-muted-foreground">Organization not found.</div>;
  }

  const pendingMembers = members.filter((m) => m.status === "pending");
  const approvedMembers = members.filter((m) => m.status === "approved");
  const canEditBio = isFounder || isAdmin || isSuperAdmin;

  const eventDates = events.map((e) => parseISO(e.event_date));
  const selectedEvents = selectedDate
    ? events.filter((e) => isSameDay(parseISO(e.event_date), selectedDate))
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="relative">
          <Avatar className="h-16 w-16">
            <AvatarImage src={org.logo_url || ""} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">
              {org.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {canEditBio && (
            <label className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
              <Camera className="h-3.5 w-3.5" />
              <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
            </label>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">{org.name}</h1>
          <div className="flex items-center gap-2 mt-3">
            {isFounder && (
              <>
                <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Edit className="mr-2 h-4 w-4" /> Rename
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Rename Organization</DialogTitle>
                      <DialogDescription>Enter a new name for your organization.</DialogDescription>
                    </DialogHeader>
                    <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="New name" />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
                      <Button onClick={handleRename} disabled={!newOrgName.trim()}>Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); setDeleteConfirm(""); }}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Organization</DialogTitle>
                      <DialogDescription>
                        This action is permanent. Type <strong>{org.name}</strong> to confirm.
                      </DialogDescription>
                    </DialogHeader>
                    <Input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={`Type "${org.name}" to confirm`}
                    />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                      <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirm !== org.name}>
                        Delete Forever
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="about">
        <TabsList className="w-full justify-center">
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="posts">Recently Posted</TabsTrigger>
          {isSubscribed && <TabsTrigger value="calendar">Calendar</TabsTrigger>}
          {isSubscribed && <TabsTrigger value="chat">Chat</TabsTrigger>}
        </TabsList>

        {/* About Tab */}
        <TabsContent value="about" className="space-y-6">
          <Card>
            <CardHeader className="relative">
              <CardTitle className="text-center">About</CardTitle>
              {canEditBio && !editingBio && (
                <Button size="icon" variant="ghost" className="h-7 w-7 absolute right-4 top-4" onClick={() => setEditingBio(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editingBio ? (
                <div className="space-y-2">
                  <Textarea
                    value={bioText}
                    onChange={(e) => setBioText(e.target.value)}
                    placeholder="Write a bio for this organization (40-100 words)..."
                    className="min-h-[100px] resize-none"
                    maxLength={2000}
                  />
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${(() => { const wc = getWordCount(bioText); return wc < 40 || wc > 100 ? 'text-destructive' : 'text-muted-foreground'; })()}`}>
                      {getWordCount(bioText)} / 40–100 words
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveBio} disabled={getWordCount(bioText) < 40 || getWordCount(bioText) > 100}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingBio(false); setBioText(org.description || ""); }}>Cancel</Button>
                    </div>
                  </div>
                </div>
              ) : org.description ? (
                <p className="text-muted-foreground whitespace-pre-wrap">{org.description}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">Tell us what your organization is dedicated to, and be sure to mention the Instagram account ☺︎</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-6">
          {/* Pending Requests */}
          {canManage && pendingMembers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2">
                  <Shield className="h-4 w-4" />
                  Pending Requests ({pendingMembers.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={m.profile?.avatar_url || ""} />
                        <AvatarFallback className="text-xs">{m.profile?.full_name?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{m.profile?.full_name || "Unknown"}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleMembership(m.id, "approved")}>
                        <Check className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleMembership(m.id, "rejected")}>
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-center">Members ({approvedMembers.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvedMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.profile?.avatar_url || ""} />
                      <AvatarFallback className="text-xs">{m.profile?.full_name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="text-sm font-medium">{m.profile?.full_name || "Unknown"}</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {m.role === "founder" ? "🏆 Founder" : m.role === "org_admin" ? "Admin" : "Member"}
                      </Badge>
                    </div>
                  </div>
                  {isFounder && m.user_id !== user?.id && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={m.role || "member"}
                        onValueChange={(v) => handleRoleChange(m.user_id, v as Enums<"app_role">)}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="org_admin">Admin</SelectItem>
                          <SelectItem value="founder">Founder</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleRemove(m.user_id)}>
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {approvedMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No members yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recently Posted Tab */}
        <TabsContent value="posts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2">
                <FileText className="h-4 w-4" />
                Recently Posted
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orgPosts.map((post) => (
                <div key={post.id} className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-start justify-between">
                    <h4 className="text-sm font-medium">{post.title}</h4>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 ml-2">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">by {post.profile_name || "Unknown"}</p>
                </div>
              ))}
              {orgPosts.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No posts yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calendar Tab (subscribers only) */}
        {isSubscribed && (
          <TabsContent value="calendar" className="space-y-6">
            <Card>
              <CardHeader className="relative">
                <CardTitle className="text-center">Calendar</CardTitle>
                {(isFounder || isAdmin) && (
                  <Dialog open={calDialogOpen} onOpenChange={setCalDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="absolute right-4 top-4">
                        <Plus className="mr-2 h-4 w-4" /> Add Event
                      </Button>
                    </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Event</DialogTitle>
                      <DialogDescription>Schedule a meeting, gathering, or event.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder="Event title" maxLength={200} />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea value={calDesc} onChange={(e) => setCalDesc(e.target.value)} placeholder="Details..." className="min-h-[80px] resize-none" maxLength={2000} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Time (optional)</Label>
                          <Input type="time" value={calTime} onChange={(e) => setCalTime(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Location (optional)</Label>
                        <Input value={calLocation} onChange={(e) => setCalLocation(e.target.value)} placeholder="Where?" maxLength={200} />
                      </div>
                      <Button onClick={handleCreateEvent} disabled={calCreating || !calTitle.trim() || !calDate} className="w-full">
                        {calCreating ? "Creating..." : "Create Event"}
                      </Button>
                    </div>
                  </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
            </Card>

            <div className="grid gap-6 md:grid-cols-[auto_1fr]">
              <Card className="w-fit">
                <CardContent className="p-3">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    modifiers={{ hasEvent: eventDates }}
                    modifiersClassNames={{ hasEvent: "bg-primary/20 font-bold text-primary" }}
                  />
                </CardContent>
              </Card>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">
                  {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
                </h3>
                {selectedEvents.length > 0 ? (
                  selectedEvents.map((event) => (
                    <Card key={event.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{event.title}</CardTitle>
                          {(isFounder || isAdmin) && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteEvent(event.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {event.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.description}</p>}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" />{format(parseISO(event.event_date), "MMM d, yyyy")}</span>
                          {event.event_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{event.event_time}</span>}
                          {event.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-4">No events on this date.</p>
                )}

                <h4 className="text-sm font-medium text-muted-foreground pt-4">All Upcoming Events</h4>
                {events.filter((e) => new Date(e.event_date) >= new Date(new Date().toDateString())).length > 0 ? (
                  events
                    .filter((e) => new Date(e.event_date) >= new Date(new Date().toDateString()))
                    .map((event) => (
                      <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary">{format(parseISO(event.event_date), "dd")}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{event.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(event.event_date), "MMM d")}
                            {event.event_time ? ` · ${event.event_time}` : ""}
                            {event.location ? ` · ${event.location}` : ""}
                          </p>
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">No upcoming events.</p>
                )}
              </div>
            </div>
          </TabsContent>
        )}

        {/* Chat Tab (subscribers only) */}
        {isSubscribed && (
          <TabsContent value="chat">
            <div className="flex h-[calc(100vh-16rem)] gap-4">
              {/* Channel sidebar */}
              <div className="w-52 flex flex-col gap-2 shrink-0">
                <div className="flex-1 overflow-auto space-y-1">
                  {channels.map((ch) => (
                    <Button
                      key={ch.id}
                      variant={selectedChannel === ch.id ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start text-sm"
                      onClick={() => setSelectedChannel(ch.id)}
                    >
                      <Hash className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                      <span className="truncate">{ch.name}</span>
                    </Button>
                  ))}
                </div>

                <div className="flex gap-1">
                  <Input
                    placeholder="New channel..."
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    className="text-sm h-8"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                  />
                  <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleCreateChannel} disabled={!newChannelName.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Chat area */}
              <Card className="flex-1 flex flex-col overflow-hidden">
                {selectedChannel ? (
                  <>
                    <div className="p-4 border-b flex items-center gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{currentChannel?.name}</span>
                      <Badge variant="outline" className="text-xs ml-auto">{messages.length} messages</Badge>
                    </div>

                    <ScrollArea className="flex-1 p-4">
                      <div className="space-y-4">
                        <AnimatePresence>
                          {messages.map((msg) => (
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex gap-3"
                            >
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={msg.profile?.avatar_url || ""} />
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {msg.profile?.full_name?.[0]?.toUpperCase() || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-sm font-medium">{msg.profile?.full_name || "Unknown"}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(msg.created_at).toLocaleDateString()} {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                                <p className="text-sm break-words">{msg.content}</p>
                                {msg.attachment_url && (
                                  <AttachmentPreview url={msg.attachment_url} name={msg.attachment_name || "file"} type={msg.attachment_type || ""} />
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        <div ref={scrollRef} />
                      </div>
                    </ScrollArea>

                    <div className="p-4 border-t">
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                        className="flex items-center gap-2"
                      >
                        <FileAttachmentButton file={attachedFile} onFileSelect={setAttachedFile} disabled={sending} />
                        <Input
                          placeholder={`Message #${currentChannel?.name || ""}...`}
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
                      <Hash className="h-8 w-8 mx-auto mb-2" />
                      <p>Select or create a channel to start chatting</p>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
