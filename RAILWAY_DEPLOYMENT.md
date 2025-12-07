# Railway Deployment Guide

## Environment Variables to Set in Railway

### Backend Service

Set these in your Railway backend service:

```bash
PORT=8080                    # Railway will set this automatically
SECRET_KEY=your-random-secret-key-here
ALLOWED_ORIGINS=            # Leave empty to allow all origins (or set your frontend URL)
CSP_CONNECT_ORIGINS=        # Leave empty for permissive mode
```

### Frontend Service (if deploying separately)

If deploying frontend separately on Railway:

```bash
VITE_API_URL=https://your-backend.railway.app/api
```

If deploying frontend and backend together (monorepo), the frontend will be served from the `public` directory by the backend.

## Deployment Steps

### Option 1: Monorepo (Frontend + Backend Together)

1. **Build Frontend**:
   ```bash
   cd designe && npm run build
   ```

2. **Copy Build to Server**:
   ```bash
   cp -r designe/dist/* server/public/
   ```

3. **Deploy Server Directory** to Railway

4. **Set Environment Variables** in Railway dashboard (see above)

### Option 2: Separate Services

1. **Deploy Backend**:
   - Deploy `server` directory
   - Set environment variables
   - Note the Railway URL (e.g., `https://your-backend.railway.app`)

2. **Deploy Frontend**:
   - Deploy `designe` directory  
   - Set `VITE_API_URL=https://your-backend.railway.app/api`
   - Build command: `npm run build`
   - Start command: `npm run preview` or use a static fileserver

3. **Update Backend CORS** (optional):
   - Set `ALLOWED_ORIGINS=https://your-frontend.railway.app`

## Testing Locally Before Deployment

1. **Test Production Build**:
   ```bash
   cd designe
   npm  run build
   npm run preview
   ```

2. **Verify**:
   - No Tailwind CDN warnings ✅
   - No CSP violations ✅
   - Auth works ✅
   - API calls work ✅

## Current Status

✅ Tailwind CSS installed properly (no CDN)
✅ CSP headers fixed for Google Fonts
✅ Trust proxy enabled for Railway
✅ CORS configured to allow all origins by default
✅ All hardcoded localhost URLs replaced with API_URL config

The application is ready for Railway deployment!
