# Deploy to Render + Vercel (Step-by-Step)

## Prerequisites

✅ GitHub account
✅ Your code pushed to GitHub repository
✅ Email address for Render and Vercel signup

**Total Time:** 20 minutes
**Total Cost:** FREE

---

## Part 1: Deploy Backend to Render (10 minutes)

### Step 1: Push Your Code to GitHub

```bash
# If not already on GitHub
cd /Users/sarathpanat/Documents/geo-doodle-dash

# Initialize git (if needed)
git init
git add .
git commit -m "Initial commit"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/geo-doodle-dash.git
git branch -M main
git push -u origin main
```

### Step 2: Sign Up for Render

1. Go to **https://render.com**
2. Click **"Get Started for Free"**
3. Sign up with GitHub (recommended) or email
4. Authorize Render to access your GitHub repositories

### Step 3: Create New Web Service

1. Click **"New +"** button (top right)
2. Select **"Web Service"**
3. Click **"Connect a repository"**
4. Find and select **"geo-doodle-dash"** from the list
5. Click **"Connect"**

### Step 4: Configure Your Service

Fill in the following settings:

**Basic Settings:**
- **Name:** `geo-doodle-dash-server` (or any name you like)
- **Region:** Choose closest to you (e.g., Oregon, Frankfurt, Singapore)
- **Branch:** `main`
- **Root Directory:** Leave blank
- **Runtime:** `Node`

**Build & Deploy:**
- **Build Command:** `npm install`
- **Start Command:** `npm run server`

**Plan:**
- Select **"Free"** (should be pre-selected)

### Step 5: Add Environment Variables

Scroll down to **"Environment Variables"** section:

Click **"Add Environment Variable"** and add:
- **Key:** `PORT`
- **Value:** `8787`

Click **"Add Environment Variable"** again:
- **Key:** `NODE_ENV`
- **Value:** `production`

### Step 6: Deploy!

1. Click **"Create Web Service"** at the bottom
2. Wait for deployment (2-5 minutes)
3. You'll see logs streaming - wait for "Game server listening on 8787"
4. Once deployed, you'll see a green **"Live"** badge

### Step 7: Get Your Backend URL

At the top of the page, you'll see your app URL:
```
https://geo-doodle-dash-server.onrender.com
```

**Copy this URL** - you'll need it for Vercel!

### Step 8: Test Your Backend

Open in browser:
```
https://YOUR-APP-NAME.onrender.com/health
```

You should see:
```json
{
  "status": "ok",
  "timestamp": "2025-11-22T...",
  "rooms": 0,
  "players": 0,
  "uptime": 123.45
}
```

✅ **Backend deployed successfully!**

---

## Part 2: Deploy Frontend to Vercel (10 minutes)

### Step 1: Sign Up for Vercel

1. Go to **https://vercel.com**
2. Click **"Start Deploying"** or **"Sign Up"**
3. Sign up with GitHub (recommended)
4. Authorize Vercel to access your repositories

### Step 2: Import Your Project

1. Click **"Add New..."** → **"Project"**
2. Find **"geo-doodle-dash"** in the list
3. Click **"Import"**

### Step 3: Configure Project

**Configure Project Settings:**

- **Framework Preset:** Vite (should auto-detect)
- **Root Directory:** `./` (leave as is)
- **Build Command:** `npm run build` (should auto-fill)
- **Output Directory:** `dist` (should auto-fill)
- **Install Command:** `npm install` (should auto-fill)

### Step 4: Add Environment Variables

Click **"Environment Variables"** to expand:

Add the following variable:
- **Key:** `VITE_GAME_SERVER_URL`
- **Value:** `https://YOUR-RENDER-APP.onrender.com` (paste your Render URL from Part 1)

Example:
```
VITE_GAME_SERVER_URL=https://geo-doodle-dash-server.onrender.com
```

Add another variable:
- **Key:** `VITE_GAME_WS_BASE`
- **Value:** `/`

### Step 5: Deploy!

1. Click **"Deploy"**
2. Wait for build (1-3 minutes)
3. You'll see build logs
4. Once complete, you'll see **"Congratulations!"** with confetti 🎉

### Step 6: Get Your Frontend URL

Your app is now live at:
```
https://geo-doodle-dash-XXXXX.vercel.app
```

Click **"Visit"** to open your app!

✅ **Frontend deployed successfully!**

---

## Part 3: Test Your Deployment

### Test 1: Open Your App

1. Go to your Vercel URL
2. You should see the landing page
3. Click **"Create Room"**

### Test 2: Create a Room

1. Enter your name
2. Select a category
3. Allow or deny location (both should work)
4. Click **"Create Room"**
5. You should see the waiting room

### Test 3: Join from Another Device

1. Open your Vercel URL on another device/browser
2. Click **"Join Room"**
3. Enter the 4-letter room code
4. You should join the room

### Test 4: Play a Game

1. Mark ready on both devices
2. Host starts the game
3. Word selection should appear
4. Drawing should work
5. Guessing should work

✅ **Everything working? You're live!**

---

## Part 4: Prevent Render from Sleeping (Optional)

Render free tier sleeps after 15 minutes of inactivity. Here's how to keep it awake:

### Option A: UptimeRobot (Recommended)

1. Go to **https://uptimerobot.com**
2. Sign up for free
3. Click **"Add New Monitor"**
4. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** Geo Doodle Dash
   - **URL:** `https://YOUR-RENDER-APP.onrender.com/health`
   - **Monitoring Interval:** 5 minutes
5. Click **"Create Monitor"**

Now your app will be pinged every 5 minutes and won't sleep!

### Option B: Cron-job.org

1. Go to **https://cron-job.org**
2. Sign up for free
3. Create new cron job
4. URL: `https://YOUR-RENDER-APP.onrender.com/health`
5. Schedule: Every 14 minutes
6. Save

---

## Troubleshooting

### Backend Issues

**Problem: "Application failed to respond"**
- Check Render logs for errors
- Verify `npm run server` works locally
- Check environment variables are set

**Problem: WebSocket not connecting**
- Verify CORS is configured correctly
- Check Render URL in Vercel environment variables
- Make sure you're using `https://` not `http://`

**Problem: App keeps sleeping**
- Set up UptimeRobot (see Part 4)
- Or upgrade to Render paid plan ($7/month)

### Frontend Issues

**Problem: "Failed to fetch rooms"**
- Check `VITE_GAME_SERVER_URL` is correct
- Verify Render backend is running
- Check browser console for CORS errors

**Problem: Environment variables not working**
- Redeploy after adding variables
- Make sure variable names start with `VITE_`
- Clear browser cache

**Problem: Build fails**
- Check build logs in Vercel
- Verify `npm run build` works locally
- Check for TypeScript errors

---

## Updating Your Deployment

### Update Backend (Render)

```bash
# Make changes to your code
git add .
git commit -m "Update backend"
git push origin main

# Render auto-deploys on push!
```

### Update Frontend (Vercel)

```bash
# Make changes to your code
git add .
git commit -m "Update frontend"
git push origin main

# Vercel auto-deploys on push!
```

Both platforms automatically deploy when you push to GitHub!

---

## Custom Domain (Optional)

### Add Custom Domain to Vercel

1. Buy domain from Namecheap, GoDaddy, etc. (~$10/year)
2. In Vercel project → Settings → Domains
3. Add your domain
4. Update DNS records as instructed
5. Wait for DNS propagation (5-60 minutes)

### Add Custom Domain to Render

1. In Render dashboard → Your service → Settings
2. Scroll to "Custom Domain"
3. Add your domain
4. Update DNS records as instructed

---

## Monitoring Your App

### Render Dashboard

- View logs: Dashboard → Your service → Logs
- View metrics: Dashboard → Your service → Metrics
- See deployment history: Dashboard → Your service → Events

### Vercel Dashboard

- View deployments: Dashboard → Your project → Deployments
- View analytics: Dashboard → Your project → Analytics
- View logs: Click on any deployment → View Function Logs

---

## Costs Summary

| Service | Free Tier | Limitations |
|---------|-----------|-------------|
| **Render** | FREE | Sleeps after 15min, 512MB RAM |
| **Vercel** | FREE | 100GB bandwidth/month |
| **UptimeRobot** | FREE | 50 monitors, 5min interval |
| **Total** | **$0/month** | Good for <50 users |

---

## Next Steps

✅ Your app is now live and accessible globally!

**Share your game:**
- Share your Vercel URL with friends
- Post on social media
- Add to your portfolio

**Monitor usage:**
- Check Render metrics for active users
- Monitor UptimeRobot for uptime
- Review Vercel analytics for traffic

**Upgrade when needed:**
- Render: $7/month for no sleep + more resources
- Vercel: Stays free for most use cases

---

## Quick Reference

**Your URLs:**
- Frontend: `https://YOUR-PROJECT.vercel.app`
- Backend: `https://YOUR-APP.onrender.com`
- Health Check: `https://YOUR-APP.onrender.com/health`

**Dashboards:**
- Render: https://dashboard.render.com
- Vercel: https://vercel.com/dashboard
- UptimeRobot: https://uptimerobot.com/dashboard

**Support:**
- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- Community: Discord servers for both platforms

---

## Congratulations! 🎉

Your multiplayer drawing game is now live and accessible to anyone in the world!

**What you've accomplished:**
- ✅ Deployed backend with WebSocket support
- ✅ Deployed frontend with auto-deploy
- ✅ Set up monitoring to prevent sleep
- ✅ Created a globally accessible game
- ✅ All for FREE!

Now go play some games! 🎮✨
