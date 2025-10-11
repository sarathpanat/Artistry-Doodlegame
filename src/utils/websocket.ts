import { Room, DrawingEvent, ChatMessage } from "@/types/game";

export class GameWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  
  constructor(
    private sessionToken: string,
    private roomId: string,
    private onMessage: (data: any) => void,
    private onError: (error: string) => void
  ) {}

  connect() {
    const projectId = "uijcrmgztxhfjgvipvdy";
    const wsUrl = `wss://${projectId}.supabase.co/functions/v1/game-websocket`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.reconnectAttempts = 0;
      
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
      this.attemptReconnect();
    };
  }
  
  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
    } else {
      this.onError("Connection lost. Please refresh the page.");
    }
  }
  
  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("WebSocket not connected, cannot send:", data.type);
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
  
  sendDrawingEvent(event: DrawingEvent) {
    this.send({
      type: "drawingEvent",
      event
    });
  }
  
  sendGuess(text: string) {
    this.send({
      type: "guess",
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

export async function createRoom(
  username: string,
  category: string,
  lat: number,
  lon: number
): Promise<{ roomId: string; sessionToken: string; room: Room }> {
  const projectId = "uijcrmgztxhfjgvipvdy";
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/game-websocket/create-room`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, category, lat, lon })
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to create room");
  }
  
  return response.json();
}

export async function getNearbyRooms(
  lat: number,
  lon: number,
  radius = 100
): Promise<Array<{ roomId: string; category: string; distanceKm: number; playerCount: number }>> {
  const projectId = "uijcrmgztxhfjgvipvdy";
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/game-websocket/rooms?lat=${lat}&lon=${lon}&radius=${radius}`
  );
  
  if (!response.ok) {
    throw new Error("Failed to fetch rooms");
  }
  
  return response.json();
}

export async function joinRoom(
  username: string,
  roomId: string
): Promise<{ roomId: string; sessionToken: string; room: Room }> {
  const projectId = "uijcrmgztxhfjgvipvdy";
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/game-websocket/join-room`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, roomId })
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to join room");
  }
  
  return response.json();
}
