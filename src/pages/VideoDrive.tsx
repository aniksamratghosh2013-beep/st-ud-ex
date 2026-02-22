import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HardDrive, Play, Clock, FileVideo, Calendar } from "lucide-react";
import { motion } from "framer-motion";

export default function VideoDrive() {
  const { data: recordings, isLoading } = useQuery({
    queryKey: ["recordings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_recordings")
        .select("*, meetings(title, room_name, organization_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pastMeetings } = useQuery({
    queryKey: ["past-meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .eq("status", "ended")
        .order("ended_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">Video Drive</h1>
        <p className="text-muted-foreground mt-1">Access recorded meetings and past sessions</p>
      </motion.div>

      {/* Recordings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileVideo className="h-5 w-5" /> Recordings
        </h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !recordings?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <HardDrive className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No recordings yet. Recorded meetings will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recordings.map((rec: any, i: number) => (
              <motion.div key={rec.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{rec.title}</CardTitle>
                      <Badge variant={rec.status === "ready" ? "default" : "secondary"}>
                        {rec.status}
                      </Badge>
                    </div>
                    <CardDescription>{rec.meetings?.title}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(rec.duration_seconds)}</span>
                      <span>{formatSize(rec.file_size_bytes)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(rec.created_at).toLocaleDateString()} at {new Date(rec.created_at).toLocaleTimeString()}
                    </div>
                    {rec.file_url && rec.status === "ready" && (
                      <Button variant="outline" className="w-full" asChild>
                        <a href={rec.file_url} target="_blank" rel="noopener noreferrer">
                          <Play className="mr-2 h-4 w-4" /> Play Recording
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Past Meetings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Past Meetings
        </h2>
        {!pastMeetings?.length ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No past meetings to display.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {pastMeetings.map((m: any) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{m.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {m.ended_at ? new Date(m.ended_at).toLocaleDateString() : "—"} · {m.max_participants} max participants
                    </p>
                  </div>
                  <Badge variant="secondary">Ended</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
