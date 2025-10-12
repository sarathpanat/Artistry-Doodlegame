// Deno edge runtime - local server copy of game-websocket function
// @ts-nocheck

export function startServer() {

interface Player {
  userId: string;
  username: string;
  isAdmin: boolean;
  ready: boolean;
  score: number;
  connected: boolean;
  socketId?: string;
}

interface Room {
  roomId: string;
  displayCode?: string;
  category: string;
  creatorUserId: string;
  location: { lat: number; lon: number };
  active: boolean;
  createdAt: string;
  players: Player[];
  currentRound?: {
    roundNumber: number;
    drawerUserId: string;
    word: string;
    wordRevealed: boolean;
    timerEndsAt: string;
  };
  maxPlayers: number;
  settings: {
    roundTimeSeconds: number;
  };
}

const rooms = new Map<string, Room>();
interface Session {
  userId: string;
  username: string;
  roomId: string;
  socketId?: string;
}

const sessions = new Map<string, Session>();
const sockets = new Map<string, WebSocket>();

const keralaDict: Record<string, string[]> = {
  "Malayalam Movies": [
    "Drishyam", "Lucifer", "Premam", "Bangalore Days", "Spadikam",
    "Kireedam", "Chotta Mumbai", "Hridayam", "Kumbalangi Nights",
    "Maheshinte Prathikaram", "Thondimuthalum Driksakshiyum",
    "Angamaly Diaries", "Ustad Hotel", "Charlie", "Action Hero Biju"
  ],
  "Kerala Dishes": [
    "Puttu", "Appam", "Idiyappam", "Sadya", "Malabar Biryani",
    "Fish Curry", "Beef Fry", "Parotta", "Avial", "Thoran",
    "Karimeen Pollichathu", "Erissery", "Olan", "Inji Curry",
    "Pachadi", "Payasam", "Unniyappam", "Ada Pradhaman"
  ],
  "Kerala Places": [
    "Munnar", "Alleppey", "Wayanad", "Kovalam", "Varkala",
    "Thekkady", "Athirapally", "Kumarakom", "Bekal", "Vagamon"
  ],
  "Malayalam Actors": [
    "Mohanlal", "Mammootty", "Prithviraj", "Fahadh Faasil",
    "Dulquer Salmaan", "Nivin Pauly", "Jayasurya", "Tovino Thomas"
  ]
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function broadcastToRoom(roomId: string, message: any, excludeSocketId?: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.players.forEach((player) => {
    if (player.socketId && player.socketId !== excludeSocketId) {
      const socket = sockets.get(player.socketId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    }
  });
}

function startNewRound(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const roundNumber = (room.currentRound?.roundNumber || 0) + 1;
  const activePlayers = room.players.filter(p => p.connected);
  
  if (activePlayers.length === 0) return;

  const drawerIndex = (roundNumber - 1) % activePlayers.length;
  const drawer = activePlayers[drawerIndex];
  
  const words = keralaDict[room.category] || [];
  const word = words[Math.floor(Math.random() * words.length)];
  
  const timerEndsAt = new Date(Date.now() + room.settings.roundTimeSeconds * 1000).toISOString();

  room.currentRound = {
    roundNumber,
    drawerUserId: drawer.userId,
    word,
    wordRevealed: false,
    timerEndsAt
  };

  // Broadcast round start to all players
  broadcastToRoom(roomId, {
    type: "roundStart",
    drawerUserId: drawer.userId,
    roundNumber,
    timeLimitSeconds: room.settings.roundTimeSeconds
  });

  // Send word only to drawer
  if (drawer.socketId) {
    const socket = sockets.get(drawer.socketId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "yourWord",
        word
      }));
    }
  }

  console.log(`Round ${roundNumber} started in room ${roomId}. Drawer: ${drawer.username}, Word: ${word}`);
}

Deno.serve(async (req) => {
  const { pathname } = new URL(req.url);

  // HTTP REST endpoints
  if (req.method === "POST" && pathname === "/create-room") {
    const { username, category, lat, lon, clientUserId } = await req.json();
    const DEFAULT_LAT = 11.2488;
    const DEFAULT_LON = 75.7839;
    const useLat = typeof lat === 'number' && !isNaN(lat) ? lat : DEFAULT_LAT;
    const useLon = typeof lon === 'number' && !isNaN(lon) ? lon : DEFAULT_LON;
    
    // generate a short 4-letter display code, but keep internal UUID
    function generateCode() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let s = '';
      for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
      return s;
    }
    const roomId = crypto.randomUUID();
    let displayCode = generateCode();
    let dcAttempts = 0;
    while (Array.from(rooms.values()).some(r => r.displayCode === displayCode) && dcAttempts < 20) {
      displayCode = generateCode();
      dcAttempts++;
    }
  // prefer client-provided user id so clients keep a consistent id across sessions/tabs
  const userId = typeof clientUserId === 'string' && clientUserId.length > 0 ? clientUserId : crypto.randomUUID();
    const sessionToken = crypto.randomUUID();

    const room: Room = {
      roomId,
      displayCode,
      category,
      creatorUserId: userId,
      location: { lat: useLat, lon: useLon },
      active: true,
      createdAt: new Date().toISOString(),
      // create initial admin player but avoid duplicate if same userId already exists
      players: (() => {
        const p = {
          userId,
          username,
          isAdmin: true,
          ready: false,
          score: 0,
          // user isn't actually connected until they open the websocket; mark false here
          // mark creator connected=true so the room is visible to other clients immediately
          connected: true
        };
        return [p];
      })(),
      maxPlayers: 10,
      settings: {
        roundTimeSeconds: 60
      }
    };

  rooms.set(roomId, room);
    sessions.set(sessionToken, { userId, username, roomId });

    console.log(`Room created: ${roomId} by ${username}`);

    return new Response(JSON.stringify({ roomId, sessionToken, room }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (req.method === "GET" && pathname === "/room") {
    const url = new URL(req.url);
    const roomId = url.searchParams.get('roomId');
    if (!roomId) {
      return new Response(JSON.stringify({ error: 'roomId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const room = rooms.get(roomId);
    if (!room) return new Response(JSON.stringify({ error: 'Room not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(room), { headers: { 'Content-Type': 'application/json' } });
  }

  if (req.method === "POST" && pathname === "/clear-rooms") {
    rooms.clear();
    sessions.clear();
    sockets.clear();
    console.log('All rooms cleared via /clear-rooms');
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (req.method === "GET" && pathname === "/rooms") {
    const url = new URL(req.url);
    const DEFAULT_LAT = 11.2488;
    const DEFAULT_LON = 75.7839;
    const latParam = url.searchParams.get("lat");
    const lonParam = url.searchParams.get("lon");
    const lat = latParam !== null ? parseFloat(latParam) : DEFAULT_LAT;
    const lon = lonParam !== null ? parseFloat(lonParam) : DEFAULT_LON;
    const radius = parseFloat(url.searchParams.get("radius") || "100");

    const nearbyRooms = Array.from(rooms.values())
      // only include rooms that are active AND whose creator/host is currently connected
      .filter(room => {
        if (!room.active) return false;
        const hostPlayer = room.players.find(p => p.userId === room.creatorUserId);
        return !!hostPlayer && hostPlayer.connected;
      })
      .map(room => {
        const distance = haversineKm(lat, lon, room.location.lat, room.location.lon);
        return {
          roomId: room.roomId,
          displayCode: room.displayCode,
          category: room.category,
          distanceKm: distance,
          playerCount: room.players.length
        };
      })
      .filter(room => room.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return new Response(JSON.stringify(nearbyRooms), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // Dev debug endpoint: show internal rooms/sessions summary
  if (req.method === "GET" && pathname === "/debug/rooms") {
    const roomsArr = Array.from(rooms.values()).map(r => ({
      roomId: r.roomId,
      displayCode: r.displayCode,
      creatorUserId: r.creatorUserId,
      active: r.active,
      players: r.players.map(p => ({ userId: p.userId, username: p.username, ready: p.ready, connected: p.connected, socketId: p.socketId }))
    }));
    const sessionsArr = Array.from(sessions.entries()).map(([token, s]) => ({ token, ...s }));
    const socketsArr = Array.from(sockets.keys());
    return new Response(JSON.stringify({ rooms: roomsArr, sessions: sessionsArr, sockets: socketsArr }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (req.method === "POST" && pathname === "/join-room") {
    const { username, roomId, clientUserId } = await req.json();
    const room = rooms.get(roomId);

    if (!room) {
      return new Response(JSON.stringify({ error: "Room not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (room.players.length >= room.maxPlayers) {
      return new Response(JSON.stringify({ error: "Room is full" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const userId = typeof clientUserId === 'string' && clientUserId.length > 0 ? clientUserId : crypto.randomUUID();
    const sessionToken = crypto.randomUUID();

    // If this userId already exists in the room (e.g. page refresh/rejoin), update the existing player
    let existing = room.players.find(p => p.userId === userId);
    if (existing) {
      existing.username = username; // refresh username if changed
      existing.ready = existing.ready ?? true; // preserve existing ready if present, else default true
      existing.connected = false; // REST join isn't websocket-connected yet
      console.log(`Re-joining existing player ${username} (${userId}) into room ${roomId}`);
    } else {
      const player: Player = {
        userId,
        username,
        isAdmin: false,
        // joined via REST, not yet websocket-connected
        ready: true,
        score: 0,
        connected: false
      };
      room.players.push(player);
      console.log(`${username} joined room ${roomId}`);
    }

    // save session mapping
    sessions.set(sessionToken, { userId, username, roomId });

    return new Response(JSON.stringify({ roomId, sessionToken, room }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // WebSocket upgrade
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    let currentSession: { userId: string; username: string; roomId: string } | null = null;

    socket.onopen = () => {
      console.log("WebSocket opened");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received message:", data.type);

        if (data.type === "joinRoom") {
          const { roomId, sessionToken } = data;
          const session = sessions.get(sessionToken);

          if (!session || session.roomId !== roomId) {
            socket.send(JSON.stringify({ type: "error", message: "Invalid session" }));
            return;
          }

          currentSession = session;
          const socketId = crypto.randomUUID();
          session.socketId = socketId;
          sockets.set(socketId, socket);

          const room = rooms.get(roomId);
          if (room) {
            const player = room.players.find(p => p.userId === session.userId);
            if (player) {
              player.socketId = socketId;
              player.connected = true;
            }

            socket.send(JSON.stringify({
              type: "roomUpdate",
              room
            }));

            broadcastToRoom(roomId, {
              type: "playerJoined",
              player
            }, socketId);
          }

          console.log(`${session.username} connected to room ${roomId}`);
        }

        if (data.type === "playerReady" && currentSession) {
          const room = rooms.get(currentSession.roomId);
          if (room) {
            const player = room.players.find(p => p.userId === currentSession!.userId);
            if (player && !player.isAdmin) {
              player.ready = data.ready;
              console.log(`playerReady: ${player.username} in room ${currentSession.roomId} -> ${data.ready}`);
              // broadcast full room state after ready toggle
              const message = { type: "roomUpdate", room };
              broadcastToRoom(currentSession.roomId, message);
              console.log('broadcasted roomUpdate after playerReady');
            }
          }
        }

        if (data.type === "startGame" && currentSession) {
          const room = rooms.get(currentSession.roomId);
          if (room) {
            const player = room.players.find(p => p.userId === currentSession!.userId);
            if (player && player.isAdmin) {
              const allReady = room.players.filter(p => !p.isAdmin).every(p => p.ready);
              console.log(`startGame request by ${player.username} (isAdmin=${player.isAdmin}) forceStart=${!!data.forceStart} allReady=${allReady}`);
              console.log('players state before start:', room.players.map(p => ({ userId: p.userId, username: p.username, ready: p.ready, connected: p.connected, isAdmin: p.isAdmin })));

              if (!allReady && !data.forceStart) {
                socket.send(JSON.stringify({
                  type: "error",
                  message: "Not all players are ready"
                }));
                return;
              }

              room.active = false;
              const shuffledPlayers = shuffle(room.players.filter(p => p.connected));
              room.players = shuffledPlayers;

              console.log(`Game starting in room ${currentSession.roomId}`);
              startNewRound(currentSession.roomId);

              // Broadcast the updated room state so waiting-room UIs can react
              broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room });
              console.log('broadcasted roomUpdate after startGame');
            }
          }
        }

        if (data.type === "drawingEvent" && currentSession) {
          const room = rooms.get(currentSession.roomId);
          if (room && room.currentRound?.drawerUserId === currentSession.userId) {
            broadcastToRoom(currentSession.roomId, {
              type: "drawingEvent",
              event: data.event
            }, currentSession.socketId);
          }
        }

        if (data.type === "guess" && currentSession) {
          const { text } = data;
          const room = rooms.get(currentSession.roomId);
          
          if (room && room.currentRound) {
            const guess = text.trim().toLowerCase();
            const word = room.currentRound.word.toLowerCase();
            const player = room.players.find(p => p.userId === currentSession!.userId);

            if (guess === word && player) {
              // Correct guess!
              player.score += 10;
              
              const drawer = room.players.find(p => p.userId === room.currentRound?.drawerUserId);
              if (drawer) {
                drawer.score += 5;
              }

              broadcastToRoom(currentSession.roomId, {
                type: "correctGuess",
                userId: currentSession.userId,
                username: currentSession.username,
                word: room.currentRound.word,
                pointsAwarded: 10
              });

              broadcastToRoom(currentSession.roomId, {
                type: "roomUpdate",
                room
              });

              console.log(`${currentSession.username} guessed correctly: ${word}`);

              // Start new round after a short delay
              setTimeout(() => startNewRound(currentSession!.roomId), 3000);
            } else {
              // Wrong guess, broadcast as chat
              broadcastToRoom(currentSession.roomId, {
                type: "chatMessage",
                userId: currentSession.userId,
                username: currentSession.username,
                text
              });
            }
          }
        }

        if (data.type === "leaveRoom" && currentSession) {
          const room = rooms.get(currentSession.roomId);
          if (room) {
            room.players = room.players.filter(p => p.userId !== currentSession!.userId);
            
            broadcastToRoom(currentSession.roomId, {
              type: "playerLeft",
              userId: currentSession.userId
            });

            if (room.players.length === 0) {
              rooms.delete(currentSession.roomId);
              console.log(`Room ${currentSession.roomId} deleted (empty)`);
            } else {
              broadcastToRoom(currentSession.roomId, {
                type: "roomUpdate",
                room
              });
            }

            console.log(`${currentSession.username} left room ${currentSession.roomId}`);
          }
        }

      } catch (error) {
        console.error("Error processing message:", error);
        socket.send(JSON.stringify({ type: "error", message: "Internal server error" }));
      }
    };

    socket.onclose = () => {
      if (currentSession?.socketId) {
        sockets.delete(currentSession.socketId);
        
        const room = rooms.get(currentSession.roomId);
        if (room) {
          const player = room.players.find(p => p.userId === currentSession!.userId);
          if (player) {
            player.connected = false;
            broadcastToRoom(currentSession.roomId, {
              type: "roomUpdate",
              room
            });
          }
        }
        console.log(`${currentSession.username} disconnected`);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return response;
  }

    return new Response("Not found", { status: 404 });
    });

  } // end startServer

/*
Run locally with:
deno run --allow-net server/game-server.ts

The client should be configured to point to the local server via VITE_GAME_SERVER_URL in the .env file.
*/
