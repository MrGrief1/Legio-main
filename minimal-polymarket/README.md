# Legio Markets

Minimal prediction-market app with a React frontend and Express backend.

## What Works

- Email/password registration and login.
- Creating real post-markets from the UI.
- Listing markets from the backend instead of mock data.
- Yes/No voting trades with price, shares, volume, and probability updates.
- Postgres on Railway via `DATABASE_URL`, with local JSON storage fallback.

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
JWT_SECRET="a-long-random-secret"
DATABASE_URL=""
DATABASE_SSL="false"
PORT="3000"
```

## Railway Deploy

1. Create a new Railway project from this repo.
2. Add a Postgres service.
3. Make sure the app service has `DATABASE_URL` from Railway Postgres.
4. Add `JWT_SECRET` as a long random value.
5. Railway can use:

```bash
npm run build
npm start
```

The Express server serves `/api/*` and the built React app from `dist`.

## Voting Model

Polymarket itself uses a CLOB where users buy and sell Yes/No outcome tokens. This app implements a deployable MVP inspired by that model: users choose Yes or No, enter an amount, receive shares at the current displayed price, and the market probability moves based on total support on each side. It is intentionally not connected to Polymarket's live CLOB or blockchain settlement.
