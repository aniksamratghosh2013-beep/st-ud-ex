import { useEffect, useState } from "react";
import { Bell, Moon, Sun, LogOut, MessageSquare, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: "dm" | "post";
  title: string;
  preview: string;
  createdAt: string;
  linkTo: string;
}

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const items: Notification[] = [];

      // Unread DMs
      const { data: dms } = await (supabase as any)
        .from("direct_messages")
        .select("id, sender_id, content, created_at")
        .eq("receiver_id", user.id)
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(10);

      if (dms?.length) {
        const senderIds = [...new Set(dms.map((d: any) => d.sender_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", senderIds as string[]);
        const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);

        for (const dm of dms) {
          items.push({
            id: `dm-${dm.id}`,
            type: "dm",
            title: profileMap.get(dm.sender_id) || "Someone",
            preview: dm.content.substring(0, 80),
            createdAt: dm.created_at,
            linkTo: `/messages/${dm.sender_id}`,
          });
        }
      }

      // Recent org posts (from orgs I belong to)
      const { data: memberships } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "approved");

      if (memberships?.length) {
        const orgIds = memberships.map((m) => m.organization_id);
        const { data: posts } = await supabase
          .from("posts")
          .select("id, title, content, created_at, organization_id")
          .in("organization_id", orgIds)
          .neq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (posts) {
          const { data: orgs } = await supabase
            .from("organizations")
            .select("id, name")
            .in("id", orgIds);
          const orgMap = new Map(orgs?.map((o) => [o.id, o.name]) || []);

          for (const post of posts) {
            items.push({
              id: `post-${post.id}`,
              type: "post",
              title: orgMap.get(post.organization_id!) || "Organization",
              preview: post.title.substring(0, 80),
              createdAt: post.created_at,
              linkTo: "/posts",
            });
          }
        }
      }

      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(items.slice(0, 15));
      setUnreadCount(dms?.length || 0);
    };

    fetchNotifications();

    // Refresh on new DMs
    const channel = supabase
      .channel("topbar-notifs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => fetchNotifications())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => fetchNotifications())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="px-3 py-2 font-semibold text-sm">Notifications</div>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-72">
              {notifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              ) : (
                notifications.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    className="flex items-start gap-2 px-3 py-2 cursor-pointer"
                    onClick={() => navigate(n.linkTo)}
                  >
                    {n.type === "dm" ? (
                      <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    ) : (
                      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{n.preview}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.user_metadata?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")}>Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
