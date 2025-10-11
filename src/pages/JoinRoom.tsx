import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { getDeviceLocation } from "@/utils/haversine";
import { RoomListItem } from "@/types/game";

const JoinRoom = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNearbyRooms();
  }, []);

  const loadNearbyRooms = async () => {
    try {
      const location = await getDeviceLocation();
      
      // TODO: API call to get nearby rooms
      // Mock data for now
      setRooms([
        {
          roomId: "room-1",
          category: "Malayalam Movies",
          distanceKm: 2.5,
          playerCount: 3,
        },
        {
          roomId: "room-2",
          category: "Kerala Dishes",
          distanceKm: 5.8,
          playerCount: 5,
        },
      ]);
    } catch (error) {
      toast.error("Failed to load nearby rooms");
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = (roomId: string) => {
    if (!username.trim()) {
      toast.error("Please enter your name");
      return;
    }

    // TODO: API call to join room
    const sessionToken = `token-${Date.now()}`;
    sessionStorage.setItem("sessionToken", sessionToken);
    sessionStorage.setItem("username", username);
    sessionStorage.setItem("roomId", roomId);

    toast.success("Joined room successfully!");
    navigate(`/waiting-room/${roomId}`);
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
              Find active games within 100km radius
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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

            <div className="space-y-3">
              <Label className="text-base font-semibold">Available Rooms</Label>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading nearby rooms...
                </div>
              ) : rooms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No rooms found nearby. Try creating one!
                </div>
              ) : (
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
                            <h3 className="font-semibold text-lg">{room.category}</h3>
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
