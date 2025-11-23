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
  hasGuessed?: boolean; // Track if player has guessed correctly in current round
  guessTime?: number; // Timestamp when player guessed correctly
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

// Timer management to prevent race conditions
interface RoomTimers {
  wordSelectionTimer?: NodeJS.Timeout;
  drawingTimer?: NodeJS.Timeout;
  roundEndTimer?: NodeJS.Timeout;
}
const roomTimers = new Map<string, RoomTimers>();

function clearAllTimers(roomId: string) {
  const timers = roomTimers.get(roomId);
  if (timers) {
    if (timers.wordSelectionTimer) clearTimeout(timers.wordSelectionTimer);
    if (timers.drawingTimer) clearTimeout(timers.drawingTimer);
    if (timers.roundEndTimer) clearTimeout(timers.roundEndTimer);
  }
  roomTimers.delete(roomId);
}

// Scoring functions
function calculateGuesserScore(
  guessTimestamp: number,
  drawingStartTime: number,
  maxTime: number,
  position: number,
  totalPlayers: number
): number {
  const basePoints = 100;
  const timeElapsed = (guessTimestamp - drawingStartTime) / 1000;
  const timeBonus = Math.max(0, Math.round(100 - (timeElapsed / maxTime * 100)));
  const positionBonus = (totalPlayers - position + 1) * 10;

  return basePoints + timeBonus + positionBonus;
}

function calculateArtistScore(
  correctGuesses: number,
  drawingStartTime: number,
  firstGuessTime?: number
): number {
  const basePoints = 50;
  const guessBonus = correctGuesses * 25;

  // Speed bonus if first guess was in first 40 seconds (half of 80s)
  let speedBonus = 0;
  if (firstGuessTime && drawingStartTime) {
    const timeToFirstGuess = (firstGuessTime - drawingStartTime) / 1000;
    if (timeToFirstGuess < 40) {
      speedBonus = 50;
    }
  }

  return basePoints + guessBonus + speedBonus;
}

const DEFAULT_LAT = 11.2488;
const DEFAULT_LON = 75.7839;

const keralaDict: Record<string, string[]> = {
  "Malayalam Movies": [
    // Classic & Iconic
    "Drishyam", "Lucifer", "Premam", "Bangalore Days", "Spadikam",
    "Kireedam", "Chotta Mumbai", "Hridayam", "Kumbalangi Nights",
    "Maheshinte Prathikaram", "Thondimuthalum Driksakshiyum",
    "Angamaly Diaries", "Ustad Hotel", "Charlie", "Action Hero Biju",
    "Amen", "Ee Ma Yau", "Virus", "Trance", "Jallikattu",
    "The Great Indian Kitchen", "Minnal Murali", "Joji", "Malik",
    "Nayattu", "Kala", "Home", "Unda", "Android Kunjappan",
    "Ee Adutha Kaalathu", "Salt N Pepper", "22 Female Kottayam",
    "Classmates", "Manichitrathazhu", "Devasuram", "Narasimham",
    "Varavelpu", "His Highness Abdullah", "Godfather", "Rajavinte Makan",
    "Oru Vadakkan Veeragatha", "Bharatham", "Thalapathi", "Iruvar",

    // 2020s Era
    "Bheeshma Parvam", "Kaduva", "Bro Daddy", "Hridayam", "Marakkar",
    "Kurup", "Aaraattu", "Makal", "Nna Thaan Case Kodu", "Pada",
    "Churuli", "One", "The Priest", "Cold Case", "Drishyam 2",
    "Ayyappanum Koshiyum", "Sufiyum Sujatayum", "CU Soon", "Sara's",
    "Forensic", "Kilometers and Kilometers", "Halal Love Story", "Kappela",
    "Anjaam Pathiraa", "Trance", "Varane Avashyamund", "Driving License",
    "Love Action Drama", "Uyare", "Ishq", "Argentina Fans Kaattoorkadavu",
    "Varathan", "Koode", "Njan Prakashan", "Sudani from Nigeria",
    "Joseph", "Mikhael", "Odiyan", "Kayamkulam Kochunni", "Abrahaminte Santhathikal",

    // 2010s Hits
    "Take Off", "Godha", "Thondimuthalum Driksakshiyum", "Mayaanadhi",
    "Thinkalazhcha Nishchayam", "Annayum Rasoolum", "Ohm Shanthi Oshaana",
    "Ennu Ninte Moideen", "Kunjiramayanam", "Maheshinte Prathikaaram",
    "Kammatipaadam", "Jacobinte Swargarajyam", "Oppam", "Pulimurugan",
    "Munthirivallikal Thalirkkumbol", "The Great Father", "Ramaleela",
    "Velipadinte Pusthakam", "Thondimuthalum", "Ezra", "Angamaly Diaries",
    "Godha", "Njandukalude Nattil Oridavela", "Thrissivaperoor Kliptham",
    "Oru Mexican Aparatha", "Parava", "Thondimuthalum Driksakshiyum",

    // Comedy Classics
    "In Harihar Nagar", "Ramji Rao Speaking", "Sandesham", "Nadodikattu",
    "Pattanapravesham", "Akkare Akkare Akkare", "Vietnam Colony",
    "CID Moosa", "Meesa Madhavan", "Kunjikoonan", "Punjabi House",
    "Chronic Bachelor", "Thilakkam", "Kalyanaraman", "Runway",
    "Chanthupottu", "Udayananu Tharam", "Chocolate", "Mayavi",
    "Twenty Twenty", "Pokkiri Raja", "Ee Pattanathil Bhootham",
    "Minnaram", "Kilukkam", "Mithunam", "Thenmavin Kombath",
    "Mannar Mathai Speaking", "Mazha Peyyunnu Maddalam Kottunnu",

    // Drama & Serious
    "Thanmathra", "Achuvinte Amma", "Akashadoothu", "Kazhcha",
    "Perumazhakkalam", "Paleri Manikyam", "Adaminte Makan Abu",
    "Spirit", "Celluloid", "Nadan", "Pathemari", "Ennu Ninte Moideen",
    "Kammatti Paadam", "Thondimuthalum Driksakshiyum", "Take Off",
    "Ee Ma Yau", "Virus", "Unda", "Ishq", "Kala", "Nayattu",
    "The Great Indian Kitchen", "Joji", "Churuli", "Nna Thaan Case Kodu",

    // Action & Thriller
    "Rajavinte Makan", "Irupatham Noottandu", "Commissioner",
    "The King", "Ravanaprabhu", "Samrajyam", "Samrajyam 2",
    "Big B", "Shikkar", "Pokkiri Raja", "Casanova", "The Thriller",
    "Mumbai Police", "Memories", "7th Day", "Drishyam", "Papanasam",
    "Oppam", "Pulimurugan", "The Great Father", "Abrahaminte Santhathikal",
    "Mikhael", "Joseph", "Lucifer", "Driving License", "Anjaam Pathiraa",
    "Cold Case", "Kurup", "Bheeshma Parvam", "Kaduva", "Kannur Squad",

    // Romance
    "Kireedam", "Thoovanathumbikal", "Ennu Swantham Janakikutty",
    "Niram", "Oru Minnaminunginte Nurunguvettam", "Classmates",
    "Chocolate", "Notebook", "Pranayakalam", "Katha Parayumbol",
    "Cocktail", "Thattathin Marayathu", "Usthad Hotel", "Neram",
    "Ohm Shanthi Oshaana", "Bangalore Days", "Premam", "Oru Vadakkan Selfie",
    "Kali", "Jacobinte Swargarajyam", "Kammatti Paadam", "Godha",
    "Parava", "Theevandi", "Ishq", "Halal Love Story", "Hridayam",

    // Family Entertainment
    "Kilukkam", "His Highness Abdullah", "Mithunam", "Manichithrathazhu",
    "Spadikam", "Aaram Thampuran", "Narasimham", "Chronic Bachelor",
    "Runway", "Twenty Twenty", "Bodyguard", "Grandmaster",
    "Drishyam", "Ennu Ninte Moideen", "Jacobinte Swargarajyam",
    "Oppam", "Munthirivallikal Thalirkkumbol", "Velipadinte Pusthakam",
    "Ramaleela", "Bro Daddy", "Home", "Hridayam", "Nna Thaan Case Kodu"
  ],

  // "Kerala": [
  //   // Commented out for now
  // ],

  "Objects": [
    // Common Objects
    "Apple", "Banana", "Orange", "Grapes", "Mango", "Pineapple",
    "Watermelon", "Strawberry", "Cherry", "Lemon", "Coconut", "Peach",
    "Car", "Bus", "Truck", "Bicycle", "Motorcycle", "Train",
    "Airplane", "Helicopter", "Boat", "Ship", "Rocket", "Submarine",
    "House", "Building", "Castle", "Bridge", "Tower", "Pyramid",
    "Tree", "Flower", "Rose", "Sunflower", "Tulip", "Cactus",
    "Sun", "Moon", "Star", "Cloud", "Rainbow", "Lightning",
    "Mountain", "River", "Ocean", "Beach", "Desert", "Forest",

    // Household Items
    "Chair", "Table", "Bed", "Sofa", "Desk", "Shelf",
    "Door", "Window", "Mirror", "Clock", "Lamp", "Fan",
    "Cup", "Plate", "Bowl", "Spoon", "Fork", "Knife",
    "Glass", "Bottle", "Jar", "Pot", "Pan", "Kettle",
    "Pillow", "Blanket", "Curtain", "Carpet", "Rug", "Towel",
    "Brush", "Comb", "Scissors", "Needle", "Thread", "Button",
    "Candle", "Matchbox", "Lighter", "Ashtray", "Vase", "Frame",

    // Electronics
    "Phone", "Computer", "Laptop", "Tablet", "TV", "Radio",
    "Camera", "Watch", "Headphones", "Speaker", "Microphone", "Remote",
    "Keyboard", "Mouse", "Monitor", "Printer", "Scanner", "Router",
    "Charger", "Battery", "Cable", "Plug", "Switch", "Socket",

    // School & Office
    "Book", "Notebook", "Pen", "Pencil", "Eraser", "Ruler",
    "Sharpener", "Stapler", "Paperclip", "Tape", "Glue", "Marker",
    "Crayon", "Paint", "Brush", "Canvas", "Easel", "Palette",
    "Bag", "Backpack", "Briefcase", "Wallet", "Purse", "Suitcase",
    "Calculator", "Calendar", "Diary", "Envelope", "Stamp", "Letter",

    // Clothing & Accessories
    "Shirt", "Pants", "Dress", "Skirt", "Jacket", "Coat",
    "Shoe", "Boot", "Sandal", "Slipper", "Sock", "Hat",
    "Cap", "Scarf", "Glove", "Belt", "Tie", "Bow",
    "Glasses", "Sunglasses", "Watch", "Ring", "Necklace", "Bracelet",
    "Earring", "Crown", "Helmet", "Mask", "Umbrella", "Raincoat",

    // Sports & Games
    "Ball", "Football", "Basketball", "Tennis Ball", "Cricket Ball",
    "Bat", "Racket", "Hockey Stick", "Golf Club", "Bowling Pin",
    "Chess", "Dice", "Cards", "Puzzle", "Doll", "Teddy Bear",
    "Kite", "Yo-Yo", "Frisbee", "Skateboard", "Roller Skates",

    // Musical Instruments
    "Guitar", "Piano", "Drum", "Flute", "Violin", "Trumpet",
    "Saxophone", "Harmonica", "Accordion", "Harp", "Banjo", "Ukulele",
    "Tambourine", "Xylophone", "Cymbals", "Maracas", "Bongo", "Sitar",

    // Food & Kitchen
    "Pizza", "Burger", "Sandwich", "Hot Dog", "Taco", "Sushi",
    "Cake", "Cookie", "Donut", "Ice Cream", "Candy", "Chocolate",
    "Bread", "Cheese", "Egg", "Milk", "Butter", "Yogurt",
    "Rice", "Pasta", "Noodles", "Soup", "Salad", "Steak",
    "Chicken", "Fish", "Shrimp", "Lobster", "Crab", "Oyster",

    // Animals
    "Cat", "Dog", "Bird", "Fish", "Rabbit", "Mouse",
    "Elephant", "Lion", "Tiger", "Bear", "Monkey", "Giraffe",
    "Zebra", "Horse", "Cow", "Pig", "Sheep", "Goat",
    "Chicken", "Duck", "Penguin", "Owl", "Eagle", "Parrot",
    "Snake", "Lizard", "Turtle", "Frog", "Crocodile", "Dinosaur",
    "Butterfly", "Bee", "Ant", "Spider", "Ladybug", "Dragonfly",

    // Shapes & Symbols
    "Heart", "Star", "Circle", "Square", "Triangle", "Diamond",
    "Arrow", "Cross", "Plus", "Minus", "Question Mark", "Exclamation",
    "Smiley", "Peace Sign", "Thumbs Up", "OK Sign", "Victory Sign",

    // Tools & Equipment
    "Hammer", "Screwdriver", "Wrench", "Pliers", "Saw", "Drill",
    "Nail", "Screw", "Bolt", "Nut", "Washer", "Anchor",
    "Axe", "Shovel", "Rake", "Hoe", "Pickaxe", "Wheelbarrow",
    "Ladder", "Rope", "Chain", "Hook", "Lock", "Key",

    // Nature & Weather
    "Leaf", "Branch", "Root", "Seed", "Fruit", "Vegetable",
    "Grass", "Bush", "Vine", "Moss", "Mushroom", "Fern",
    "Rock", "Stone", "Pebble", "Sand", "Soil", "Mud",
    "Rain", "Snow", "Ice", "Hail", "Fog", "Mist",
    "Wind", "Storm", "Thunder", "Tornado", "Hurricane", "Earthquake",

    // Miscellaneous
    "Flag", "Map", "Compass", "Telescope", "Microscope", "Magnifying Glass",
    "Balloon", "Bubble", "Soap", "Sponge", "Bucket", "Basket",
    "Box", "Crate", "Barrel", "Chest", "Safe", "Vault",
    "Robot", "Alien", "UFO", "Spaceship", "Satellite", "Astronaut",
    "Anchor", "Wheel", "Gear", "Spring", "Magnet", "Battery"
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
  const timerEndsAt = new Date(Date.now() + 20000).toISOString(); // 20 seconds
  room.currentRound.timerEndsAt = timerEndsAt;

  // Send words only to the drawer
  const drawer = room.players.find(p => p.userId === room.currentRound.drawerUserId);
  if (drawer && drawer.socketId) {
    const socket = sockets.get(drawer.socketId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({
        type: 'wordSelectionStart',
        words: words,
        timeLimit: 20,
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
          timeLimit: 20,
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
        startNewRound(roomId);
      }, 2000);
    }
  }, 20000);
}

/**
 * Start drawing phase after word is selected
 */
function startDrawingPhase(roomId: string) {
  const room = rooms.get(roomId);
  if (!room || !room.currentRound || !room.currentRound.word) return;

  // Clear word selection timer
  const timers = roomTimers.get(roomId) || {};
  if (timers.wordSelectionTimer) {
    clearTimeout(timers.wordSelectionTimer);
    timers.wordSelectionTimer = undefined;
  }

  const timerEndsAt = new Date(Date.now() + 80000).toISOString(); // 80 seconds
  room.currentRound.timerEndsAt = timerEndsAt;
  room.currentRound.drawingStartTime = Date.now(); // Track start time for scoring

  // Reset hasGuessed flags for all players
  room.players.forEach(p => {
    p.hasGuessed = false;
    p.guessTime = undefined;
  });

  // Send word only to drawer
  const drawer = room.players.find(p => p.userId === room.currentRound.drawerUserId);
  if (drawer && drawer.socketId) {
    const socket = sockets.get(drawer.socketId);
    if (socket) {
      socket.send(JSON.stringify({
        type: 'wordSelected',
        word: room.currentRound.word,
        timeLimit: 80,
        timerEndsAt: timerEndsAt
      }));
    }
  }

  // Notify other players (without the word)
  room.players.forEach(p => {
    if (p.userId !== room.currentRound.drawerUserId && p.socketId) {
      const socket = sockets.get(p.socketId);
      if (socket) {
        socket.send(JSON.stringify({
          type: 'wordSelected',
          word: '_'.repeat(room.currentRound.word.length),
          timeLimit: 80,
          timerEndsAt: timerEndsAt
        }));
      }
    }
  });

  console.log(`Drawing phase started for word: ${room.currentRound.word}`);

  // End drawing phase after 80 seconds
  timers.drawingTimer = setTimeout(() => {
    const currentRoom = rooms.get(roomId);
    if (!currentRoom || !currentRoom.currentRound) return;

    // Calculate and award artist score
    const correctGuesses = currentRoom.players.filter(p =>
      p.userId !== currentRoom.currentRound.drawerUserId && p.hasGuessed
    ).length;

    const firstGuessTime = currentRoom.players
      .filter(p => p.guessTime)
      .sort((a, b) => (a.guessTime || 0) - (b.guessTime || 0))[0]?.guessTime;

    const artistScore = calculateArtistScore(
      correctGuesses,
      currentRoom.currentRound.drawingStartTime || Date.now(),
      firstGuessTime
    );

    const artist = currentRoom.players.find(p => p.userId === currentRoom.currentRound.drawerUserId);
    if (artist) {
      artist.score += artistScore;
      console.log(`Artist ${artist.username} earned ${artistScore} points (${correctGuesses} correct guesses)`);
    }

    broadcastToRoom(roomId, {
      type: 'roundEnd',
      word: currentRoom.currentRound.word,
      scores: currentRoom.players.map(p => ({
        userId: p.userId,
        username: p.username,
        score: p.score
      }))
    });

    // Move to next round after showing scores
    timers.roundEndTimer = setTimeout(() => {
      startNewRound(roomId);
    }, 5000);
    roomTimers.set(roomId, timers);
  }, 80000);
  roomTimers.set(roomId, timers);
}

/**
 * Move to next game in the round or start new round
 */
/**
 * Start a new round
 */
function startNewRound(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Clear any existing timers for this room
  clearAllTimers(roomId);

  // Reset player guess tracking
  room.players.forEach(p => {
    p.hasGuessed = false;
    p.guessTime = undefined;
  });

  const activePlayers = room.players.filter(p => p.connected);
  if (activePlayers.length === 0) return;

  const roundNumber = (room.currentRound?.roundNumber || 0) + 1;
  const ROUNDS_PER_PLAYER = 3; // Each player gets 3 turns
  const MAX_ROUNDS = activePlayers.length * ROUNDS_PER_PLAYER; // Total rounds = players × 3

  if (roundNumber > MAX_ROUNDS) {
    endGame(roomId);
    return;
  }

  // FIX: Rotate drawer - cycle through all players, each gets 3 turns
  // Round 1-3: Player 0, Round 4-6: Player 1, Round 7-9: Player 2, etc.
  const drawerIndex = Math.floor((roundNumber - 1) / ROUNDS_PER_PLAYER) % activePlayers.length;
  const drawer = activePlayers[drawerIndex];
  const playerRoundNumber = Math.floor((roundNumber - 1) / activePlayers.length) + 1; // Which of their 3 rounds

  room.currentRound = {
    roundNumber,
    drawerUserId: drawer.userId,
    word: null,
    timerEndsAt: '',
    drawingStartTime: 0
  };

  const words = getRandomWords(room.category, 2); // 2 word choices

  // Set timer end time for word selection
  const timerEndsAt = new Date(Date.now() + 20000).toISOString(); // 20 seconds
  room.currentRound.timerEndsAt = timerEndsAt;

  console.log(`Round ${roundNumber}/${MAX_ROUNDS} started, drawer: ${drawer.username} (turn ${playerRoundNumber}/3)`);

  // Broadcast round start to trigger navigation to game screen
  broadcastToRoom(roomId, {
    type: 'roundStart',
    roundNumber: roundNumber,
    totalRounds: MAX_ROUNDS,
    drawerUserId: drawer.userId
  });

  // Send words only to the drawer
  const drawerSocket = sockets.get(drawer.socketId || '');
  if (drawerSocket) {
    try {
      drawerSocket.send(JSON.stringify({
        type: 'wordSelectionStart',
        words: words,
        timeLimit: 20,
        timerEndsAt: timerEndsAt,
        roundNumber: roundNumber,
        totalRounds: MAX_ROUNDS,
        playerRound: playerRoundNumber
      }));
    } catch (e) {
      console.error('Error sending to drawer:', e);
    }
  }

  // Send notification to other players
  room.players.forEach(p => {
    if (p.userId !== drawer.userId && p.socketId) {
      const socket = sockets.get(p.socketId);
      if (socket) {
        socket.send(JSON.stringify({
          type: 'wordSelectionStart',
          words: [], // Watchers don't see words
          timeLimit: 20,
          timerEndsAt: timerEndsAt,
          roundNumber: roundNumber,
          totalRounds: MAX_ROUNDS,
          playerRound: playerRoundNumber
        }));
      }
    }
  });

  // Auto-select random word if drawer doesn't choose in time
  const timers = roomTimers.get(roomId) || {};
  timers.wordSelectionTimer = setTimeout(() => {
    const currentRoom = rooms.get(roomId);
    if (currentRoom && currentRoom.currentRound && !currentRoom.currentRound.word) {
      const randomWord = words[Math.floor(Math.random() * words.length)];
      currentRoom.currentRound.word = randomWord;
      console.log(`Auto-selected word: ${randomWord}`);
      startDrawingPhase(roomId);
    }
  }, 20000);
  roomTimers.set(roomId, timers);
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

          // Check if user is not the drawer and hasn't guessed yet
          if (player && currentSession.userId !== room.currentRound.drawerUserId && !player.hasGuessed) {
            if (guess === word) {
              // Correct guess! Calculate competitive score
              const guessTimestamp = Date.now();
              const drawingStartTime = room.currentRound.drawingStartTime || guessTimestamp;

              // Calculate position (how many have guessed before this player)
              const position = room.players.filter(p =>
                p.userId !== room.currentRound.drawerUserId && p.hasGuessed
              ).length + 1;

              const totalPlayers = room.players.filter(p =>
                p.userId !== room.currentRound.drawerUserId && p.connected
              ).length;

              const score = calculateGuesserScore(
                guessTimestamp,
                drawingStartTime,
                80, // 80 seconds max time
                position,
                totalPlayers
              );

              player.score += score;
              player.hasGuessed = true;
              player.guessTime = guessTimestamp;

              console.log(`${currentSession.username} guessed correctly: ${word} (+${score} points, position ${position}/${totalPlayers})`);

              // Don't reveal the word in the message - just say they guessed correctly
              broadcastToRoom(currentSession.roomId, {
                type: 'correctGuess',
                userId: currentSession.userId,
                username: currentSession.username,
                pointsAwarded: score,
                position: position,
                totalPlayers: totalPlayers,
                drawerUserId: room.currentRound.drawerUserId
              });

              broadcastToRoom(currentSession.roomId, {
                type: 'roomUpdate',
                room
              });

              // Check if all non-drawer players have guessed correctly
              const nonDrawerPlayers = room.players.filter(p =>
                p.userId !== room.currentRound?.drawerUserId && p.connected
              );
              const allGuessed = nonDrawerPlayers.every(p => p.hasGuessed);

              if (allGuessed) {
                // All players guessed! Clear drawing timer and move to next round
                console.log('All players guessed correctly! Ending round early...');
                const timers = roomTimers.get(currentSession.roomId);
                if (timers?.drawingTimer) {
                  clearTimeout(timers.drawingTimer);
                  timers.drawingTimer = undefined;
                }

                // Calculate and award artist score
                const correctGuesses = room.players.filter(p =>
                  p.userId !== room.currentRound.drawerUserId && p.hasGuessed
                ).length;

                const firstGuessTime = room.players
                  .filter(p => p.guessTime)
                  .sort((a, b) => (a.guessTime || 0) - (b.guessTime || 0))[0]?.guessTime;

                const artistScore = calculateArtistScore(
                  correctGuesses,
                  room.currentRound.drawingStartTime || Date.now(),
                  firstGuessTime
                );

                const artist = room.players.find(p => p.userId === room.currentRound.drawerUserId);
                if (artist) {
                  artist.score += artistScore;
                  console.log(`Artist ${artist.username} earned ${artistScore} points (all guessed quickly!)`);
                }

                // Broadcast round end
                broadcastToRoom(currentSession.roomId, {
                  type: 'roundEnd',
                  word: room.currentRound.word,
                  scores: room.players.map(p => ({
                    userId: p.userId,
                    username: p.username,
                    score: p.score
                  }))
                });

                // Move to next round after showing scores
                const roundTimers = roomTimers.get(currentSession.roomId) || {};
                roundTimers.roundEndTimer = setTimeout(() => {
                  startNewRound(currentSession!.roomId);
                }, 5000);
                roomTimers.set(currentSession.roomId, roundTimers);
              }
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
