# Cozy Solitaire

A browser-based Klondike solitaire game with unlockable illustrated rooms.

## Run locally

```bash
npm install
npm run dev
```

## Check and build

```bash
npm run typecheck
npm test
npm run build
```

The standard build creates a standalone website in `dist/`. Vercel uses this build. For the CrazyGames package, run `npm run build:crazygames` instead; it enables the CrazyGames integration.
