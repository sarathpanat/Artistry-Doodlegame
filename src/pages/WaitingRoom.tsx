import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Check, Crown, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Player } from "@/types/game";

const WaitingRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [category, setCategory] = useState("Malayalam Movies");

  useEffect(() => {
    // TODO: WebSocket connection to get real-time player updates
    // Mock data
    const username = sessionStorage.getItem("username") || "Guest";
    setPlayers([
      {
        userId: "user-1",
        username,
        isAdmin: true,
        ready: false,
        score: 0,
        connected: true,
      },
      {
        userId: "user-2",
        username: "Player 2",
        isAdmin: false,
        ready: true,
        score: 0,
        connected: true,
      },
    ]);
    setIsAdmin(true);
  }, [roomId]);

  const handleReadyToggle = () => {
    setIsReady(!isReady);
    toast.success(!isReady ? "You're ready!" : "Ready status removed");
  };

  const handleStartGame = () => {
    const allReady = players.filter(p => !p.isAdmin).every(p => p.ready);
    if (!allReady) {
      toast.error("All players must be ready!");
      return;
    }
    toast.success("Starting game...");
    navigate(`/game/${roomId}`);
  };

  const handleLeave = () => {
    // TODO: API call to leave room
    toast.info("Left the room");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <Button
        variant="ghost"
        onClick={() => setShowExitDialog(true)}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Leave Room
      </Button>

      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="shadow-game gradient-card border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-3xl text-primary">Waiting Room</CardTitle>
                <p className="text-muted-foreground mt-1">
                  Room: <span className="font-mono text-foreground">{roomId}</span>
                </p>
              </div>
              <Badge className="bg-secondary text-secondary-foreground text-lg px-4 py-2">
                {category}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-xl">Players ({players.length}/10)</h3>
              <div className="grid gap-3">
                {players.map((player) => (
                  <div
                    key={player.userId}
                    className="flex items-center justify-between p-4 rounded-lg bg-card border-2 border-border transition-smooth"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                          {player.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{player.username}</span>
                          {player.isAdmin && (
                            <Crown className="h-4 w-4 text-secondary" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      {player.ready ? (
                        <Badge className="bg-primary text-primary-foreground">
                          <Check className="mr-1 h-3 w-3" />
                          Ready
                        </Badge>
                      ) : player.isAdmin ? (
                        <Badge variant="outline">Host</Badge>
                      ) : (
                        <Badge variant="secondary">
                          <X className="mr-1 h-3 w-3" />
                          Not Ready
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              {isAdmin ? (
                <Button
                  onClick={handleStartGame}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary-glow transition-bounce text-lg py-6"
                  size="lg"
                >
                  Start Game
                </Button>
              ) : (
                <Button
                  onClick={handleReadyToggle}
                  variant={isReady ? "secondary" : "default"}
                  className="flex-1 transition-bounce text-lg py-6"
                  size="lg"
                >
                  {isReady ? (
                    <>
                      <Check className="mr-2 h-5 w-5" />
                      Ready
                    </>
                  ) : (
                    "Mark as Ready"
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Room?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave this room? You'll need to join again to continue playing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave} className="bg-destructive text-destructive-foreground">
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WaitingRoom;
