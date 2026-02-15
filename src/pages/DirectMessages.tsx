import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, ArrowLeft, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";

interface DM {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
}

interface ConversationPartner {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

export default function DirectMessages() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationPartner[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(userId || null);
  const [selectedProfile, setSelectedProfile] = useState<Tables<"profiles"> | null>(null);
  const [messages, setMessages] = useState<DM[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch conversations list
  useEffect(() => {
    if (!user) return;
    const fetchConversations = async () => {
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

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", partnerIds);

      const convos: ConversationPartner[] = partnerIds.map(pid => {
        const p = profiles?.find(pr => pr.id === pid);
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
    fetchConversations();
  }, [user, messages.length]);

  // Fetch selected user's profile
  useEffect(() => {
    if (!selectedUser) { setSelectedProfile(null); return; }
    supabase.from("profiles").select("*").eq("id", selectedUser).single()
      .then(({ data }) => setSelectedProfile(data));
  }, [selectedUser]);

  // Fetch messages for selected conversation
  useEffect(() => {
    if (!selectedUser || !user) return;

    const fetchMessages = async () => {
      const { data } = await (supabase as any)
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser}),and(sender_id.eq.${selectedUser},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: true });
      setMessages((data as DM[]) || []);

      // Mark as read
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

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !selectedUser) return;
    const trimmed = newMessage.trim();
    if (trimmed.length > 4000) {
      toast({ title: "Error", description: "Message too long (max 4000 characters)", variant: "destructive" });
      return;
    }
    setSending(true);
    const { error } = await (supabase as any).from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: selectedUser,
      content: trimmed,
    });
    setSending(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewMessage("");
    }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4">
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
        {selectedUser && selectedProfile ? (
          <>
            <div className="p-4 border-b flex items-center gap-3">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedUser(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarImage src={selectedProfile.avatar_url || ""} />
                <AvatarFallback className="text-xs">{selectedProfile.full_name?.[0] || "?"}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{selectedProfile.full_name || "Unknown"}</span>
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
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                <Input
                  placeholder={`Message ${selectedProfile.full_name || ""}...`}
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
              <MessageSquare className="h-8 w-8 mx-auto mb-2" />
              <p>Select a conversation or find someone to message</p>
              <Button variant="link" onClick={() => navigate("/people")} className="mt-2">Browse People</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
