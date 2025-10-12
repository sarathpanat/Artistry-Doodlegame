import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json());

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
const sockets = new Map<string, WebSocket>();

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
  broadcastToRoom(roomId, {
    type: 'roundStart',
    drawerUserId: drawer.userId,
    roundNumber,
    timeLimitSeconds: room.settings.roundTimeSeconds
  });
  if (drawer.socketId) {
    const socket = sockets.get(drawer.socketId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ type: 'yourWord', word }));
    }
  }
}

// REST endpoints
app.post('/create-room', (req, res) => {
  const { username, category, lat, lon } = req.body || {};
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
  const userId = randomUUID();
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
    settings: { roundTimeSeconds: 60 }
  };

  rooms.set(roomId, room);
  sessions.set(sessionToken, { userId, username, roomId });
  console.log(`Room created: ${roomId} by ${username}`);
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
  console.log('All rooms cleared via /clear-rooms');
  res.json({ ok: true });
});

app.get('/rooms', (req, res) => {
  const lat = parseFloat((req.query.lat as string) || `${DEFAULT_LAT}`);
  const lon = parseFloat((req.query.lon as string) || `${DEFAULT_LON}`);
  const radius = parseFloat((req.query.radius as string) || '100');
  const nearbyRooms = Array.from(rooms.values())
    .filter(room => room.active)
    .map(room => ({ roomId: room.roomId, displayCode: room.displayCode, category: room.category, distanceKm: haversineKm(lat, lon, room.location.lat, room.location.lon), playerCount: room.players.length }))
    .filter(room => room.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  res.json(nearbyRooms);
});

app.post('/join-room', (req, res) => {
  const { username, roomId } = req.body || {};
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.players.length >= room.maxPlayers) return res.status(400).json({ error: 'Room is full' });
  const userId = randomUUID();
  const sessionToken = randomUUID();
  const player: Player = { userId, username, isAdmin: false, ready: false, score: 0, connected: true };
  room.players.push(player);
  sessions.set(sessionToken, { userId, username, roomId });
  console.log(`${username} joined room ${roomId}`);
  res.json({ roomId, sessionToken, room });
});

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
        session.socketId = socketId;
        sockets.set(socketId, ws);
        const room = rooms.get(roomId);
        if (room) {
          const player = room.players.find(p => p.userId === session!.userId);
          if (player) {
            player.socketId = socketId;
            player.connected = true;
          }
          ws.send(JSON.stringify({ type: 'roomUpdate', room }));
          broadcastToRoom(roomId, { type: 'playerJoined', player }, socketId);
        }
      }

      if (data.type === 'playerReady' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room) {
          const player = room.players.find(p => p.userId === currentSession!.userId);
          if (player && !player.isAdmin) {
            player.ready = data.ready;
            broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room });
            console.log(`${player.username} ready status: ${data.ready}`);
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
            const shuffledPlayers = shuffle(room.players.filter(p => p.connected));
            room.players = shuffledPlayers;
            console.log(`Game starting in room ${currentSession.roomId}`);
            startNewRound(currentSession.roomId);
          }
        }
      }

      if (data.type === 'drawingEvent' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room && room.currentRound?.drawerUserId === currentSession.userId) {
          broadcastToRoom(currentSession.roomId, { type: 'drawingEvent', event: data.event }, currentSession.socketId);
        }
      }

      if (data.type === 'guess' && currentSession) {
        const { text } = data;
        const room = rooms.get(currentSession.roomId);
        if (room && room.currentRound) {
          const guess = text.trim().toLowerCase();
          const word = room.currentRound.word.toLowerCase();
          const player = room.players.find(p => p.userId === currentSession!.userId);
          if (guess === word && player) {
            player.score += 10;
            const drawer = room.players.find(p => p.userId === room.currentRound?.drawerUserId);
            if (drawer) drawer.score += 5;
            broadcastToRoom(currentSession.roomId, { type: 'correctGuess', userId: currentSession.userId, username: currentSession.username, word: room.currentRound.word, pointsAwarded: 10 });
            broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room });
            console.log(`${currentSession.username} guessed correctly: ${word}`);
            setTimeout(() => startNewRound(currentSession!.roomId), 3000);
          } else {
            broadcastToRoom(currentSession.roomId, { type: 'chatMessage', userId: currentSession.userId, username: currentSession.username, text });
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
          console.log(`${currentSession.username} left room ${currentSession.roomId}`);
        }
      }

    } catch (error) {
      console.error('Error processing message:', error);
      try { ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' })); } catch (e) {}
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
server.listen(PORT, () => console.log(`Game server (Node) listening on ${PORT}`));
