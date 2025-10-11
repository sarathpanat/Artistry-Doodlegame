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
      
      // TODO: API call to create room
      const roomId = `room-${Date.now()}`;
      const sessionToken = `token-${Date.now()}`;
      
      sessionStorage.setItem("sessionToken", sessionToken);
      sessionStorage.setItem("username", username);
      sessionStorage.setItem("roomId", roomId);
      
      toast.success("Room created successfully!");
      navigate(`/waiting-room/${roomId}`);
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
