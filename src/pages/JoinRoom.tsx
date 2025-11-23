import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, MapPin, Users, Hash } from "lucide-react";
import { toast } from "sonner";
import { getDeviceLocation } from "@/utils/haversine";
import { getNearbyRooms as apiGetNearbyRooms, joinRoom as apiJoinRoom } from "@/utils/websocket";
import { RoomListItem } from "@/types/game";

const JoinRoom = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [hasLocation, setHasLocation] = useState(false);

  useEffect(() => {
    loadNearbyRooms();
  }, []);

  const loadNearbyRooms = async () => {
    setLoading(true);
    try {
      const location = await getDeviceLocation();
      setHasLocation(true);
      try {
        const res = await apiGetNearbyRooms(location.lat, location.lon, 100);
        setRooms(res as any);
      } catch (err) {
        console.warn('Failed to load rooms from API, falling back to localRooms', err);
        const local = JSON.parse(localStorage.getItem('localRooms') || '[]');
        setRooms(local as any);
      }
    } catch (error) {
      console.log("Location permission denied or unavailable");
      setHasLocation(false);
      // Don't show error, user can still join via room code
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!username.trim()) {
      toast.error("Please enter your name");
      return;
    }

    try {
      const res = await apiJoinRoom(username, roomId);
      // server returns { roomId, sessionToken, room }
      try {
        const serverUserId = res.room?.players && res.room.players.find((p: any) => p.username === username)?.userId;
        if (serverUserId) sessionStorage.setItem('clientUserId', serverUserId);
      } catch (e) { }
      sessionStorage.setItem("sessionToken", res.sessionToken);
      sessionStorage.setItem("username", username);
      sessionStorage.setItem("roomId", res.roomId);
      toast.success("Joined room successfully!");
      navigate(`/waiting-room/${res.roomId}`);
    } catch (err) {
      console.warn('Failed to join via API, falling back to localRooms', err);
      // fallback to localRooms
      const local = JSON.parse(localStorage.getItem('localRooms') || '[]');
      const foundIdx = local.findIndex((r: any) => r.roomId === roomId || r.displayCode === roomId);
      if (foundIdx >= 0) {
        // use persistent clientUserId when available for consistency across tabs
        const userId = sessionStorage.getItem('clientUserId') || `local-${Date.now()}`;
        const player = {
          userId,
          username,
          isAdmin: false,
          // joined users default to ready
          ready: true,
          score: 0,
          connected: true
        };
        local[foundIdx].players = local[foundIdx].players || [];
        local[foundIdx].players.push(player);
        localStorage.setItem('localRooms', JSON.stringify(local));

        const sessionToken = `token-${Date.now()}`;
        sessionStorage.setItem("sessionToken", sessionToken);
        sessionStorage.setItem("username", username);
        sessionStorage.setItem("roomId", local[foundIdx].roomId);

        toast.success("Joined local room");
        navigate(`/waiting-room/${local[foundIdx].roomId}`);
        try {
          const bc = new BroadcastChannel('geo-doodle-localRooms');
          bc.postMessage({ type: 'localRoomsUpdated', rooms: local });
          bc.close();
        } catch (e) { }
      } else {
        toast.error("Room not found");
      }
    }
  };

  const handleJoinByCode = () => {
    if (!username.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!roomCode.trim()) {
      toast.error("Please enter a room code");
      return;
    }

    // Try to join by display code
    handleJoinRoom(roomCode.toUpperCase());
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <Button
        variant="ghost"
        onClick={() => navigate("/")}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <div className="max-w-3xl mx-auto space-y-6">
        <Card className="shadow-game gradient-card border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="text-3xl text-primary">Join a Room</CardTitle>
            <CardDescription className="text-base">
              Browse nearby games or enter a room code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dev helper: clear all rooms on server */}
            {import.meta.env.DEV && (
              <div className="text-right">
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      const base = (import.meta.env.VITE_GAME_SERVER_URL || '').replace(/\/$/, '');
                      const basePath = (import.meta.env.VITE_GAME_WS_BASE || '').replace(/\/$/, '');
                      await fetch(`${base}${basePath}/clear-rooms`, { method: 'POST' });
                      toast.success('Cleared rooms');
                      loadNearbyRooms();
                    } catch (e) {
                      toast.error('Failed to clear rooms');
                    }
                  }}
                >
                  Clear Rooms (dev)
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-base font-semibold">Your Name</Label>
              <Input
                id="username"
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="text-lg"
              />
            </div>

            {/* Manual Room Code Entry */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Join with Room Code
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter 4-letter code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="text-lg font-mono uppercase"
                />
                <Button
                  onClick={handleJoinByCode}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow"
                >
                  Join
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or browse nearby rooms
                </span>
              </div>
            </div>

            {/* Nearby Rooms List */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Available Rooms Nearby
              </Label>

              {!hasLocation && (
                <div className="text-center py-4 text-sm text-muted-foreground bg-muted/50 rounded-lg">
                  Location permission required to see nearby rooms
                </div>
              )}

              {hasLocation && loading && (
                <div className="text-center py-8 text-muted-foreground">
                  Loading nearby rooms...
                </div>
              )}

              {hasLocation && !loading && rooms.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No rooms found nearby. Try creating one!
                </div>
              )}

              {hasLocation && !loading && rooms.length > 0 && (
                <div className="space-y-3">
                  {rooms.map((room) => (
                    <Card
                      key={room.roomId}
                      className="border-2 border-border hover:border-primary/50 transition-smooth cursor-pointer"
                      onClick={() => handleJoinRoom(room.roomId)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h3 className="font-semibold text-lg">{room.category} — <span className="font-mono">{room.displayCode || room.roomId}</span></h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {room.distanceKm.toFixed(1)} km
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {room.playerCount} players
                              </span>
                            </div>
                          </div>
                          <Badge className="bg-primary text-primary-foreground">
                            Join
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default JoinRoom;
