import { Room, DrawingEvent } from "@/types/game";

// Frontend will talk to a local game server instead of Supabase-hosted functions.
// Configure the server URL with VITE_GAME_SERVER_URL (e.g. http://localhost:8787)
// and optionally the base path with VITE_GAME_WS_BASE (defaults to "/").

const GAME_SERVER_URL = (import.meta.env.VITE_GAME_SERVER_URL as string) || "";
const GAME_WS_BASE = (import.meta.env.VITE_GAME_WS_BASE as string) || "/";

function normalizePath(p: string) {
  if (!p) return "/";
  return p.startsWith("/") ? p.replace(/\/$/, "") : `/${p.replace(/\/$/, "")}`;
}

function originForHttp() {
  if (GAME_SERVER_URL) return GAME_SERVER_URL.replace(/\/$/, "");
  return `${location.protocol}//${location.host}`;
}

function originForWs() {
  const origin = originForHttp();
  if (/^wss?:\/\//i.test(origin)) return origin;
  return origin.replace(/^http/i, (m) => (m === "http" ? "ws" : "wss"));
}

export class GameWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';

  constructor(
    private sessionToken: string,
    private roomId: string,
    private onMessage: (data: any) => void,
    private onError: (error: string) => void,
    private onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting') => void
  ) { }

  connect() {
    const basePath = normalizePath(GAME_WS_BASE);
    const origin = originForWs();
    const wsUrl = `${origin}${basePath}`;
    this.setStatus('connecting');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.reconnectAttempts = 0;
      // mark connected immediately
      this.setStatus('connected');

      // Join room
      this.send({
        type: "joinRoom",
        roomId: this.roomId,
        sessionToken: this.sessionToken
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received:", data.type);
        this.onMessage(data);
      } catch (error) {
        console.error("Failed to parse message:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.onError("Connection error");
    };

    this.ws.onclose = () => {
      console.log("WebSocket closed");
      this.setStatus('disconnected');
      this.attemptReconnect();
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      this.setStatus('reconnecting');
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
    } else {
      this.setStatus('disconnected');
      this.onError("Connection lost. Please refresh the page.");
    }
  }

  private setStatus(s: 'connecting' | 'connected' | 'disconnected' | 'reconnecting') {
    this.status = s;
    try {
      this.onStatus?.(s);
    } catch (e) {
      // ignore
    }
  }

  // Public method to update message handlers (useful when returning to waiting room from game)
  updateHandlers(
    onMessage: (data: any) => void,
    onError: (error: string) => void
  ) {
    this.onMessage = onMessage;
    this.onError = onError;
    console.log('WebSocket handlers updated');
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("WebSocket not connected, cannot send:", data?.type);
    }
  }

  setReady(ready: boolean) {
    this.send({
      type: "playerReady",
      ready
    });
  }

  startGame(forceStart = false) {
    this.send({
      type: "startGame",
      forceStart
    });
  }

  selectWord(word: string) {
    this.send({
      type: 'selectWord',
      word
    });
  }

  sendDrawingEvent(event: any) {
    this.send({
      type: 'drawingEvent',
      event
    });
  }

  sendGuess(text: string) {
    this.send({
      type: 'guess',
      text
    });
  }

  sendChatMessage(text: string) {
    this.send({
      type: 'chatMessage',
      text
    });
  }

  leaveRoom() {
    this.send({
      type: "leaveRoom"
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

async function apiFetch(path: string, opts?: RequestInit) {
  const origin = originForHttp();
  const basePath = normalizePath(GAME_WS_BASE);
  const url = `${origin}${basePath}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, opts);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function createRoom(
  username: string,
  category: string,
  lat?: number,
  lon?: number
): Promise<{ roomId: string; sessionToken: string; room: Room }> {
  const DEFAULT_LAT = 11.2488;
  const DEFAULT_LON = 75.7839;
  const useLat = typeof lat === 'number' && !isNaN(lat) ? lat : DEFAULT_LAT;
  const useLon = typeof lon === 'number' && !isNaN(lon) ? lon : DEFAULT_LON;
  return apiFetch('/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, category, lat: useLat, lon: useLon, clientUserId: sessionStorage.getItem('clientUserId') })
  });
}

export async function getNearbyRooms(
  lat?: number,
  lon?: number,
  radius = 100
): Promise<Array<{ roomId: string; category: string; distanceKm: number; playerCount: number }>> {
  const origin = originForHttp();
  const basePath = normalizePath(GAME_WS_BASE);
  const DEFAULT_LAT = 11.2488;
  const DEFAULT_LON = 75.7839;
  const useLat = typeof lat === 'number' && !isNaN(lat) ? lat : DEFAULT_LAT;
  const useLon = typeof lon === 'number' && !isNaN(lon) ? lon : DEFAULT_LON;
  const url = `${origin}${basePath}/rooms?lat=${encodeURIComponent(useLat)}&lon=${encodeURIComponent(useLon)}&radius=${encodeURIComponent(radius)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch rooms');
  return response.json();
}

export async function joinRoom(
  username: string,
  roomId: string
): Promise<{ roomId: string; sessionToken: string; room: Room }> {
  return apiFetch('/join-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, roomId, clientUserId: sessionStorage.getItem('clientUserId') })
  });
}
