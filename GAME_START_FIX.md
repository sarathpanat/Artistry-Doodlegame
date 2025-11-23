# Game Start Issue - Fix Documentation

## Problem

When the game started, both host and players were stuck on "Preparing next game..." screen with no progress.

## Root Cause

The issue was in the WebSocket cleanup logic:

1. **WaitingRoom → Game Navigation**:
   - When `roundStart` event triggered, WaitingRoom navigated to `/game/:roomId`
   - React's cleanup function ran when WaitingRoom unmounted
   - Cleanup called `wsRef.current.leaveRoom()` which removed players from server
   - When Game.tsx tried to connect, players were already gone from the room
   - Server deleted the empty room

2. **Server Logs Showed**:
   ```
   Game starting in room 4b19ebe7-8f5d-47af-b2e1-ca7deaa76e82
   Round 1 started in room 4b19ebe7-8f5d-47af-b2e1-ca7deaa76e82
   Room 4b19ebe7-8f5d-47af-b2e1-ca7deaa76e82 deleted (empty)
   admin disconnected
   user1 disconnected
   ```

## Solution

Added navigation flags to prevent `leaveRoom()` calls during legitimate navigation:

### 1. WaitingRoom.tsx Fix

```typescript
// Added ref to track navigation to game
const navigatingToGameRef = useRef(false);

// Set flag when navigating to game
case 'roundStart': {
  navigatingToGameRef.current = true;
  navigate(`/game/${roomId}`);
  break;
}

// Conditional cleanup
return () => {
  if (wsRef.current) {
    // Don't call leaveRoom if we're navigating to the game
    if (!navigatingToGameRef.current) {
      try { wsRef.current.leaveRoom(); } catch (e) {}
    }
    try { wsRef.current.disconnect(); } catch (e) {}
    wsRef.current = null;
  }
};
```

### 2. Game.tsx Fix

```typescript
// Added ref to track navigation back to waiting room
const navigatingToWaitingRoomRef = useRef(false);

// Set flag when game ends
case 'gameEnd': {
  navigatingToWaitingRoomRef.current = true;
  setTimeout(() => {
    navigate(`/waiting-room/${roomId}`);
  }, 3000);
  break;
}

// Conditional cleanup
return () => {
  // Don't call leaveRoom if we're navigating back to waiting room
  if (!navigatingToWaitingRoomRef.current) {
    try { wsRef.current?.leaveRoom(); } catch (e) {}
  }
  try { wsRef.current?.disconnect(); } catch (e) {}
  wsRef.current = null;
};
```

## How It Works Now

1. **Game Start Flow**:
   - Host clicks "Start Game" in WaitingRoom
   - Server broadcasts `roundStart` event
   - WaitingRoom sets `navigatingToGameRef.current = true`
   - WaitingRoom navigates to `/game/:roomId`
   - Cleanup runs but skips `leaveRoom()` call
   - Players remain in server's room
   - Game.tsx connects with existing session
   - Server starts word selection phase

2. **Game End Flow**:
   - Server broadcasts `gameEnd` event
   - Game.tsx sets `navigatingToWaitingRoomRef.current = true`
   - Game.tsx navigates back to `/waiting-room/:roomId`
   - Cleanup runs but skips `leaveRoom()` call
   - Players remain in room for next game

3. **Actual Leave Flow**:
   - User clicks "Leave Game" or "Leave Room" button
   - Navigation flag is NOT set
   - Cleanup runs and calls `leaveRoom()`
   - Player properly removed from server

## Testing

After the fix:
1. ✅ Game starts successfully
2. ✅ Word selection phase appears
3. ✅ Drawer sees 2 word choices
4. ✅ Other players see waiting message
5. ✅ Game progresses through all phases
6. ✅ Returns to waiting room after game ends
7. ✅ Players can start new game

## Files Modified

- [WaitingRoom.tsx](file:///Users/sarathpanat/Documents/geo-doodle-dash/src/pages/WaitingRoom.tsx)
- [Game.tsx](file:///Users/sarathpanat/Documents/geo-doodle-dash/src/pages/Game.tsx)
