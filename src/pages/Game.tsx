import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Clock, Send, Trophy, Palette } from "lucide-react";
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
  const wsRef = useRef<GameWebSocket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");

  // Game state
  const [gamePhase, setGamePhase] = useState<'waiting' | 'wordSelection' | 'drawing' | 'roundEnd'>('waiting');
  const [isDrawer, setIsDrawer] = useState(false);
  const [currentWord, setCurrentWord] = useState("");
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(15);
  const [roundNumber, setRoundNumber] = useState(1);
  const [gameNumber, setGameNumber] = useState(1);
  const [totalGames, setTotalGames] = useState(3);
  const [drawerUsername, setDrawerUsername] = useState("");
  const [category, setCategory] = useState("");

  const [showExitDialog, setShowExitDialog] = useState(false);
  const [remoteDrawingEvents, setRemoteDrawingEvents] = useState<DrawingEvent[]>([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  const navigatingToWaitingRoomRef = useRef(false);
  const [timerEndsAt, setTimerEndsAt] = useState<string | null>(null);

  const clientUserId = typeof window !== 'undefined' ? sessionStorage.getItem('clientUserId') : null;
  const username = typeof window !== 'undefined' ? sessionStorage.getItem('username') || 'Guest' : 'Guest';

  useEffect(() => {
    if (!roomId) return;

    const sessionToken = sessionStorage.getItem("sessionToken");
    if (!sessionToken) {
      navigate('/');
      return;
    }

    const handleMessage = (data: any) => {
      console.log('Game received:', data.type, data);

      switch (data.type) {
        case 'roomUpdate': {
          const room = data.room;
          setPlayers(room.players || []);
          setCategory(room.category || 'Malayalam Movies');

          // Update timer from server if in active phase
          if (room.currentRound?.timerEndsAt) {
            setTimerEndsAt(room.currentRound.timerEndsAt);
          }

          if (room.currentRound) {
            setRoundNumber(room.currentRound.roundNumber || 1);
            setGameNumber(room.currentRound.gameNumber || 1);
            setTotalGames(room.currentRound.totalGames || room.players.length);

            const drawer = room.players.find((p: Player) => p.userId === room.currentRound.drawerUserId);
            setDrawerUsername(drawer?.username || '');
            const me = (room.players || []).find((p: Player) => p.userId === clientUserId || p.username === username);
            const drawerUserId = room.currentRound?.drawerUserId;
            const newIsDrawer = Boolean(drawerUserId === clientUserId || drawerUserId === me?.userId);

            console.log('[RoomUpdate] Drawer:', drawerUserId, 'Me:', clientUserId, 'NewIsDrawer:', newIsDrawer, 'CurrentIsDrawer:', isDrawer);

            // Protect against isDrawer flipping to false mid-turn due to race conditions
            if (isDrawer && !newIsDrawer && (gamePhase === 'wordSelection' || gamePhase === 'drawing')) {
              console.warn('[RoomUpdate] Ignoring isDrawer=false update because I am currently the drawer in active phase');
            } else {
              setIsDrawer(newIsDrawer);
            }

            if (room.currentRound.word && room.currentRound.word !== currentWord) {
              // Only update word if we're not the drawer (drawer has their own word set via wordSelected)
              if (!newIsDrawer) {
                setCurrentWord(room.currentRound.word);
              }
            }
          }
          break;
        }

        case 'wordSelectionStart': {
          const clientId = sessionStorage.getItem('clientUserId');
          const amIDrawer = data.words && data.words.length > 0; // Drawer gets words, watchers don't

          console.log('[WordSelection] My clientId:', clientId);
          console.log('[WordSelection] Words received:', data.words);
          console.log('[WordSelection] Am I drawer?', amIDrawer);

          setIsDrawer(amIDrawer);
          setGamePhase('wordSelection');
          setWordChoices(data.words || []);

          // Use server-provided timer end time for perfect sync
          if (data.timerEndsAt) {
            setTimerEndsAt(data.timerEndsAt);
          } else {
            // Fallback if server doesn't provide it
            setTimerEndsAt(new Date(Date.now() + (data.timeLimit || 15) * 1000).toISOString());
          }
          setCurrentWord('');
          setRemoteDrawingEvents([]); // Clear previous drawings
          setMessages([]); // Clear chat
          break;
        }

        case 'wordSelected': {
          console.log('[WordSelected] Received event:', data);
          const timeLimit = data.timeLimit || 80; // Use server's time limit
          const clientId = sessionStorage.getItem('clientUserId');

          console.log('[WordSelected] My clientId:', clientId);
          console.log('[WordSelected] Drawer userId:', data.drawerUserId);
          console.log('[WordSelected] Word:', data.word);

          if (data.drawerUserId === clientId) {
            setCurrentWord(data.word);
            setIsDrawer(true); // Ensure isDrawer is set
            console.log('[WordSelected] I am the artist! Word set to:', data.word);
            toast.success(`Your word: ${data.word}`);
          } else {
            setIsDrawer(false);
            console.log('[WordSelected] I am a watcher');
            toast.info('Artist has chosen a word!');
          }
          setGamePhase('drawing');
          setTimeLeft(timeLimit); // Set correct time
          setTimerEndsAt(data.timerEndsAt || new Date(Date.now() + (timeLimit * 1000)).toISOString());
          break;
        }

        case 'wordSelectionTimeout': {
          toast.info('Time expired! Moving to next player...');
          setGamePhase('waiting');
          setTimeout(() => {
            // Server will trigger next wordSelectionStart
          }, 2000);
          break;
        }

        case 'chatMessage': {
          const msg: ChatMessage = {
            messageId: `msg-${Date.now()}-${Math.random()}`,
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

        case 'correctGuess': {
          const msg: ChatMessage = {
            messageId: `msg-${Date.now()}-${Math.random()}`,
            roomId: roomId!,
            userId: data.userId,
            username: data.username,
            text: `✓ ${data.username} guessed correctly! +${data.pointsAwarded} pts ${data.position ? `(#${data.position}/${data.totalPlayers})` : ''}`,
            createdAt: new Date().toISOString(),
            isCorrect: true
          };
          setMessages((prev) => [...prev, msg]);

          // Show toast with score breakdown
          if (data.userId === sessionStorage.getItem('clientUserId')) {
            toast.success(
              `Correct! +${data.pointsAwarded} points`,
              { description: data.position ? `You were #${data.position} to guess!` : '' }
            );
          }

          // Update scores in players list
          setPlayers((prev) => prev.map(p => {
            if (p.userId === data.userId) {
              return { ...p, score: p.score + (data.pointsAwarded || 10) };
            }
            if (p.userId === data.drawerUserId) {
              return { ...p, score: p.score + 5 }; // Artist gets 5 points
            }
            return p;
          }));

          toast.success(`${data.username} guessed correctly!`);
          break;
        }

        case 'roundEnd': {
          toast.info('Round ended!');
          setGamePhase('roundEnd');
          setTimeout(() => {
            setGamePhase('waiting');
          }, 3000);
          break;
        }

        case 'drawingTimeout': {
          toast.info("Time's up! Moving to next game...");
          setGamePhase('waiting');
          break;
        }

        case 'gameEnd': {
          console.log('Game ended, final scores:', data.finalScores);
          // Store final scores for display in waiting room
          if (data.finalScores) {
            sessionStorage.setItem('lastGameScores', JSON.stringify(data.finalScores));
          }
          toast.success('Game finished! Check the final scores.');
          setGamePhase('roundEnd');
          // Show final scores for 3 seconds then return to waiting room
          navigatingToWaitingRoomRef.current = true;
          setTimeout(() => {
            navigate(`/waiting-room/${roomId}`);
          }, 3000);
          break;
        }

        default:
          break;
      }
    };

    const handleError = (err: string) => {
      console.warn('WebSocket error', err);
      toast.error('Connection issue: ' + err);
    };

    const ws = new GameWebSocket(sessionToken, roomId, handleMessage, handleError, (s) => setWsStatus(s));
    ws.connect();
    wsRef.current = ws;

    return () => {
      // Don't call leaveRoom if we're navigating back to waiting room
      if (!navigatingToWaitingRoomRef.current) {
        try { wsRef.current?.leaveRoom(); } catch (e) { }
      }
      try { wsRef.current?.disconnect(); } catch (e) { }
      wsRef.current = null;
    };
  }, [roomId, clientUserId]);

  // Server-synced timer countdown
  useEffect(() => {
    if (!timerEndsAt || (gamePhase !== 'wordSelection' && gamePhase !== 'drawing')) {
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const endTime = new Date(timerEndsAt).getTime();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeLeft(remaining);
    };

    // Update immediately
    updateTimer();

    // Update every 100ms for smooth countdown
    const timer = setInterval(updateTimer, 100);

    return () => clearInterval(timer);
  }, [timerEndsAt, gamePhase]);

  const handleWordSelect = (word: string) => {
    if (!isDrawer || gamePhase !== 'wordSelection') return;

    console.log('Selecting word:', word);
    // Send word selection to server
    if (wsRef.current) {
      wsRef.current.selectWord(word);
    }
  };

  const handleSendGuess = () => {
    if (!currentGuess.trim() || isDrawer) return;

    // Send to server for validation - server will broadcast to all players
    try {
      wsRef.current?.sendGuess(currentGuess);
    } catch (e) {
      console.warn('Failed to send guess via websocket', e);
    }

    setCurrentGuess("");
  };

  const handleDrawingEvent = (event: DrawingEvent) => {
    if (!isDrawer) return;

    try {
      wsRef.current?.sendDrawingEvent(event);
    } catch (e) {
      console.warn('Failed to send drawing event', e);
    }
  };

  const handleLeave = () => {
    try {
      wsRef.current?.leaveRoom();
    } catch (e) { }
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
                  Round {roundNumber} - Game {gameNumber}/{totalGames}
                </Badge>
                <Badge variant="outline" className="text-sm bg-primary-foreground/10">
                  {category}
                </Badge>
                {isDrawer && currentWord && gamePhase === 'drawing' && (
                  <div className="text-xl font-bold">
                    Your word: {currentWord}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-xl font-bold">
                <Clock className="h-5 w-5" />
                {timeLeft}s
                <div className="ml-3 text-sm font-mono opacity-75">{wsStatus}</div>
              </div>
            </CardContent>
          </Card>

          {/* Word Selection Phase */}
          {gamePhase === 'wordSelection' && (
            <Card className="shadow-game border-4 border-primary animate-in fade-in duration-300">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl flex items-center justify-center gap-3">
                  <Palette className="h-8 w-8 text-primary" />
                  {isDrawer ? 'Choose Your Word' : `${drawerUsername} is choosing a word...`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {isDrawer ? (
                  <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
                    {wordChoices.map((word, idx) => (
                      <Button
                        key={idx}
                        onClick={() => handleWordSelect(word)}
                        className="h-32 text-2xl font-bold bg-gradient-to-br from-primary to-primary-glow hover:scale-105 transition-all shadow-game"
                        size="lg"
                      >
                        {word}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="animate-pulse text-6xl mb-4">🎨</div>
                    <p className="text-xl text-muted-foreground">
                      Waiting for {drawerUsername} to choose...
                    </p>
                  </div>
                )}

                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-6 py-3 bg-muted rounded-full">
                    <Clock className="h-5 w-5 text-destructive" />
                    <span className="text-2xl font-bold text-destructive">{timeLeft}s</span>
                    <span className="text-muted-foreground">remaining</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Drawing Phase - Canvas */}
          {gamePhase === 'drawing' && (
            <>
              <DrawingCanvas
                isDrawer={isDrawer}
                onDrawingEvent={handleDrawingEvent}
                remoteEvents={remoteDrawingEvents}
              />

              {/* Chat / Guessing area for watchers */}
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
                            className={`p-2 rounded-lg ${msg.isCorrect
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

              {/* Artist word display - show what they need to draw */}
              {isDrawer && currentWord && gamePhase === 'drawing' && (
                <Card className="shadow-game border-2 border-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Palette className="h-5 w-5 text-primary" />
                      Your Word
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center p-6 bg-primary/10 rounded-lg">
                      <p className="text-3xl font-bold text-primary">{currentWord}</p>
                      <p className="text-sm text-muted-foreground mt-2">Draw this word for others to guess!</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Waiting Phase */}
          {(gamePhase === 'waiting' || gamePhase === 'roundEnd') && (
            <Card className="shadow-game">
              <CardContent className="py-12 text-center">
                <div className="animate-pulse text-6xl mb-4">
                  {gamePhase === 'roundEnd' ? '🎉' : '⏳'}
                </div>
                <p className="text-xl text-muted-foreground">
                  {gamePhase === 'roundEnd' ? 'Round completed!' : 'Preparing next game...'}
                </p>
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
                    className={`flex items-center justify-between p-3 rounded-lg transition-all ${player.userId === clientUserId
                      ? 'bg-primary/20 border-2 border-primary'
                      : 'bg-muted'
                      }`}
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
                      <div>
                        <span className="font-medium">{player.username}</span>
                        {player.userId === clientUserId && (
                          <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                        )}
                      </div>
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