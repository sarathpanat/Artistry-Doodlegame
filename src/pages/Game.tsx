import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Clock, Send, Trophy } from "lucide-react";
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
import DrawingCanvas from "@/components/DrawingCanvas";
import { Player, ChatMessage, DrawingEvent } from "@/types/game";
import { GameWebSocket } from "@/utils/websocket";

const Game = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const wsRef = useRef<null | import("@/utils/websocket").GameWebSocket>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [isDrawer, setIsDrawer] = useState(false);
  const [currentWord, setCurrentWord] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [roundNumber, setRoundNumber] = useState(1);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [remoteDrawingEvents, setRemoteDrawingEvents] = useState<DrawingEvent[]>([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  useEffect(() => {
    const username = sessionStorage.getItem("username") || "Guest";
    const sessionToken = sessionStorage.getItem("sessionToken");
    if (!roomId || !sessionToken) {
      // missing required info, redirect back
      navigate('/');
      return;
    }

    const handleMessage = (data: any) => {
      switch (data.type) {
        case 'roomUpdate': {
          const room = data.room;
          setPlayers(room.players || []);
          break;
        }
        case 'chatMessage': {
          const msg: ChatMessage = {
            messageId: `msg-${Date.now()}`,
            roomId: roomId!,
            userId: data.userId,
            username: data.username,
            text: data.text,
            createdAt: new Date().toISOString(),
            isCorrect: false
          };
          setMessages((prev) => [...prev, msg]);
          break;
        }
        case 'drawingEvent': {
          setRemoteDrawingEvents((prev) => [...prev, data.event]);
          break;
        }
        case 'yourWord': {
          setCurrentWord(data.word || '');
          setIsDrawer(true);
          break;
        }
        case 'roundStart': {
          setRoundNumber(data.roundNumber || 1);
          setTimeLeft(data.timeLimitSeconds || 60);
          // navigate / ensure we're on game page
          break;
        }
        case 'correctGuess': {
          // append a system message
          const msg: ChatMessage = {
            messageId: `msg-${Date.now()}`,
            roomId: roomId!,
            userId: data.userId,
            username: data.username,
            text: `${data.username} guessed correctly!`,
            createdAt: new Date().toISOString(),
            isCorrect: true
          };
          setMessages((prev) => [...prev, msg]);
          break;
        }
        default:
          break;
      }
    };

    const handleError = (err: string) => {
      console.warn('WebSocket error', err);
    };

  const ws = new GameWebSocket(sessionToken, roomId, handleMessage, handleError, (s) => setWsStatus(s));
    ws.connect();
    wsRef.current = ws;

    return () => {
      try { wsRef.current?.leaveRoom(); } catch (e) {}
      try { wsRef.current?.disconnect(); } catch (e) {}
      wsRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Round end
          toast.info("Time's up!");
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleSendGuess = () => {
    if (!currentGuess.trim()) return;

    const message: ChatMessage = {
      messageId: `msg-${Date.now()}`,
      roomId: roomId!,
      userId: "user-1",
      username: sessionStorage.getItem("username") || "Guest",
      text: currentGuess,
      createdAt: new Date().toISOString(),
      isCorrect: false,
    };

    setMessages((prev) => [...prev, message]);
    setCurrentGuess("");

    // Send via WebSocket
    try {
      wsRef.current?.sendGuess(message.text);
    } catch (e) {
      console.warn('Failed to send guess via websocket', e);
    }
  };

  const handleDrawingEvent = (event: DrawingEvent) => {
    // Send drawing event via WebSocket
    try {
      wsRef.current?.sendDrawingEvent(event);
    } catch (e) {
      console.warn('Failed to send drawing event', e);
    }
  };

  const handleLeave = () => {
    // TODO: API call to leave game
    toast.info("Left the game");
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
        Leave Game
      </Button>

      <div className="max-w-7xl mx-auto grid lg:grid-cols-[1fr_300px] gap-6">
        {/* Main game area */}
        <div className="space-y-4">
          {/* Timer and round info */}
          <Card className="bg-primary text-primary-foreground shadow-game">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  Round {roundNumber}
                </Badge>
                {isDrawer && (
                  <div className="text-xl font-bold">
                    Draw: {currentWord}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-xl font-bold">
                <Clock className="h-5 w-5" />
                {timeLeft}s
                <div className="ml-3 text-sm font-mono">{wsStatus}</div>
              </div>
            </CardContent>
          </Card>

          {/* Drawing canvas */}
          <DrawingCanvas
            isDrawer={isDrawer}
            onDrawingEvent={handleDrawingEvent}
            remoteEvents={remoteDrawingEvents}
          />

          {/* Chat / Guessing area */}
          {!isDrawer && (
            <Card className="shadow-game">
              <CardHeader>
                <CardTitle>Make Your Guess</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-48 rounded-lg border p-4">
                  <div className="space-y-2">
                    {messages.map((msg) => (
                      <div
                        key={msg.messageId}
                        className={`p-2 rounded-lg ${
                          msg.isCorrect
                            ? "bg-primary/10 text-primary font-semibold"
                            : "bg-muted"
                        }`}
                      >
                        <span className="font-semibold">{msg.username}:</span> {msg.text}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex gap-2">
                  <Input
                    placeholder="Type your guess..."
                    value={currentGuess}
                    onChange={(e) => setCurrentGuess(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendGuess()}
                  />
                  <Button onClick={handleSendGuess} size="icon">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Scoreboard */}
        <Card className="shadow-game h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-secondary" />
              Scoreboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {players
                .sort((a, b) => b.score - a.score)
                .map((player, index) => (
                  <div
                    key={player.userId}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <div className="font-bold text-lg text-muted-foreground">
                        #{index + 1}
                      </div>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {player.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{player.username}</span>
                    </div>
                    <Badge className="bg-primary text-primary-foreground">
                      {player.score}
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Game?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave? Your progress will be lost.
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

export default Game;
