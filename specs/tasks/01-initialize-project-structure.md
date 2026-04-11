# 01 — Initialize Project Structure ✅ COMPLETED

## Context

Alpha Scope is a stock watchlist and analysis app. This plan scaffolds the full client/server monorepo from scratch: root npm workspace, Express + Socket.io + Prisma 7 server, and React 19 + Vite 8 + Tailwind v4 client.

---

## Target File Tree

```
AlphaScope/
├── .gitignore
├── CLAUDE.md
├── package.json                  (root workspace — concurrently, effect, caniuse-lite)
├── specs/tasks/
│   └── 01-initialize-project-structure.md
├── server/
│   ├── .env
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma.config.ts          (Prisma 7 — connection config, replaces schema datasource url)
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── index.ts              (entry point — dotenv must load before other imports)
│       ├── lib/
│       │   └── prisma.ts         (PrismaClient singleton via better-sqlite3 adapter)
│       ├── routes/
│       │   └── health.ts
│       └── socket/
│           └── index.ts
└── client/
    ├── .env
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts            (@tailwindcss/vite plugin — no PostCSS needed)
    ├── eslint.config.js
    ├── index.html
    └── src/
        ├── index.css
        ├── main.tsx
        ├── App.tsx
        └── lib/
            └── socket.ts
```

---

## Step 1 — Root `package.json`

```json
{
  "name": "alphascope",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "dev": "concurrently --names \"SERVER,CLIENT\" --prefix-colors \"cyan,magenta\" \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "npm run dev --workspace=server",
    "dev:client": "npm run dev --workspace=client",
    "build": "npm run build:server && npm run build:client",
    "build:server": "npm run build --workspace=server",
    "build:client": "npm run build --workspace=client"
  },
  "devDependencies": {
    "caniuse-lite": "^1.0.0",
    "concurrently": "^9.1.0",
    "effect": "^3.21.0"
  }
}
```

> `effect` and `caniuse-lite` are hoisting fixes required by the npm workspace setup. `@prisma/config` (hoisted to root by npm) depends on `effect`; `autoprefixer` depends on `caniuse-lite` via `browserslist`. Both must live at the root to avoid `MODULE_NOT_FOUND` errors at build time.

```bash
npm install
```

---

## Step 2 — Server

### `server/package.json`

```json
{
  "name": "alphascope-server",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --project tsconfig.json",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "@google/generative-ai": "^0.24.1",
    "@prisma/adapter-better-sqlite3": "^7.5.0",
    "@prisma/client": "^7.5.0",
    "better-sqlite3": "^12.8.0",
    "dotenv": "^17.3.1",
    "express": "^5.2.1",
    "node-cron": "^4.2.1",
    "openai": "^6.32.0",
    "socket.io": "^4.8.3",
    "technicalindicators": "^3.1.0",
    "yahoo-finance2": "^3.13.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/express": "^5.0.6",
    "@types/node": "^25.5.0",
    "@types/node-cron": "^3.0.11",
    "prisma": "^7.5.0",
    "shx": "^0.4.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

### `server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `server/prisma.config.ts`

Prisma 7 removed `url` from `schema.prisma`. Connection config lives here instead.

```typescript
import path from 'path';
import { defineConfig } from 'prisma/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const DB_PATH = path.resolve(__dirname, 'prisma/dev.db');

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  datasource: {
    url: `file:${DB_PATH}`,
  },
  migrate: {
    adapter: () => new PrismaBetterSqlite3({ url: DB_PATH }),
  },
});
```

### `server/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
}

model Watchlist {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  stocks      Stock[]
}

model Stock {
  id          Int       @id @default(autoincrement())
  ticker      String
  exchange    String?
  addedAt     DateTime  @default(now())
  watchlistId Int
  watchlist   Watchlist @relation(fields: [watchlistId], references: [id], onDelete: Cascade)

  @@unique([watchlistId, ticker])
}
```

> `ticker` is not globally unique — the same ticker can appear in multiple watchlists. `@@unique([watchlistId, ticker])` enforces uniqueness within a single watchlist.

### `server/src/lib/prisma.ts`

Singleton imported by route handlers. `process.cwd()` is `server/` when run via npm workspace scripts.

```typescript
import path from 'path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';

const DB_PATH = path.resolve(process.cwd(), 'prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ url: DB_PATH });

export const prisma = new PrismaClient({ adapter });
```

### `server/src/index.ts`

```typescript
import dotenv from 'dotenv';
// dotenv must load before any other imports that read process.env
// npm workspace scripts set cwd to server/, so dotenv finds server/.env automatically
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { initSocket } from './socket/index';
import { healthRouter } from './routes/health';

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use('/api/health', healthRouter);

initSocket(httpServer);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[server] Alpha Scope server running on http://localhost:${PORT}`);
});
```

### `server/src/routes/health.ts`

```typescript
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});
```

### `server/src/socket/index.ts`

```typescript
import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';

export function initSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`[socket] Client disconnected: ${socket.id}`));
  });

  return io;
}
```

**Install, push schema, and generate client — must run from `server/` directory:**
```bash
npm install --workspace=server
cd server && npx prisma db push      # creates server/prisma/dev.db
cd server && npx prisma generate     # generates @prisma/client (not auto-run in Prisma 7)
```

---

## Step 3 — Client

### `client/package.json`

```json
{
  "name": "alphascope-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --project tsconfig.json --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --project tsconfig.json --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "@tailwindcss/typography": "^0.5.19",
    "lightweight-charts": "^5.1.0",
    "lucide-react": "^1.7.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "socket.io-client": "^4.8.3",
    "technicalindicators": "^3.1.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@tailwindcss/vite": "^4.2.2",
    "@types/node": "^24.12.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^9.39.4",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.4.0",
    "tailwindcss": "^4.2.2",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.57.0",
    "vite": "^8.0.1"
  }
}
```

### `client/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### `client/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

### `client/vite.config.ts`

Tailwind v4 uses a Vite plugin — no `postcss.config.*` or `tailwind.config.ts` needed.

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
```

### `client/eslint.config.js`

```javascript
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
```

### `client/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Alpha Scope</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `client/src/index.css`

Tailwind v4 uses `@import` and `@plugin` — no `@tailwind` directives, no content array to configure.

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

### `client/src/main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### `client/src/App.tsx`

```typescript
function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-blue-400 mb-2">Alpha Scope</h1>
        <p className="text-gray-400">Stock watchlist and market analysis</p>
      </div>
    </div>
  );
}

export default App;
```

### `client/src/lib/socket.ts`

```typescript
import { io, Socket } from 'socket.io-client';

// autoConnect: false — components call socket.connect() explicitly when needed
const socket: Socket = io({ path: '/socket.io', autoConnect: false });

export default socket;
```

**Install:**
```bash
npm install --workspace=client
```

---

## Step 4 — Environment files

**`server/.env`** — server secrets, never exposed to the browser:
```
PORT=3001
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

> No `DATABASE_URL` needed — Prisma 7 reads the DB path directly from `prisma.config.ts`.

**`client/.env`** — Vite public vars only (`VITE_` prefix required for browser bundle inclusion):
```
# No vars required for local dev — Vite proxy handles /api and /socket.io routing.
```

---

## Verification

| Check | Command | Expected |
|-------|---------|----------|
| Server starts | `npm run dev:server` | Logs `running on http://localhost:3001` |
| Health endpoint | `curl http://localhost:3001/api/health` | `{"status":"ok",...}` |
| Client starts | `npm run dev:client` | Vite 8 at `http://localhost:5173`, dark page with "Alpha Scope" |
| Both together | `npm run dev` | Concurrently starts both with colored output |
| Server build | `npm run build:server` | `server/dist/` created, zero TS errors |
| Client build | `npm run build:client` | `client/dist/` created, zero TS errors |
| Database | `cd server && npx prisma studio` | Prisma Studio shows empty `Watchlist` and `Stock` tables |
