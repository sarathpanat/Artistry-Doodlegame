import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { categories } from "@/data/keralaDict";
import { getDeviceLocation } from "@/utils/haversine";
import { createRoom as apiCreateRoom } from "@/utils/websocket";

const CreateRoom = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateRoom = async () => {
    if (!username.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!selectedCategory) {
      toast.error("Please select a category");
      return;
    }

    setLoading(true);
    try {
      const location = await getDeviceLocation();
      try {
        const res = await apiCreateRoom(username, selectedCategory, location.lat, location.lon);
        const { roomId, sessionToken } = res;
        // Ensure the clientUserId matches the server-authoritative userId so host is recognized
        try {
          const serverUserId = res.room?.creatorUserId || (res.room?.players && res.room.players[0]?.userId);
          if (serverUserId) sessionStorage.setItem('clientUserId', serverUserId);
        } catch (e) {}
        sessionStorage.setItem("sessionToken", sessionToken);
        sessionStorage.setItem("username", username);
        sessionStorage.setItem("roomId", roomId);
        toast.success("Room created successfully!");
        navigate(`/waiting-room/${roomId}`);
      } catch (apiErr) {
        // Fallback: create local room and store in localStorage so JoinRoom can see it
        console.warn('API create-room failed, falling back to local room', apiErr);
        const roomId = `room-${Date.now()}`; 
        const sessionToken = `token-${Date.now()}`; 
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let displayCode = '';
        for (let i = 0; i < 4; i++) displayCode += chars.charAt(Math.floor(Math.random() * chars.length));
        // Ensure host is identified by the persistent clientUserId so tabs/browser sessions match
        const clientUserId = sessionStorage.getItem('clientUserId') || sessionToken;
        const localRoom = {
          roomId,
          displayCode,
          category: selectedCategory,
          distanceKm: 0,
          playerCount: 1,
          creatorUserId: clientUserId,
          players: [{ userId: clientUserId, username, isAdmin: true, ready: false, score: 0, connected: true }]
        }; 
        const existing = JSON.parse(localStorage.getItem('localRooms' ) || '[]');
        existing.push(localRoom);
        localStorage.setItem('localRooms', JSON.stringify(existing));

        // broadcast to other tabs
        try {
          const bc = new BroadcastChannel('geo-doodle-localRooms');
          bc.postMessage({ type: 'localRoomsUpdated', rooms: existing });
          bc.close();
        } catch (e) {
          // BroadcastChannel may not be available in some envs
        }

        // store a local sessionToken but keep clientUserId as the identity for host
        sessionStorage.setItem("sessionToken", sessionToken);
        sessionStorage.setItem("username", username);
        sessionStorage.setItem("roomId", roomId);
        toast.success("Room created locally (offline)");
        navigate(`/waiting-room/${roomId}`);
      }
    } catch (error) {
      toast.error("Failed to create room");
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
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

      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="shadow-game gradient-card border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="text-3xl text-primary flex items-center gap-2">
              <Sparkles className="h-7 w-7" />
              Create New Room
            </CardTitle>
            <CardDescription className="text-base">
              Choose a category and start playing with friends nearby
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
              <Label className="text-base font-semibold">Select Category</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`p-4 rounded-xl border-2 transition-smooth text-left font-medium ${
                      selectedCategory === category
                        ? "border-primary bg-primary/10 shadow-game"
                        : "border-border bg-card hover:border-primary/50 hover:shadow-md"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleCreateRoom}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary-glow transition-bounce text-lg py-6"
              size="lg"
            >
              Create Room & Start
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateRoom;
