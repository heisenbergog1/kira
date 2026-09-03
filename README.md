# CineStream • Anime Web App

A high-performance, dark-themed anime streaming application with MyAnimeList (MAL) source integration and a direct `.m3u8` stream resolver (bypassing embed players for direct HLS playback).

## Features
- **Faithful UI Matching Screenshots**:
  - Home feed with Featured Banner, Continue Watching, Ratings badges (`★ 8.5`), Curated rows, and Bottom Navigation.
  - Anime Details view with backdrop, Cast & Characters circular avatars, genre pills, sort controls (`Ep ↑`), and rich episode cards.
- **Direct M3U8 Stream Resolver (No Embed Players)**:
  - Fetches stream directly from `/mal/{mal_id}/{episode}/{sub|dub}/source`
  - Replaces `master.m3u8` with direct high quality `index-f1-v1-a1.m3u8`
  - Streams via built-in custom HLS.js player with subtitle (`.vtt`) support and 1-click "Copy / Open M3U8" buttons.
- **MyAnimeList (Jikan API v4) Catalog**:
  - Live search, Top Airing, Popular, Movies, Characters & Voice Actors.

---

## 🚀 How to Host

### Option 1: Deploy to Vercel (Recommended - 1 Click Free)
1. Push this folder to a GitHub repository.
2. Go to [Vercel](https://vercel.com) and click **Add New Project**.
3. Select your GitHub repository.
4. Click **Deploy**. Vercel will automatically read `vercel.json` and deploy both the static frontend and the `/api/source` serverless resolver.

---

### Option 2: Deploy to Render / Railway / Docker
1. Push this folder to GitHub.
2. In [Render](https://render.com) or [Railway](https://railway.app), create a **Web Service**.
3. Build & Start command: `node server.js` (or `python server.py`).
4. Set Port: `3000` (or leave default).

---

### Option 3: Run Locally (Node.js or Python)

#### Using Node.js:
```bash
node server.js
```
Open [http://localhost:3000](http://localhost:3000)

#### Using Python:
```bash
python server.py
```
Open [http://localhost:3000](http://localhost:3000)
