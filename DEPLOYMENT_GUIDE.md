# Cost-Effective Deployment Guide (<100 Users)

## Best Option: Railway.app

**Cost:** $5/month (or FREE with $5 credit)
**Why:** Easiest WebSocket support, auto-deploy from GitHub, built-in HTTPS

### Step-by-Step Deployment

#### 1. Prepare Your Code

Create `Procfile` in project root:
```
web: npm run server
```

Update `package.json` scripts:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "server": "node --enable-source-maps server/game-server-node.ts",
    "start": "npm run server"
  }
}
```

Create `.env.example`:
```bash
PORT=8787
NODE_ENV=production
```

#### 2. Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Node.js and deploys!

**Environment Variables to Set:**
- `PORT`: 8787
- `NODE_ENV`: production

#### 3. Deploy Frontend (Vercel - FREE)

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Set build settings:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add environment variable:
   - `VITE_GAME_SERVER_URL`: `https://your-app.railway.app`
   - `VITE_GAME_WS_BASE`: `/`

**Done!** Your app is live at `your-app.vercel.app`

---

## Alternative: Render.com

**Cost:** $7/month (FREE tier available but sleeps after inactivity)
**Why:** Good WebSocket support, easy setup

### Deployment Steps

1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repository
4. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run server`
   - **Environment:** Node
5. Add environment variables (same as Railway)

Frontend: Same as above (Vercel)

---

## Super Budget: DigitalOcean Droplet

**Cost:** $4-6/month
**Why:** Full control, cheapest option
**Complexity:** Medium (requires some Linux knowledge)

### Quick Setup

```bash
# 1. Create $6/month droplet (Ubuntu 22.04)
# 2. SSH into droplet

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Clone your repo
git clone https://github.com/yourusername/geo-doodle-dash.git
cd geo-doodle-dash

# Install dependencies
npm install

# Build frontend
npm run build

# Start server with PM2
pm2 start npm --name "game-server" -- run server
pm2 save
pm2 startup

# Install Nginx for frontend
sudo apt install nginx

# Configure Nginx (see below)
```

**Nginx Config** (`/etc/nginx/sites-available/default`):
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        root /root/geo-doodle-dash/dist;
        try_files $uri $uri/ /index.html;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:8787;
        proxy_set_header Host $host;
    }
}
```

---

## Comparison Table

| Platform | Cost/Month | Setup Time | WebSocket | Auto-Deploy | SSL/HTTPS |
|----------|-----------|------------|-----------|-------------|-----------|
| **Railway** | $5 | 5 min | ✅ | ✅ | ✅ |
| **Render** | $7 (Free tier sleeps) | 10 min | ✅ | ✅ | ✅ |
| **DigitalOcean** | $6 | 30 min | ✅ | ❌ | ⚠️ (manual) |
| **Vercel (Frontend only)** | FREE | 5 min | ❌ | ✅ | ✅ |

---

## Recommended Setup for <100 Users

### **Option 1: Easiest (Recommended)**
- **Backend:** Railway ($5/month)
- **Frontend:** Vercel (FREE)
- **Total:** $5/month
- **Setup Time:** 15 minutes

### **Option 2: Budget**
- **Backend + Frontend:** DigitalOcean Droplet ($6/month)
- **Total:** $6/month
- **Setup Time:** 1 hour

### **Option 3: Free Tier (with limitations)**
- **Backend:** Render Free Tier (sleeps after 15min inactivity)
- **Frontend:** Vercel (FREE)
- **Total:** FREE
- **Caveat:** First request after sleep takes 30-60 seconds

---

## Pre-Deployment Checklist

### Required Changes to Your Code

1. **Update CORS settings** in `server/game-server-node.ts`:
```typescript
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
```

2. **Add health check endpoint**:
```typescript
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: rooms.size,
    players: Array.from(rooms.values()).reduce((sum, r) => sum + r.players.length, 0)
  });
});
```

3. **Update WebSocket URL** in frontend `.env`:
```bash
# For Railway
VITE_GAME_SERVER_URL=https://your-app.railway.app

# For local development
VITE_GAME_SERVER_URL=http://localhost:8787
```

4. **Add `.gitignore`** (if not present):
```
node_modules/
dist/
.env
.env.local
*.log
```

---

## Monitoring (Optional but Recommended)

### Free Monitoring Tools

1. **UptimeRobot** (FREE)
   - Monitors if your server is up
   - Sends email alerts if down
   - Setup: Add your Railway URL

2. **Better Stack (formerly Logtail)** (FREE tier)
   - Log aggregation
   - Error tracking
   - Add to your code:
   ```bash
   npm install @logtail/node
   ```

---

## Domain Setup (Optional)

### Using Custom Domain

1. **Buy domain:** Namecheap, GoDaddy (~$10/year)
2. **Railway:** Settings → Add custom domain → Follow instructions
3. **Vercel:** Settings → Domains → Add domain

**Total with domain:** $5-7/month + $10/year for domain

---

## Performance Expectations

With current code on $5-7/month hosting:

- **Concurrent Users:** 50-100 ✅
- **Concurrent Games:** 5-10 rooms ✅
- **Response Time:** <100ms ✅
- **Uptime:** 99.9% ✅

---

## Quick Start Commands

### Deploy to Railway (Fastest)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize project
railway init

# 4. Deploy
railway up

# 5. Add environment variables
railway variables set PORT=8787
railway variables set NODE_ENV=production

# 6. Get your URL
railway domain
```

### Deploy Frontend to Vercel

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Deploy
vercel

# 4. Add environment variable
vercel env add VITE_GAME_SERVER_URL
# Enter: https://your-railway-app.railway.app

# 5. Redeploy with env
vercel --prod
```

---

## My Recommendation

**For <100 users, go with Railway + Vercel:**

✅ **Pros:**
- Cheapest option that "just works"
- Auto-deploy on git push
- Built-in HTTPS/SSL
- No server management
- Scales automatically if you grow
- 5-minute setup

❌ **Cons:**
- Slightly more expensive than DigitalOcean ($5 vs $6)
- Less control than VPS

**Total Cost:** $5/month
**Setup Time:** 15 minutes
**Maintenance:** Zero

---

## Need Help?

Common issues and solutions:

**WebSocket not connecting:**
- Check CORS settings
- Verify `VITE_GAME_SERVER_URL` is correct
- Use `wss://` not `ws://` in production

**Server crashes:**
- Check Railway logs: `railway logs`
- Add error handling to WebSocket events
- Monitor with health check endpoint

**Slow performance:**
- Upgrade Railway plan to $10/month (2x resources)
- Or implement event batching (see DEPLOYMENT_ANALYSIS.md)

---

## Next Steps

1. Push code to GitHub
2. Deploy backend to Railway (5 min)
3. Deploy frontend to Vercel (5 min)
4. Test with friends
5. Share your game! 🎮

**You're ready to go live with minimal cost and effort!**
