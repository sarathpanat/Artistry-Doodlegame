import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Check, Crown, X, Send, MessageCircle, Trophy } from "lucide-react";
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
import { GameWebSocket } from "@/utils/websocket";

const WaitingRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const wsRef = useRef<GameWebSocket | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [category, setCategory] = useState("Malayalam Movies");
  const [roomName, setRoomName] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; username: string; text: string; timestamp: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const navigatingToGameRef = useRef(false);
  const [lastGameScores, setLastGameScores] = useState<Array<{ userId: string; username: string; score: number }> | null>(null);

  const clientUserId = typeof window !== 'undefined' ? sessionStorage.getItem('clientUserId') : null;
  const username = typeof window !== 'undefined' ? sessionStorage.getItem('username') || 'Guest' : 'Guest';
  const [serverRoomLoaded, setServerRoomLoaded] = useState(false);

  // Load last game scores on mount
  useEffect(() => {
    const scoresStr = sessionStorage.getItem('lastGameScores');
    if (scoresStr) {
      try {
        const scores = JSON.parse(scoresStr);
        setLastGameScores(scores);
      } catch (e) {
        console.error('Failed to parse last game scores', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!roomId) return;

    // Define message handler outside of loadRoom so it persists
    const handleMessage = (data: any) => {
      // any incoming message indicates websocket is alive
      setWsStatus('connected');
      switch (data.type) {
        case 'roomUpdate': {
          const room = data.room;
          setPlayers(room.players || []);
          setCategory(room.category || 'Malayalam Movies');
          setRoomName(room.displayCode || room.roomId || null);
          setIsAdmin(Boolean(room.creatorUserId === clientUserId || (room.players || []).some((p: Player) => p.isAdmin && p.userId === clientUserId)));
          const me = (room.players || []).find((p: Player) => p.userId === clientUserId || p.username === username);
          setIsReady(Boolean(me?.ready));
          break;
        }
        case 'playerReady': {
          const { userId, ready } = data;
          setPlayers((prev) => prev.map(p => p.userId === userId ? { ...p, ready } : p));
          break;
        }
        case 'playerJoined': {
          const player: Player = data.player;
          setPlayers((prev) => {
            if (prev.some(p => p.userId === player.userId)) return prev;
            return [...prev, player];
          });
          toast.success(`${player.username} joined`);
          break;
        }
        case 'playerLeft': {
          const userId: string = data.userId;
          setPlayers((prev) => prev.filter(p => p.userId !== userId));
          break;
        }
        case 'roundStart': {
          // room is starting — navigate to game
          navigatingToGameRef.current = true;
          navigate(`/game/${roomId}`);
          break;
        }
        case 'chatMessage': {
          setChatMessages((prev) => [...prev, {
            id: `${data.userId}-${Date.now()}`,
            username: data.username,
            text: data.text,
            timestamp: data.timestamp || new Date().toISOString()
          }]);
          break;
        }
        case 'error': {
          toast.error(data.message || 'Server error');
          break;
        }
        default:
          break;
      }
    };

    const handleError = (err: string) => { console.warn('WebSocket error', err); };

    async function loadRoom() {
      try {
        const base = (import.meta.env.VITE_GAME_SERVER_URL || '').replace(/\/$/, '');
        const basePath = (import.meta.env.VITE_GAME_WS_BASE || '').replace(/\/$/, '');
        const url = `${base}${basePath}/room?roomId=${roomId}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed to fetch room');
        const room = await resp.json();
        setPlayers(room.players || []);
        setCategory(room.category || 'Malayalam Movies');
        setRoomName(room.displayCode || room.roomId || null);
        setIsAdmin(Boolean(room.creatorUserId === clientUserId || (room.players || []).some((p: Player) => p.isAdmin && p.userId === clientUserId)));
        const me = (room.players || []).find((p: Player) => p.userId === clientUserId || p.username === username);
        setIsReady(Boolean(me?.ready));
        setServerRoomLoaded(true);

        // Connect or re-register websocket handlers
        const sessionToken = sessionStorage.getItem('sessionToken');
        if (sessionToken) {
          try {
            // If WebSocket already exists (returning from game), just update the message handler
            if (wsRef.current) {
              console.log('Re-registering WebSocket message handler for waiting room');
              wsRef.current.updateHandlers(handleMessage, handleError);
            } else {
              // Create new WebSocket connection
              console.log('Creating new WebSocket connection for waiting room');
              wsRef.current = new GameWebSocket(sessionToken, roomId!, handleMessage, handleError, (s) => setWsStatus(s));
              wsRef.current.connect();
            }
          } catch (e) {
            console.warn('Failed to connect WebSocket after server load', e);
          }
        }
      } catch (err) {
        const local = JSON.parse(localStorage.getItem('localRooms') || '[]');
        const found = local.find((r: any) => r.roomId === roomId || r.displayCode === roomId);
        if (found) {
          setPlayers(found.players || []);
          setCategory(found.category || 'Malayalam Movies');
          setRoomName(found.displayCode || found.roomId || null);
          setIsAdmin((found.players || []).some((p: any) => p.isAdmin && p.userId === clientUserId));
          const me = (found.players || []).find((p: any) => p.userId === clientUserId || p.username === username);
          setIsReady(Boolean(me?.ready));
        } else {
          setPlayers([]);
          setIsAdmin(false);
        }
      }
    }

    loadRoom();

    return () => {
      if (wsRef.current) {
        // Don't call leaveRoom if we're navigating to the game
        if (!navigatingToGameRef.current) {
          try { wsRef.current.leaveRoom(); } catch (e) { }
          try { wsRef.current.disconnect(); } catch (e) { }
        }
        // Don't set wsRef to null if navigating to game - Game.tsx will reuse it
        if (!navigatingToGameRef.current) {
          wsRef.current = null;
        }
      }
      try { if (bcRef.current) { bcRef.current.close(); bcRef.current = null; } } catch (e) { }
    };
  }, [roomId]);

  useEffect(() => {
    try {
      const bc = new BroadcastChannel('geo-doodle-localRooms');
      bcRef.current = bc;
      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (msg?.type === 'localRoomsUpdated') {
          const local = msg.rooms || [];
          const found = local.find((r: any) => r.roomId === roomId || r.displayCode === roomId);
          if (found) {
            setPlayers(found.players || []);
            setCategory(found.category || 'Malayalam Movies');
            setRoomName(found.displayCode || found.roomId || null);
            setIsAdmin((found.players || []).some((p: any) => p.isAdmin && p.userId === clientUserId));
            const me = (found.players || []).find((p: any) => p.userId === clientUserId || p.username === username);
            setIsReady(Boolean(me?.ready));
          }
        }
      };
    } catch (e) {
      // BroadcastChannel not available
    }

    return () => { try { if (bcRef.current) { bcRef.current.close(); bcRef.current = null; } } catch (e) { } };
  }, [roomId]);

  const handleReadyToggle = () => {
    const newReady = !isReady;
    setIsReady(newReady);
    setPlayers((prev) => prev.map((p) => (p.userId === clientUserId || p.username === username ? { ...p, ready: newReady } : p)));

    if (wsRef.current) {
      wsRef.current.setReady(newReady);
      (async () => {
        try {
          const base = (import.meta.env.VITE_GAME_SERVER_URL || '').replace(/\/$/, '');
          const basePath = (import.meta.env.VITE_GAME_WS_BASE || '').replace(/\/$/, '');
          const url = `${base}${basePath}/room?roomId=${roomId}`;
          const resp = await fetch(url);
          if (resp.ok) {
            const room = await resp.json();
            setPlayers(room.players || []);
            setCategory(room.category || 'Malayalam Movies');
            setRoomName(room.displayCode || room.roomId || null);
            setIsAdmin(Boolean(room.creatorUserId === clientUserId || (room.players || []).some((p: Player) => p.isAdmin && p.userId === clientUserId)));
            const me = (room.players || []).find((p: Player) => p.userId === clientUserId || p.username === username);
            setIsReady(Boolean(me?.ready));
          }
        } catch (e) { }
      })();
    } else {
      const local = JSON.parse(localStorage.getItem('localRooms') || '[]');
      const idx = local.findIndex((r: any) => r.roomId === roomId || r.displayCode === roomId);
      if (idx >= 0) {
        local[idx].players = local[idx].players || [];
        local[idx].players = local[idx].players.map((p: any) => p.userId === clientUserId || p.username === username ? { ...p, ready: newReady } : p);
        localStorage.setItem('localRooms', JSON.stringify(local));
        try { bcRef.current?.postMessage({ type: 'localRoomsUpdated', rooms: local }); } catch (e) { }
      }
    }

    toast.success(newReady ? "You're ready!" : "Ready status removed");
  };

  const handleStartGame = () => {
    if (!isAdmin) { toast.error("Only the host can start the game"); return; }
    const allReady = players.filter(p => !p.isAdmin).every(p => p.ready);
    const forceStart = !allReady && window.confirm('Not all players are ready. Force start the game?');
    if (!allReady && !forceStart) { toast.error('Start cancelled'); return; }

    if (wsRef.current) {
      wsRef.current.startGame(forceStart);
      toast.success(forceStart ? 'Force starting game...' : 'Starting game...');
    } else {
      toast.success('Starting game (offline)...');
      navigate(`/game/${roomId}`);
    }
  };

  useEffect(() => {
    if (wsStatus === 'connected' && wsRef.current) {
      try { wsRef.current.setReady(isReady); } catch (e) { console.warn('Failed to send pending ready state after connect', e); }
    }
  }, [wsStatus]);

  const handleLeave = () => { toast.info('Left the room'); navigate('/'); };

  const handleSendChat = () => {
    if (!chatInput.trim() || !wsRef.current) return;
    wsRef.current.sendChatMessage(chatInput);
    setChatInput("");
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  return (
    <div className="min-h-screen bg-background p-4">
      <Button variant="ghost" onClick={() => setShowExitDialog(true)} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Leave Room
      </Button>

      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_400px] gap-6">
          {/* Players Section */}
          <Card className="shadow-game gradient-card border-2 border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-3xl text-primary">Waiting Room</CardTitle>
                  <p className="text-muted-foreground mt-1">Room: <span className="font-mono text-foreground">{roomName || roomId}</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-secondary text-secondary-foreground text-lg px-4 py-2">{category}</Badge>
                  <span className="text-sm font-mono text-muted-foreground">{wsStatus}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-semibold text-xl">Players ({players.length}/10)</h3>
                <div className="grid gap-3">
                  {players.map((player) => (
                    <div key={player.userId} className="flex items-center justify-between p-4 rounded-lg bg-card border-2 border-border transition-smooth">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary text-primary-foreground font-semibold">{player.username.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{player.username}</span>
                            {player.isAdmin && (<Crown className="h-4 w-4 text-secondary" />)}
                          </div>
                        </div>
                      </div>
                      <div>
                        {player.isAdmin ? (
                          <Badge variant="outline">Host</Badge>
                        ) : player.ready ? (
                          <Badge className="bg-primary text-primary-foreground"><Check className="mr-1 h-3 w-3" />Ready</Badge>
                        ) : (
                          <Badge variant="secondary"><X className="mr-1 h-3 w-3" />Not Ready</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Last Game Scores */}
              {lastGameScores && lastGameScores.length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  <h3 className="font-semibold text-xl flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Last Game Results
                  </h3>
                  <div className="space-y-2">
                    {lastGameScores.map((player, index) => (
                      <div key={player.userId} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                        <div className="flex items-center gap-3">
                          {index === 0 && <Trophy className="h-5 w-5 text-yellow-500" />}
                          {index === 1 && <Trophy className="h-5 w-5 text-gray-400" />}
                          {index === 2 && <Trophy className="h-5 w-5 text-amber-600" />}
                          {index > 2 && <span className="w-5 text-center text-muted-foreground">#{index + 1}</span>}
                          <span className="font-semibold">{player.username}</span>
                        </div>
                        <Badge variant="outline" className="text-lg font-bold">
                          {player.score} pts
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLastGameScores(null);
                      sessionStorage.removeItem('lastGameScores');
                    }}
                    className="w-full"
                  >
                    Clear Scores
                  </Button>
                </div>
              )}

              <div className="flex gap-3">
                {players.some(p => p.isAdmin && p.userId === clientUserId) || isAdmin ? (
                  <Button onClick={handleStartGame} className="flex-1 bg-primary text-primary-foreground hover:bg-primary-glow transition-bounce text-lg py-6" size="lg">Start Game</Button>
                ) : (
                  <Button onClick={handleReadyToggle} variant={isReady ? 'secondary' : 'default'} className="flex-1 transition-bounce text-lg py-6" size="lg">
                    {isReady ? (<><Check className="mr-2 h-5 w-5" />Ready</>) : ('Mark as Ready')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Chat Section */}
          <Card className="shadow-game border-2 border-primary/20 h-fit lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Room Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-[400px] rounded-lg border p-4" ref={chatScrollRef}>
                <div className="space-y-3">
                  {chatMessages.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">No messages yet. Start chatting!</p>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="p-2 rounded-lg bg-muted">
                        <span className="font-semibold text-sm">{msg.username}:</span>
                        <span className="ml-2 text-sm">{msg.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                />
                <Button onClick={handleSendChat} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Room?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to leave this room? You'll need to join again to continue playing.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave} className="bg-destructive text-destructive-foreground">Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WaitingRoom;
