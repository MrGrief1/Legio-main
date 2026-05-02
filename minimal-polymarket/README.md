# Legio Markets

Minimal prediction-market app with a React frontend and Express backend.

## What Works

- Email/password registration and login.
- Creating real post-markets from the UI.
- Listing markets from the backend instead of mock data.
- Yes/No trades with entry price, shares, volume, and last-traded probability updates.
- Postgres on Railway via `DATABASE_URL`, with local JSON storage fallback only for development.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Without `DATABASE_URL`, local data is stored in `server/data/db.json`. That file is ignored by git.

## Environment

Copy `.env.example` to `.env` when you need local env values.

```bash
JWT_SECRET="generate-with-openssl-rand-base64-48"
DATABASE_URL=""
ALLOW_JSON_STORAGE="false"
DATABASE_SSL="false"
INITIAL_ADMIN_EMAIL=""
INITIAL_ADMIN_PASSWORD=""
INITIAL_ADMIN_NAME="Legio Admin"
APP_ORIGIN="http://localhost:3000"
LEGIO_DATA_DIR=""
PORT="3000"
```

Admin access is not granted to the first public registration. Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` to create or rotate the admin account from private environment variables.

## Railway Deploy

1. Create a new Railway project from this repo.
2. Add a Postgres service.
3. In the app service variables, add `DATABASE_URL` as a reference to the Postgres service connection string.
4. Add `JWT_SECRET` as a long random value, for example `openssl rand -base64 48`.
5. Add `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` for the admin account.
6. Set `APP_ORIGIN` to the public site origin, for example `https://your-app.railway.app`.
7. Prefer Railway Postgres for production. If you use a Railway Volume instead, the app writes JSON storage to `RAILWAY_VOLUME_MOUNT_PATH` automatically.
8. Do not set `ALLOW_JSON_STORAGE=true` on Railway unless you intentionally want temporary test data.
9. Railway can use:

```bash
npm run build
npm start
```

The Express server serves `/api/*` and the built React app from `dist`.

In production/Railway the server refuses to start without Postgres or an attached Volume. That prevents the app from silently writing to Railway's ephemeral filesystem and losing users, markets, and trades after a redeploy.

## Voting Model

Polymarket itself uses a CLOB where users buy and sell Yes/No outcome tokens. This app implements a deployable MVP inspired by that model: users choose Yes or No, enter an amount, receive shares at the current entry price, and the chart tracks independent last-price series for each outcome. It is intentionally not connected to Polymarket's live CLOB or blockchain settlement.
