# 03 — Watchlist Management ✅ COMPLETED

## Context

The sidebar currently shows a hardcoded placeholder watchlist. This task adds full watchlist management: create, rename, delete, and reorder watchlists. The active watchlist is selected via a dropdown in the sidebar; management actions live in that dropdown to keep the sidebar clean.

---

## Schema Change

Add `position` to `Watchlist` for user-defined ordering:

```prisma
model Watchlist {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?
  position    Int      @default(0)        ← NEW
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  stocks      Stock[]
}
```

Run `npx prisma db push` after updating the schema.

---

## API Routes

New file: `server/src/routes/watchlists.ts`

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/watchlists` | List all watchlists (ordered by position) |
| `POST` | `/api/watchlists` | Create new watchlist |
| `PATCH` | `/api/watchlists/reorder` | Update positions (body: `{ ids: number[] }`) — must be before `/:id` |
| `PATCH` | `/api/watchlists/:id` | Rename watchlist |
| `DELETE` | `/api/watchlists/:id` | Delete watchlist (cascades stocks via Prisma `onDelete: Cascade`) |
| `GET` | `/api/watchlists/membership?ticker=` | Returns `number[]` of watchlist IDs that contain the ticker (used by WatchlistBookmark) |

Register in `server/src/index.ts` as `app.use('/api/watchlists', watchlistsRouter)`.

---

## UI — Sidebar Watchlist Selector

The "My List ▾" button opens a dropdown panel. Serves dual purpose: switch the active watchlist and manage watchlists.

```
┌──────────────────────────┐
│  My List          ✓      │  ← active (checkmark)
│  Tech Picks              │
│  Watchlist 3             │
│  ─────────────────────   │
│  ＋ New watchlist        │
└──────────────────────────┘
```

Each watchlist row has hover-revealed action icons:

```
│  My List   ✓   [✏] [⠿] [🗑]  │
```

- **✏ Rename** — row becomes an inline text input; Enter saves, Escape cancels
- **⠿ Drag handle** — HTML5 Drag and Drop API; on drop call `PATCH /api/watchlists/reorder`
- **🗑 Delete** — inline confirmation in the row before deleting (no modal)

> **Note:** The watchlist dropdown still uses HTML5 drag-and-drop. Only the stock list (task 04) uses `@hello-pangea/dnd`.

**Active watchlist** cannot be deleted (trash icon disabled/grayed).

---

## UI — New Watchlist

Clicking "＋ New watchlist" shows an inline input at the bottom:

```
│  [ New watchlist name... ] [✓] [✕] │
```

Enter or ✓ creates it and auto-selects it. Escape or ✕ cancels.

---

## UI — Delete Confirmation

Clicking 🗑 shows inline in the row:

```
│  Delete "My List"?  [Yes] [No]  │
```

"Yes" calls `DELETE /api/watchlists/:id`. If deleted was active, auto-switch to first remaining.

---

## State Management

New React context `WatchlistContext` wraps the app:

```typescript
interface WatchlistContextValue {
  watchlists: Watchlist[];
  activeId: number | null;
  setActiveId: (id: number) => void;
  refresh: () => void;   // re-fetch /api/watchlists
}
```

- File: `client/src/context/WatchlistContext.tsx`
- `WatchlistProvider` wraps `<Routes>` in `client/src/App.tsx`
- `Sidebar` reads from context (replaces hardcoded `WATCHLIST` array)
- All CRUD actions call the API then `refresh()`

---

## Files to Create / Modify

**Server:**
- `server/prisma/schema.prisma` — add `position` field
- `server/src/routes/watchlists.ts` — all CRUD handlers *(new)*
- `server/src/index.ts` — register `/api/watchlists`

**Client:**
- `client/src/context/WatchlistContext.tsx` — context + provider *(new)*
- `client/src/components/layout/Sidebar.tsx` — replace hardcoded data, add dropdown UI
- `client/src/App.tsx` — wrap with `WatchlistProvider`

---

## Verification

1. Create a watchlist → appears in dropdown, auto-selected
2. Rename → name updates in sidebar immediately
3. Delete non-active watchlist → removed from dropdown; active unchanged
4. Delete active watchlist → next watchlist auto-selected
5. Reorder via drag → new order persists after page reload (stored in SQLite)
6. All actions survive full page refresh
