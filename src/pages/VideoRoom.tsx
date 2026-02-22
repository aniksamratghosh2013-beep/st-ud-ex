import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Room, RoomEvent, Track } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MonitorOff,
  Hand, MessageSquare, Users, Maximize, Minimize
} from "lucide-react";

interface ChatMessage {
  sender: string;
  message: string;
  timestamp: Date;
}

export default function VideoRoom() {
  const { roomName } = useParams<{ roomName: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [fullscreen, setFullscreen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);

  const updateParticipants = useCallback((r: Room) => {
    const names: string[] = [r.localParticipant.identity];
    r.remoteParticipants.forEach((p) => names.push(p.identity));
    setParticipants(names);
  }, []);

  const connectToRoom = useCallback(async () => {
    if (!roomName || !user) return;
    setConnecting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/livekit-token`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomName,
            identity: user.email || user.id.slice(0, 8),
            isHost: true,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to get token");
      }

      const { token, url } = await res.json();

      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: { width: 1280, height: 720, frameRate: 30 } },
      });

      newRoom.on(RoomEvent.ParticipantConnected, () => updateParticipants(newRoom));
      newRoom.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(newRoom));

      newRoom.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (remoteContainerRef.current) {
          const el = track.attach();
          el.setAttribute("data-participant", participant.identity);
          el.className = "w-full h-full object-cover rounded-lg";

          let container = remoteContainerRef.current.querySelector(
            `[data-pid="${participant.identity}"]`
          ) as HTMLDivElement;
          if (!container) {
            container = document.createElement("div");
            container.setAttribute("data-pid", participant.identity);
            container.className = "relative aspect-video bg-muted rounded-lg overflow-hidden";
            const label = document.createElement("div");
            label.className =
              "absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded";
            label.textContent = participant.identity;
            container.appendChild(label);
            remoteContainerRef.current.appendChild(container);
          }
          container.insertBefore(el, container.firstChild);
        }
      });

      newRoom.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        track.detach().forEach((el) => el.remove());
        if (remoteContainerRef.current) {
          const container = remoteContainerRef.current.querySelector(
            `[data-pid="${participant.identity}"]`
          );
          if (container && !container.querySelector("video, audio")) {
            container.remove();
          }
        }
      });

      newRoom.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          if (msg.type === "chat") {
            setChatMessages((prev) => [
              ...prev,
              {
                sender: participant?.identity || "Unknown",
                message: msg.message,
                timestamp: new Date(),
              },
            ]);
          } else if (msg.type === "hand") {
            toast({ title: `✋ ${participant?.identity} raised their hand` });
          }
        } catch {}
      });

      newRoom.on(RoomEvent.Disconnected, () => {
        setConnected(false);
        setRoom(null);
        roomRef.current = null;
      });

      await newRoom.connect(url, token);
      await newRoom.localParticipant.enableCameraAndMicrophone();

      const camTrack = newRoom.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camTrack?.track && localVideoRef.current) {
        camTrack.track.attach(localVideoRef.current);
      }

      roomRef.current = newRoom;
      setRoom(newRoom);
      setConnected(true);
      updateParticipants(newRoom);

      await supabase
        .from("meetings")
        .update({ status: "active", started_at: new Date().toISOString() })
        .eq("room_name", roomName);
    } catch (err: any) {
      toast({
        title: "Connection failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  }, [roomName, user, toast, updateParticipants]);

  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  const toggleAudio = async () => {
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!audioEnabled);
    setAudioEnabled(!audioEnabled);
  };

  const toggleVideo = async () => {
    if (!room) return;
    await room.localParticipant.setCameraEnabled(!videoEnabled);
    setVideoEnabled(!videoEnabled);
  };

  const toggleScreenShare = async () => {
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!screenSharing);
      setScreenSharing(!screenSharing);
    } catch {
      toast({ title: "Screen share failed", variant: "destructive" });
    }
  };

  const toggleHand = () => {
    if (!room) return;
    setHandRaised(!handRaised);
    const enc = new TextEncoder();
    room.localParticipant.publishData(
      enc.encode(JSON.stringify({ type: "hand", raised: !handRaised })),
      { reliable: true }
    );
  };

  const sendChat = () => {
    if (!room || !chatInput.trim()) return;
    const enc = new TextEncoder();
    room.localParticipant.publishData(
      enc.encode(JSON.stringify({ type: "chat", message: chatInput })),
      { reliable: true }
    );
    setChatMessages((prev) => [
      ...prev,
      { sender: "You", message: chatInput, timestamp: new Date() },
    ]);
    setChatInput("");
  };

  const leaveRoom = async () => {
    if (room) {
      room.disconnect();
      await supabase
        .from("meetings")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("room_name", roomName);
    }
    navigate("/meetings");
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  if (!connected) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Join Meeting
            </CardTitle>
            <CardDescription>Room: {roomName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover rounded-lg"
              />
            </div>
            <Button className="w-full" onClick={connectToRoom} disabled={connecting}>
              {connecting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent mr-2" />
                  Connecting...
                </>
              ) : (
                <>
                  <Video className="mr-2 h-4 w-4" />
                  Join Now
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      <div className="flex-1 flex gap-2 p-2 overflow-hidden">
        <div
          className={`flex-1 grid gap-2 auto-rows-fr ${
            participants.length <= 1
              ? "grid-cols-1"
              : participants.length <= 4
              ? "grid-cols-2"
              : participants.length <= 9
              ? "grid-cols-3"
              : "grid-cols-4"
          }`}
        >
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
              You {handRaised && "✋"}
              {!audioEnabled && <MicOff className="h-3 w-3 text-destructive" />}
            </div>
          </div>
          <div ref={remoteContainerRef} className="contents" />
        </div>

        {showChat && (
          <div className="w-80 border rounded-lg flex flex-col bg-card">
            <div className="p-3 border-b font-medium">Chat</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chatMessages.map((m, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-primary">{m.sender}: </span>
                  <span className="text-foreground">{m.message}</span>
                </div>
              ))}
            </div>
            <div className="p-3 border-t flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Type a message..."
                className="flex-1"
              />
              <Button size="sm" onClick={sendChat}>
                Send
              </Button>
            </div>
          </div>
        )}

        {showParticipants && (
          <div className="w-64 border rounded-lg bg-card">
            <div className="p-3 border-b font-medium flex items-center gap-2">
              <Users className="h-4 w-4" /> Participants ({participants.length})
            </div>
            <div className="p-3 space-y-2">
              {participants.map((p) => (
                <div key={p} className="flex items-center gap-2 text-sm">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                    {p[0]?.toUpperCase()}
                  </div>
                  {p}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t bg-card p-3">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant={audioEnabled ? "outline" : "destructive"}
            size="icon"
            onClick={toggleAudio}
            title="Toggle microphone"
          >
            {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
          <Button
            variant={videoEnabled ? "outline" : "destructive"}
            size="icon"
            onClick={toggleVideo}
            title="Toggle camera"
          >
            {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </Button>
          <Button
            variant={screenSharing ? "default" : "outline"}
            size="icon"
            onClick={toggleScreenShare}
            title="Share screen"
          >
            {screenSharing ? (
              <MonitorOff className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant={handRaised ? "default" : "outline"}
            size="icon"
            onClick={toggleHand}
            title="Raise hand"
          >
            <Hand className="h-4 w-4" />
          </Button>

          <div className="w-px h-8 bg-border mx-1" />

          <Button
            variant={showChat ? "default" : "outline"}
            size="icon"
            onClick={() => setShowChat(!showChat)}
            title="Chat"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button
            variant={showParticipants ? "default" : "outline"}
            size="icon"
            onClick={() => setShowParticipants(!showParticipants)}
            title="Participants"
          >
            <Users className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleFullscreen}
            title="Fullscreen"
          >
            {fullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </Button>

          <div className="w-px h-8 bg-border mx-1" />

          <Button variant="destructive" onClick={leaveRoom} title="Leave meeting">
            <PhoneOff className="mr-2 h-4 w-4" /> Leave
          </Button>
        </div>
      </div>
    </div>
  );
}
