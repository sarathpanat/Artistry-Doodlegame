export interface Player {
  userId: string;
  username: string;
  isAdmin: boolean;
  ready: boolean;
  score: number;
  connected: boolean;
}

export interface Location {
  lat: number;
  lon: number;
}

export interface CurrentRound {
  roundNumber: number;
  drawerUserId: string;
  word: string;
  wordRevealed: boolean;
  timerEndsAt: string;
}

export interface Room {
  roomId: string;
  displayCode?: string;
  category: string;
  creatorUserId: string;
  location: Location;
  active: boolean;
  createdAt: string;
  players: Player[];
  currentRound?: CurrentRound;
  maxPlayers: number;
  settings: {
    roundTimeSeconds: number;
  };
}

export interface ChatMessage {
  messageId: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
  isCorrect: boolean;
}

export interface DrawingEvent {
  type: 'stroke' | 'clear';
  color?: string;
  width?: number;
  points?: { x: number; y: number }[];
}

export interface RoomListItem {
  roomId: string;
  displayCode?: string;
  category: string;
  distanceKm: number;
  playerCount: number;
}
