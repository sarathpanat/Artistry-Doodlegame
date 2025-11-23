# Artistry - Draw & Guess Doodle Game

A real-time multiplayer drawing and guessing game built with React, TypeScript, and WebSockets.

## 🎮 About

Artistry is a location-based multiplayer game where players take turns drawing words while others guess. Features include:

- **Real-time Drawing:** HTML5 Canvas with WebSocket synchronization
- **Multiple Categories:** Malayalam Movies and Objects with 250+ words each
- **Location-Based Rooms:** Find and join nearby game rooms
- **Manual Room Codes:** Join rooms with 4-letter codes
- **Waiting Room Chat:** Chat with players before the game starts
- **Mobile Support:** Touch-enabled drawing on mobile devices
- **Auto-Advance:** Game progresses when all players guess correctly

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

### Installation

```sh
# Clone the repository
git clone https://github.com/sarathpanat/Artistry-Doodlegame.git

# Navigate to project directory
cd Artistry-Doodlegame

# Install dependencies
npm install

# Start the development server (frontend)
npm run dev

# In another terminal, start the game server (backend)
npm run server
```

The frontend will be available at `http://localhost:5173` and the backend at `http://localhost:8787`.

## 🛠️ Tech Stack

**Frontend:**
- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- React Router DOM
- TanStack Query

**Backend:**
- Node.js
- Express
- WebSockets (ws library)
- TypeScript

## 📁 Project Structure

```
├── src/
│   ├── components/     # React components (DrawingCanvas, etc.)
│   ├── pages/          # Page components (Game, WaitingRoom, etc.)
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Utility functions (WebSocket client)
├── server/
│   └── game-server-node.ts  # WebSocket game server
└── public/             # Static assets
```

## 🎯 Game Features

### Categories
- **Malayalam Movies:** 250+ popular Malayalam films
- **Objects:** 250+ everyday objects organized by type

### Game Flow
1. Create or join a room
2. Wait for players in the lobby
3. Word selection (20 seconds)
4. Drawing phase (50 seconds)
5. Guessing and scoring
6. 3 rounds with all players drawing

### Scoring
- Correct guess: +10 points
- Artist bonus: +5 points per correct guess

## 🌐 Deployment

### Backend (Render)

1. Push code to GitHub
2. Create a new Web Service on [Render](https://render.com)
3. Connect your repository
4. Set build command: `npm install && npm run build:server`
5. Set start command: `npm run server`
6. Add environment variables:
   - `PORT`: 8787
   - `NODE_ENV`: production

### Frontend (Vercel)

1. Import project on [Vercel](https://vercel.com)
2. Framework: Vite
3. Add environment variable:
   - `VITE_GAME_SERVER_URL`: Your Render backend URL
4. Deploy!

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.

## 🔧 Development

### Available Scripts

- `npm run dev` - Start frontend development server
- `npm run server` - Start backend game server
- `npm run server:dev` - Start backend with tsx (development)
- `npm run build` - Build frontend for production
- `npm run build:server` - Compile TypeScript server to JavaScript

### Environment Variables

Create a `.env` file:

```bash
PORT=8787
NODE_ENV=development
VITE_GAME_SERVER_URL=http://localhost:8787
VITE_GAME_WS_BASE=/
```

## 📝 Documentation

- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Detailed deployment instructions
- [Free Hosting Options](./FREE_HOSTING_OPTIONS.md) - Free hosting alternatives
- [Deployment Analysis](./DEPLOYMENT_ANALYSIS.md) - Scaling considerations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Built with [Vite](https://vitejs.dev/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)

---

**Made with ❤️ for drawing enthusiasts**
