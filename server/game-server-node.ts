import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

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
  currentRound?: any;
  maxPlayers: number;
  settings: { roundTimeSeconds: number };
}

const rooms = new Map<string, Room>();
const sessions = new Map<string, { userId: string; username: string; roomId: string; socketId?: string }>();
const sockets = new Map<string, any>();

const DEFAULT_LAT = 11.2488;
const DEFAULT_LON = 75.7839;

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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function shuffle<T>(array: T[]) {
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
      const socket = sockets.get(player.socketId!);
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify(message));
      }
    }
  });
}

// ========================================
// GAME LOGIC FUNCTIONS
// ========================================

/**
 * Get random words from category for word selection
 * @param category - Game category
 * @param count - Number of words to return (default: 2)
 */
function getRandomWords(category: string, count = 2) {
  const words = keralaDict[category] || [];
  if (words.length === 0) return [];

  const shuffled = [...words].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, words.length));
}

/**
 * Start word selection phase for current drawer
 */
function startWordSelection(roomId: string) {
  const room = rooms.get(roomId);
  if (!room || !room.currentRound) return;

  const words = getRandomWords(room.category, 2); // 2 word choices

  // Set timer end time for word selection
  const timerEndsAt = new Date(Date.now() + 15000).toISOString(); // 15 seconds
  room.currentRound.timerEndsAt = timerEndsAt;

  // Send words only to the drawer
  const drawer = room.players.find(p => p.userId === room.currentRound.drawerUserId);
  if (drawer && drawer.socketId) {
    const socket = sockets.get(drawer.socketId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({
        type: 'wordSelectionStart',
        words: words,
        timeLimit: 15,
        timerEndsAt: timerEndsAt
      }));
    }
  }

  // Broadcast to watchers (without words)
  room.players.forEach((player) => {
    if (player.userId !== room.currentRound.drawerUserId && player.socketId) {
      const socket = sockets.get(player.socketId);
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: 'wordSelectionStart',
          words: [], // Watchers don't see words
          timeLimit: 15,
          timerEndsAt: timerEndsAt
        }));
      }
    }
  });

  // Set timeout for word selection (15 seconds)
  setTimeout(() => {
    const currentRoom = rooms.get(roomId);
    if (!currentRoom || !currentRoom.currentRound) return;

    // Check if word was selected
    if (!currentRoom.currentRound.word) {
      // Timeout! Skip this game
      console.log(`Word selection timeout in room ${roomId}, skipping...`);
      broadcastToRoom(roomId, {
        type: 'wordSelectionTimeout'
      });

      // Move to next game after 2 seconds
      setTimeout(() => {
        moveToNextGame(roomId);
      }, 2000);
    }
  }, 15000);
}

/**
 * Start drawing phase after word is selected
 */
function startDrawingPhase(roomId: string) {
  const room = rooms.get(roomId);
  if (!room || !room.currentRound || !room.currentRound.word) return;

  const timerEndsAt = new Date(Date.now() + 30000).toISOString(); // 30 seconds
  room.currentRound.timerEndsAt = timerEndsAt;

  // Send word only to drawer
  const drawer = room.players.find(p => p.userId === room.currentRound.drawerUserId);
  if (drawer && drawer.socketId) {
    const socket = sockets.get(drawer.socketId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({
        type: 'wordSelected',
        word: room.currentRound.word,
        drawerUserId: room.currentRound.drawerUserId
      }));
    }
  }

  // Broadcast to watchers (without word)
  room.players.forEach((player) => {
    if (player.userId !== room.currentRound.drawerUserId && player.socketId) {
      const socket = sockets.get(player.socketId);
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: 'wordSelected',
          drawerUserId: room.currentRound.drawerUserId
        }));
      }
    }
  });

  console.log(`Drawing phase started in room ${roomId}, word: ${room.currentRound.word}`);

  // Set timeout for drawing phase (30 seconds)
  setTimeout(() => {
    const currentRoom = rooms.get(roomId);
    if (!currentRoom || !currentRoom.currentRound) return;

    console.log(`Drawing timeout in room ${roomId}`);
    broadcastToRoom(roomId, {
      type: 'drawingTimeout',
      word: currentRoom.currentRound.word
    });

    setTimeout(() => {
      moveToNextGame(roomId);
    }, 2000);
  }, 30000); // 30 seconds
}

/**
 * Move to next game in the round or start new round
 */
function moveToNextGame(roomId: string) {
  const room = rooms.get(roomId);
  if (!room || !room.currentRound) return;

  const activePlayers = room.players.filter(p => p.connected);
  if (activePlayers.length === 0) return;

  const currentGameNumber = room.currentRound.gameNumber || 1;
  const totalGames = activePlayers.length;

  if (currentGameNumber >= totalGames) {
    // Round finished, check if more rounds needed
    const currentRoundNumber = room.currentRound.roundNumber || 1;
    const totalRounds = 3; // Fixed 3 rounds

    if (currentRoundNumber >= totalRounds) {
      // Game completely finished!
      endGame(roomId);
      return;
    }

    // Start next round
    startNewRound(roomId);
  } else {
    // Move to next game in same round
    const nextGameNumber = currentGameNumber + 1;
    const drawerIndex = nextGameNumber - 1;
    const nextDrawer = activePlayers[drawerIndex];

    room.currentRound.gameNumber = nextGameNumber;
    room.currentRound.drawerUserId = nextDrawer.userId;
    room.currentRound.word = ''; // Reset word

    console.log(`Starting game ${nextGameNumber}/${totalGames} in room ${roomId}, drawer: ${nextDrawer.username}`);

    broadcastToRoom(roomId, {
      type: 'roomUpdate',
      room
    });

    // Start word selection for next game
    setTimeout(() => {
      startWordSelection(roomId);
    }, 1000);
  }
}

/**
 * Start a new round
 */
function startNewRound(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const roundNumber = (room.currentRound?.roundNumber || 0) + 1;
  const activePlayers = room.players.filter(p => p.connected);

  if (activePlayers.length === 0) return;

  const drawer = activePlayers[0]; // Start with first player

  room.currentRound = {
    roundNumber,
    gameNumber: 1,
    totalGames: activePlayers.length,
    drawerUserId: drawer.userId,
    word: '',
    wordRevealed: false,
    timerEndsAt: ''
  };

  console.log(`Round ${roundNumber} started in room ${roomId}`);

  broadcastToRoom(roomId, {
    type: 'roundStart',
    roundNumber,
    totalGames: activePlayers.length
  });

  broadcastToRoom(roomId, {
    type: 'roomUpdate',
    room
  });

  // Start word selection after 2 seconds
  setTimeout(() => {
    startWordSelection(roomId);
  }, 2000);
}

/**
 * End game and show final scores
 */
function endGame(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  console.log(`Game ended in room ${roomId}`);

  // Sort players by score
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

  broadcastToRoom(roomId, {
    type: 'gameEnd',
    finalScores: sortedPlayers.map(p => ({
      userId: p.userId,
      username: p.username,
      score: p.score
    }))
  });

  room.active = true; // Mark room as waiting for new game
  room.currentRound = undefined;
}

// ========================================
// REST ENDPOINTS
// ========================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    rooms: rooms.size,
    players: Array.from(rooms.values()).reduce((sum, r) => sum + r.players.length, 0),
    uptime: process.uptime()
  });
});

app.post('/create-room', (req, res) => {
  const { username, category, lat, lon, clientUserId } = req.body || {};
  const useLat = typeof lat === 'number' && !isNaN(lat) ? lat : DEFAULT_LAT;
  const useLon = typeof lon === 'number' && !isNaN(lon) ? lon : DEFAULT_LON;

  function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  const roomId = randomUUID();
  let displayCode = generateCode();
  let dcAttempts = 0;
  while (Array.from(rooms.values()).some(r => r.displayCode === displayCode) && dcAttempts < 20) {
    displayCode = generateCode();
    dcAttempts++;
  }

  const userId = (typeof clientUserId === 'string' && clientUserId.length > 0) ? clientUserId : randomUUID();
  const sessionToken = randomUUID();

  const room: Room = {
    roomId,
    displayCode,
    category,
    creatorUserId: userId,
    location: { lat: useLat, lon: useLon },
    active: true,
    createdAt: new Date().toISOString(),
    players: [{ userId, username, isAdmin: true, ready: false, score: 0, connected: true }],
    maxPlayers: 10,
    settings: { roundTimeSeconds: 30 } // 30 seconds for drawing
  };

  rooms.set(roomId, room);
  sessions.set(sessionToken, { userId, username, roomId });
  console.log(`Room created: ${roomId} (${displayCode}) by ${username}`);
  res.json({ roomId, sessionToken, room });
});

app.get('/room', (req, res) => {
  const roomId = req.query.roomId as string;
  if (!roomId) return res.status(400).json({ error: 'roomId required' });
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

app.post('/clear-rooms', (_req, res) => {
  rooms.clear();
  sessions.clear();
  sockets.clear();
  console.log('All rooms cleared');
  res.json({ ok: true });
});

app.get('/rooms', (req, res) => {
  const lat = parseFloat((req.query.lat as string) || `${DEFAULT_LAT}`);
  const lon = parseFloat((req.query.lon as string) || `${DEFAULT_LON}`);
  const radius = parseFloat((req.query.radius as string) || '100');

  const nearbyRooms = Array.from(rooms.values())
    .filter(room => {
      if (!room.active) return false;
      const hostPlayer = room.players.find(p => p.userId === room.creatorUserId);
      return !!hostPlayer && hostPlayer.connected;
    })
    .map(room => ({
      roomId: room.roomId,
      displayCode: room.displayCode,
      category: room.category,
      distanceKm: haversineKm(lat, lon, room.location.lat, room.location.lon),
      playerCount: room.players.length
    }))
    .filter(room => room.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  res.json(nearbyRooms);
});

app.get('/debug/rooms', (_req, res) => {
  const roomsArr = Array.from(rooms.values()).map(r => ({
    roomId: r.roomId,
    displayCode: r.displayCode,
    creatorUserId: r.creatorUserId,
    active: r.active,
    currentRound: r.currentRound,
    players: r.players.map(p => ({
      userId: p.userId,
      username: p.username,
      ready: p.ready,
      connected: p.connected,
      score: p.score,
      socketId: p.socketId
    }))
  }));
  const sessionsArr = Array.from(sessions.entries()).map(([token, s]) => ({ token, ...s }));
  const socketsArr = Array.from(sockets.keys());
  res.json({ rooms: roomsArr, sessions: sessionsArr, sockets: socketsArr });
});

app.post('/join-room', (req, res) => {
  const { username, roomId, clientUserId } = req.body || {};
  const room = rooms.get(roomId);

  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.players.length >= room.maxPlayers) return res.status(400).json({ error: 'Room is full' });

  const userId = (typeof clientUserId === 'string' && clientUserId.length > 0) ? clientUserId : randomUUID();
  const sessionToken = randomUUID();

  const existing = room.players.find(p => p.userId === userId);
  if (existing) {
    existing.username = username;
    existing.connected = false;
    console.log(`Re-joining ${username} (${userId}) to room ${roomId}`);
  } else {
    const player: Player = { userId, username, isAdmin: false, ready: true, score: 0, connected: false };
    room.players.push(player);
    console.log(`${username} joined room ${roomId}`);
  }

  sessions.set(sessionToken, { userId, username, roomId });
  res.json({ roomId, sessionToken, room });
});

// ========================================
// WEBSOCKET SERVER
// ========================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let currentSession: { userId: string; username: string; roomId: string; socketId?: string } | null = null;

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === 'joinRoom') {
        const { roomId, sessionToken } = data;
        const session = sessions.get(sessionToken);

        if (!session || session.roomId !== roomId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid session' }));
          return;
        }

        currentSession = session;
        const socketId = randomUUID();

        // Update session socket ID
        session.socketId = socketId;
        sockets.set(socketId, ws);

        const room = rooms.get(roomId);
        if (room) {
          const player = room.players.find(p => p.userId === session!.userId);
          if (player) {
            // IMPORTANT: Update the player's socket ID to the new one
            player.socketId = socketId;
            player.connected = true;
            console.log(`${session.username} reconnected to room ${roomId} with new socket ${socketId}`);
          }

          ws.send(JSON.stringify({ type: 'roomUpdate', room }));
          broadcastToRoom(roomId, { type: 'playerJoined', player }, socketId);
        }
      }

      // Handle waiting room chat messages
      if (data.type === 'chatMessage' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room && room.active) { // Only in waiting room (active = true)
          broadcastToRoom(currentSession.roomId, {
            type: 'chatMessage',
            userId: currentSession.userId,
            username: currentSession.username,
            text: data.text,
            timestamp: new Date().toISOString()
          });
          console.log(`[Chat] ${currentSession.username}: ${data.text}`);
        }
      }

      if (data.type === 'playerReady' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room) {
          const player = room.players.find(p => p.userId === currentSession!.userId);
          if (player && !player.isAdmin) {
            player.ready = data.ready;
            broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room });
          }
        }
      }

      if (data.type === 'startGame' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room) {
          const player = room.players.find(p => p.userId === currentSession!.userId);
          if (player && player.isAdmin) {
            const allReady = room.players.filter(p => !p.isAdmin).every(p => p.ready);

            if (!allReady && !data.forceStart) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not all players are ready' }));
              return;
            }

            room.active = false;
            room.players = shuffle(room.players.filter(p => p.connected));

            // Reset scores
            room.players.forEach(p => p.score = 0);

            console.log(`Game starting in room ${currentSession.roomId}`);

            // Start the first round
            startNewRound(currentSession.roomId);
          }
        }
      }

      if (data.type === 'selectWord' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room && room.currentRound) {
          const player = room.players.find(p => p.userId === currentSession!.userId);

          // Verify this user is the current drawer
          if (player && room.currentRound.drawerUserId === currentSession.userId) {
            room.currentRound.word = data.word;
            console.log(`${currentSession.username} selected word: ${data.word}`);

            // Start drawing phase
            startDrawingPhase(currentSession.roomId);
          }
        }
      }

      if (data.type === 'drawingEvent' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room && room.currentRound?.drawerUserId === currentSession.userId) {
          broadcastToRoom(currentSession.roomId, {
            type: 'drawingEvent',
            event: data.event
          }, currentSession.socketId);
        }
      }

      if (data.type === 'guess' && currentSession) {
        const { text } = data;
        const room = rooms.get(currentSession.roomId);

        if (room && room.currentRound && room.currentRound.word) {
          const guess = text.trim().toLowerCase();
          const word = room.currentRound.word.toLowerCase();
          const player = room.players.find(p => p.userId === currentSession!.userId);

          // Check if user is not the drawer
          if (player && currentSession.userId !== room.currentRound.drawerUserId) {
            if (guess === word) {
              // Correct guess!
              player.score += 10;

              const drawer = room.players.find(p => p.userId === room.currentRound?.drawerUserId);
              if (drawer) {
                drawer.score += 5; // Artist gets 5 points
              }

              broadcastToRoom(currentSession.roomId, {
                type: 'correctGuess',
                userId: currentSession.userId,
                username: currentSession.username,
                word: room.currentRound.word,
                pointsAwarded: 10,
                drawerUserId: room.currentRound.drawerUserId
              });

              broadcastToRoom(currentSession.roomId, {
                type: 'roomUpdate',
                room
              });

              console.log(`${currentSession.username} guessed correctly: ${word}`);

              // Move to next game after 3 seconds
              setTimeout(() => moveToNextGame(currentSession!.roomId), 3000);
            } else {
              // Wrong guess, broadcast as chat
              broadcastToRoom(currentSession.roomId, {
                type: 'chatMessage',
                userId: currentSession.userId,
                username: currentSession.username,
                text
              });
            }
          }
        }
      }

      if (data.type === 'leaveRoom' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room) {
          room.players = room.players.filter(p => p.userId !== currentSession!.userId);
          broadcastToRoom(currentSession.roomId, { type: 'playerLeft', userId: currentSession.userId });

          if (room.players.length === 0) {
            rooms.delete(currentSession.roomId);
            console.log(`Room ${currentSession.roomId} deleted (empty)`);
          } else {
            broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room });
          }
        }
      }

    } catch (error) {
      console.error('Error processing message:', error);
      try { ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' })); } catch (e) { }
    }
  });

  ws.on('close', () => {
    if (currentSession?.socketId) {
      sockets.delete(currentSession.socketId);

      const room = rooms.get(currentSession.roomId);
      if (room) {
        const player = room.players.find(p => p.userId === currentSession!.userId);
        if (player) {
          player.connected = false;
          broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room });
        }
      }
      console.log(`${currentSession.username} disconnected`);
    }
  });
});

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => console.log(`Game server listening on ${PORT}`));
