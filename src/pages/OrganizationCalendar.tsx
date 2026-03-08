import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, MapPin, Clock, CalendarIcon } from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";
import { sanitizeError } from "@/lib/sanitize-error";

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

export default function OrganizationCalendar() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [orgName, setOrgName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    if (!id) return;

    const [{ data: orgData }, { data: eventsData }] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", id).single(),
      supabase.from("organization_events").select("*").eq("organization_id", id).order("event_date", { ascending: true }),
    ]);

    setOrgName(orgData?.name || "");
    setEvents(eventsData || []);

    if (user) {
      const [{ data: adminCheck }, { data: appFounderCheck }] = await Promise.all([
        supabase.rpc("is_org_admin", { _user_id: user.id, _org_id: id }),
        supabase.rpc("is_app_founder", { _user_id: user.id }),
      ]);
      setIsAdmin(adminCheck === true || appFounderCheck === true);
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id, user]);

  const handleCreate = async () => {
    if (!user || !id || !title.trim() || !eventDate) return;
    setCreating(true);

    const { error } = await supabase.from("organization_events").insert({
      organization_id: id,
      created_by: user.id,
      title: title.trim().substring(0, 200),
      description: description.trim().substring(0, 2000) || null,
      event_date: eventDate,
      event_time: eventTime || null,
      location: location.trim().substring(0, 200) || null,
    });

    setCreating(false);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Event created!" });
      setTitle("");
      setDescription("");
      setEventDate("");
      setEventTime("");
      setLocation("");
      setDialogOpen(false);
      fetchData();
    }
  };

  const handleDelete = async (eventId: string) => {
    const { error } = await supabase.from("organization_events").delete().eq("id", eventId);
    if (error) {
      toast({ title: "Error", description: sanitizeError(error), variant: "destructive" });
    } else {
      toast({ title: "Event deleted" });
      fetchData();
    }
  };

  const eventDates = events.map((e) => parseISO(e.event_date));
  const selectedEvents = selectedDate
    ? events.filter((e) => isSameDay(parseISO(e.event_date), selectedDate))
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">Calendar</h1>
          <p className="text-muted-foreground">{orgName}</p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
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
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details about the event..." className="min-h-[80px] resize-none" maxLength={2000} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Time (optional)</Label>
                    <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Location (optional)</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where is this event?" maxLength={200} />
                </div>
                <Button onClick={handleCreate} disabled={creating || !title.trim() || !eventDate} className="w-full">
                  {creating ? "Creating..." : "Create Event"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

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
          <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)]">
            {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
          </h2>

          {selectedEvents.length > 0 ? (
            selectedEvents.map((event) => (
              <Card key={event.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{event.title}</CardTitle>
                    {isAdmin && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(event.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {event.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      {format(parseISO(event.event_date), "MMM d, yyyy")}
                    </span>
                    {event.event_time && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {event.event_time}
                      </span>
                    )}
                    {event.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-4">No events on this date.</p>
          )}

          {/* Upcoming events */}
          <h3 className="text-sm font-medium text-muted-foreground pt-4">All Upcoming Events</h3>
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
    </div>
  );
}
