import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { getDeviceLocation } from "@/utils/haversine";

const Index = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleCreateRoom = async () => {
    setLoading(true);
    try {
      await getDeviceLocation();
      navigate("/create-room");
    } catch (error) {
      toast.error("Location permission needed to create rooms");
      console.error("Location error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    setLoading(true);
    try {
      await getDeviceLocation();
      navigate("/join-room");
    } catch (error) {
      toast.error("Location permission needed to find nearby rooms");
      console.error("Location error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <div className="text-center space-y-8 animate-float">
        <div className="space-y-4">
          <h1 className="text-6xl md:text-7xl font-bold text-primary-foreground drop-shadow-lg">
            Artistry
          </h1>
          <p className="text-xl md:text-2xl text-primary-foreground/90 font-medium">
            Draw & Guess - Doodle Game
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-md mx-auto">
          <Button
            size="lg"
            onClick={handleCreateRoom}
            disabled={loading}
            className="w-full sm:w-auto bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-game transition-bounce text-lg font-semibold px-8 py-6"
          >
            <Sparkles className="mr-2 h-5 w-5" />
            Create Room
          </Button>

          <Button
            size="lg"
            onClick={handleJoinRoom}
            disabled={loading}
            className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 shadow-game transition-bounce text-lg font-semibold px-8 py-6"
          >
            <Users className="mr-2 h-5 w-5" />
            Join Room
          </Button>
        </div>

        <div className="text-primary-foreground/80 text-sm space-y-2">
          <p className="flex items-center justify-center gap-2">
            <span>🎨 Malayalam Movies • Objects</span>
          </p>
        </div>
      </div>
    </main>
  );
};

export default Index;
