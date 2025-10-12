import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json());

// Simple CORS middleware so the Vite dev server can call this API
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logging to help debugging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// Simple CORS & request logging for local dev (allows Vite dev server to call this API)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  console.log('[HTTP]', req.method, req.url);
  next();
});

const rooms = new Map();
const sessions = new Map();
const sockets = new Map();

const DEFAULT_LAT = 11.2488;
const DEFAULT_LON = 75.7839;

const keralaDict = {
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
  "Kerala Places": ["Munnar", "Alleppey", "Wayanad", "Kovalam", "Varkala","Thekkady","Athirapally","Kumarakom","Bekal","Vagamon"],
  "Malayalam Actors": ["Mohanlal", "Mammootty", "Prithviraj", "Fahadh Faasil","Dulquer Salmaan", "Nivin Pauly", "Jayasurya", "Tovino Thomas"]
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function broadcastToRoom(roomId, message, excludeSocketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.forEach((player) => {
    if (player.socketId && player.socketId !== excludeSocketId) {
      const socket = sockets.get(player.socketId);
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify(message));
      }
    }
  });
}

function startNewRound(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const roundNumber = (room.currentRound?.roundNumber || 0) + 1;
  const activePlayers = room.players.filter(p => p.connected);
  if (activePlayers.length === 0) return;
  const drawerIndex = (roundNumber - 1) % activePlayers.length;
  const drawer = activePlayers[drawerIndex];
  const words = keralaDict[room.category] || [];
  const word = words[Math.floor(Math.random() * words.length)];
  room.currentRound = { roundNumber, drawerUserId: drawer.userId, word, wordRevealed: false, timerEndsAt: new Date(Date.now() + room.settings.roundTimeSeconds * 1000).toISOString() };
  broadcastToRoom(roomId, { type: 'roundStart', drawerUserId: drawer.userId, roundNumber, timeLimitSeconds: room.settings.roundTimeSeconds });
  if (drawer.socketId) {
    const socket = sockets.get(drawer.socketId);
    if (socket && socket.readyState === 1) socket.send(JSON.stringify({ type: 'yourWord', word }));
  }
}

app.post('/create-room', (req, res) => {
  const { username, category, lat, lon, clientUserId } = req.body || {};
  const useLat = typeof lat === 'number' && !isNaN(lat) ? lat : DEFAULT_LAT;
  const useLon = typeof lon === 'number' && !isNaN(lon) ? lon : DEFAULT_LON;
  function generateCode() { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length)); return s; }
  const roomId = randomUUID();
  let displayCode = generateCode();
  let dcAttempts = 0;
  while (Array.from(rooms.values()).some(r => r.displayCode === displayCode) && dcAttempts < 20) { displayCode = generateCode(); dcAttempts++; }
  const userId = (typeof clientUserId === 'string' && clientUserId.length > 0) ? clientUserId : randomUUID();
  const sessionToken = randomUUID();
  const room = { roomId, displayCode, category, creatorUserId: userId, location: { lat: useLat, lon: useLon }, active: true, createdAt: new Date().toISOString(), players: [{ userId, username, isAdmin: true, ready: false, score: 0, // user isn't websocket-connected until WS join
    // mark creator connected=true so the room is visible to other clients immediately
    connected: true }], maxPlayers: 10, settings: { roundTimeSeconds: 60 } };
  rooms.set(roomId, room);
  sessions.set(sessionToken, { userId, username, roomId });
  res.json({ roomId, sessionToken, room });
});

app.get('/room', (req, res) => {
  const roomId = req.query.roomId;
  if (!roomId) return res.status(400).json({ error: 'roomId required' });
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

app.post('/clear-rooms', (_req, res) => { rooms.clear(); sessions.clear(); sockets.clear(); res.json({ ok: true }); });

app.get('/rooms', (req, res) => {
  const lat = parseFloat(req.query.lat || `${DEFAULT_LAT}`);
  const lon = parseFloat(req.query.lon || `${DEFAULT_LON}`);
  const radius = parseFloat(req.query.radius || '100');
  const nearbyRooms = Array.from(rooms.values())
    // only include rooms that are active AND whose creator/host is currently connected
    .filter(room => {
      if (!room.active) return false;
      const hostPlayer = room.players.find(p => p.userId === room.creatorUserId);
      return !!hostPlayer && hostPlayer.connected;
    })
    .map(room => ({ roomId: room.roomId, displayCode: room.displayCode, category: room.category, distanceKm: haversineKm(lat, lon, room.location.lat, room.location.lon), playerCount: room.players.length }))
    .filter(room => room.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  res.json(nearbyRooms);
});

// Dev debug endpoint: show internal rooms/sessions summary
app.get('/debug/rooms', (_req, res) => {
  const roomsArr = Array.from(rooms.values()).map(r => ({
    roomId: r.roomId,
    displayCode: r.displayCode,
    creatorUserId: r.creatorUserId,
    active: r.active,
    players: r.players.map(p => ({ userId: p.userId, username: p.username, ready: p.ready, connected: p.connected, socketId: p.socketId }))
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
  // If user already exists in the room (e.g. refresh/rejoin), update existing record and preserve ready
  const existing = room.players.find(p => p.userId === userId);
  if (existing) {
    existing.username = username;
    existing.connected = false; // REST join is not websocket-connected
    console.log(`Re-joining existing player ${username} (${userId}) into room ${roomId}`);
  } else {
    const player = { userId, username, isAdmin: false, ready: true, score: 0, // joined via REST, not yet websocket-connected
      connected: false };
    room.players.push(player);
    console.log(`${username} joined room ${roomId}`);
  }
  sessions.set(sessionToken, { userId, username, roomId });
  res.json({ roomId, sessionToken, room });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let currentSession = null;
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'joinRoom') {
        const { roomId, sessionToken } = data;
        const session = sessions.get(sessionToken);
        if (!session || session.roomId !== roomId) { ws.send(JSON.stringify({ type: 'error', message: 'Invalid session' })); return; }
        currentSession = session;
        const socketId = randomUUID();
        session.socketId = socketId;
        sockets.set(socketId, ws);
        const room = rooms.get(roomId);
        if (room) {
          const player = room.players.find(p => p.userId === session.userId);
          if (player) { player.socketId = socketId; player.connected = true; }
          ws.send(JSON.stringify({ type: 'roomUpdate', room }));
          broadcastToRoom(roomId, { type: 'playerJoined', player }, socketId);
        }
      }

      if (data.type === 'playerReady' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room) {
          const player = room.players.find(p => p.userId === currentSession.userId);
          if (player && !player.isAdmin) { player.ready = data.ready; broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room }); }
        }
      }
      if (data.type === 'playerReady' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room) {
          const player = room.players.find(p => p.userId === currentSession.userId);
          if (player && !player.isAdmin) {
            player.ready = data.ready;
            console.log(`playerReady: ${player.username} in room ${currentSession.roomId} -> ${data.ready}`);
            const message = { type: 'roomUpdate', room };
            broadcastToRoom(currentSession.roomId, message);
            console.log('broadcasted roomUpdate after playerReady');
          }
        }
      }

      if (data.type === 'startGame' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room) {
          const player = room.players.find(p => p.userId === currentSession.userId);
          if (player && player.isAdmin) {
            const allReady = room.players.filter(p => !p.isAdmin).every(p => p.ready);
            console.log(`startGame request by ${player.username} (isAdmin=${player.isAdmin}) forceStart=${!!data.forceStart} allReady=${allReady}`);
            console.log('players state before start:', room.players.map(p => ({ userId: p.userId, username: p.username, ready: p.ready, connected: p.connected, isAdmin: p.isAdmin })));
            if (!allReady && !data.forceStart) { ws.send(JSON.stringify({ type: 'error', message: 'Not all players are ready' })); return; }
            room.active = false;
            room.players = shuffle(room.players.filter(p => p.connected));
              startNewRound(currentSession.roomId);
              // After starting a round, broadcast roundStart and roomUpdate to connected players
              const r = rooms.get(currentSession.roomId);
              if (r && r.currentRound) {
                broadcastToRoom(currentSession.roomId, { type: 'roundStart', drawerUserId: r.currentRound.drawerUserId, roundNumber: r.currentRound.roundNumber, timeLimitSeconds: r.settings.roundTimeSeconds });
                // send the drawer their word
                const drawer = r.players.find(p => p.userId === r.currentRound.drawerUserId);
                if (drawer && drawer.socketId) {
                  const s = sockets.get(drawer.socketId);
                  if (s && s.readyState === 1) s.send(JSON.stringify({ type: 'yourWord', word: r.currentRound.word }));
                }
              }
              // broadcast updated room state
              broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room });
              console.log('broadcasted roomUpdate and roundStart after startGame');
          }
        }
      }

      if (data.type === 'drawingEvent' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room && room.currentRound?.drawerUserId === currentSession.userId) broadcastToRoom(currentSession.roomId, { type: 'drawingEvent', event: data.event }, currentSession.socketId);
      }

      if (data.type === 'guess' && currentSession) {
        const { text } = data;
        const room = rooms.get(currentSession.roomId);
        if (room && room.currentRound) {
          const guess = text.trim().toLowerCase();
          const word = room.currentRound.word.toLowerCase();
          const player = room.players.find(p => p.userId === currentSession.userId);
          if (guess === word && player) {
            player.score += 10;
            const drawer = room.players.find(p => p.userId === room.currentRound?.drawerUserId);
            if (drawer) drawer.score += 5;
            broadcastToRoom(currentSession.roomId, { type: 'correctGuess', userId: currentSession.userId, username: currentSession.username, word: room.currentRound.word, pointsAwarded: 10 });
            broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room });
            setTimeout(() => startNewRound(currentSession.roomId), 3000);
          } else {
            broadcastToRoom(currentSession.roomId, { type: 'chatMessage', userId: currentSession.userId, username: currentSession.username, text });
          }
        }
      }

      if (data.type === 'leaveRoom' && currentSession) {
        const room = rooms.get(currentSession.roomId);
        if (room) {
          room.players = room.players.filter(p => p.userId !== currentSession.userId);
          broadcastToRoom(currentSession.roomId, { type: 'playerLeft', userId: currentSession.userId });
          if (room.players.length === 0) rooms.delete(currentSession.roomId); else broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room });
        }
      }

    } catch (error) {
      try { ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' })); } catch (e) {}
    }
  });

  ws.on('close', () => {
    if (currentSession?.socketId) {
      sockets.delete(currentSession.socketId);
      const room = rooms.get(currentSession.roomId);
      if (room) {
        const player = room.players.find(p => p.userId === currentSession.userId);
        if (player) { player.connected = false; broadcastToRoom(currentSession.roomId, { type: 'roomUpdate', room }); }
      }
    }
  });
});

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => console.log(`Game server (Node) listening on ${PORT}`));
