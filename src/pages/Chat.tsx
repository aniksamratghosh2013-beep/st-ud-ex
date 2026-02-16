import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, Hash, Plus, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";
import { sanitizeError } from "@/lib/sanitize-error";

interface MessageWithProfile {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  channel_id: string;
  profile: Tables<"profiles"> | null;
}

export default function Chat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<Tables<"organizations">[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [channels, setChannels] = useState<Tables<"chat_channels">[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithProfile[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch user's orgs
  useEffect(() => {
    if (!user) return;
    const fetchOrgs = async () => {
      const { data: memberships } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "approved");

      if (memberships?.length) {
        const orgIds = memberships.map((m) => m.organization_id);
        const { data } = await supabase
          .from("organizations")
          .select("*")
          .in("id", orgIds);
        setOrgs(data || []);
        if (data?.length && !selectedOrg) setSelectedOrg(data[0].id);
      }
    };
    fetchOrgs();
  }, [user]);

  // Fetch channels for selected org
  useEffect(() => {
    if (!selectedOrg) return;
    const fetchChannels = async () => {
      const { data } = await supabase
        .from("chat_channels")
        .select("*")
        .eq("organization_id", selectedOrg)
        .order("created_at");
      setChannels(data || []);
      if (data?.length && !selectedChannel) setSelectedChannel(data[0].id);
    };
    fetchChannels();
  }, [selectedOrg]);

  // Fetch messages + realtime subscription
  useEffect(() => {
    if (!selectedChannel) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("channel_id", selectedChannel)
        .order("created_at", { ascending: true })
        .limit(100);

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

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !selectedChannel) return;
    const content = newMessage.trim();
    if (content.length > 4000) {
      toast({ title: "Error", description: "Message too long (max 4000 characters)", variant: "destructive" });
      return;
    }
    setSending(true);
    const { data: msgData, error } = await supabase.from("chat_messages").insert({
      channel_id: selectedChannel,
      user_id: user.id,
      content,
    }).select().single();
    setSending(false);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      setNewMessage("");
      // Fire-and-forget: moderate message
      if (msgData) {
        supabase.functions.invoke("moderate-message", {
          body: { messageId: msgData.id, content, channelId: selectedChannel, source: "chat" },
        }).then(({ data }) => {
          if (data?.banned) {
            toast({ title: "Your account has been suspended", description: "Your content violated community guidelines.", variant: "destructive" });
          }
        }).catch(console.error);
      }
      // Fire-and-forget: notify admin of chat activity
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      supabase.functions.invoke("notify-admin", {
        body: {
          type: "chat_message",
          data: { userName: profile?.full_name || "Unknown", channelName: currentChannel?.name || "", content },
        },
      }).catch(console.error);
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !user || !selectedOrg) return;
    const { error } = await supabase.from("chat_channels").insert({
      organization_id: selectedOrg,
      name: newChannelName.trim(),
      created_by: user.id,
    });
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      setNewChannelName("");
      const { data } = await supabase.from("chat_channels").select("*").eq("organization_id", selectedOrg).order("created_at");
      setChannels(data || []);
    }
  };

  const currentChannel = channels.find((c) => c.id === selectedChannel);

  if (!orgs.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No organizations yet</h2>
        <p className="text-muted-foreground">Join or create an organization to start chatting.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4">
      {/* Sidebar: orgs + channels */}
      <div className="w-64 flex flex-col gap-2 shrink-0">
        <div className="space-y-1">
          {orgs.map((org) => (
            <Button
              key={org.id}
              variant={selectedOrg === org.id ? "secondary" : "ghost"}
              className="w-full justify-start text-sm"
              onClick={() => { setSelectedOrg(org.id); setSelectedChannel(null); }}
            >
              <span className="truncate">{org.name}</span>
            </Button>
          ))}
        </div>

        <div className="border-t my-2" />

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

      {/* Main chat area */}
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
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-sm break-words">{msg.content}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex gap-2"
              >
                <Input
                  placeholder={`Message #${currentChannel?.name || ""}...`}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={sending || !newMessage.trim()}>
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
  );
}
