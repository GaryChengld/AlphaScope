# 04 — Ticker Management ✅ COMPLETED

## Context

The sidebar currently shows a hardcoded placeholder stock list. This task wires up real per-watchlist ticker data: fetching live prices, adding/removing tickers via a search modal, drag-to-reorder, and a 30-second auto-refresh.

---

## Schema Change

Add `position` to `Stock` for per-watchlist reordering:

```prisma
model Stock {
  id          Int       @id @default(autoincrement())
  ticker      String
  exchange    String?
  position    Int       @default(0)    ← NEW
  addedAt     DateTime  @default(now())
  watchlistId Int
  watchlist   Watchlist @relation(fields: [watchlistId], references: [id], onDelete: Cascade)
  @@unique([watchlistId, ticker])
}
```

Run `npx prisma db push` then `npx prisma generate`.

---

## API Routes

### `server/src/routes/watchlistStocks.ts` *(thin handler)*

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/watchlists/:id/stocks` | → `getStocksWithPrices(watchlistId)` |
| `POST` | `/api/watchlists/:id/stocks` | → `addStock(watchlistId, ticker, exchange?)` |
| `DELETE` | `/api/watchlists/:id/stocks/:ticker` | → `removeStock(watchlistId, ticker)` |
| `PATCH` | `/api/watchlists/:id/stocks/reorder` | → `reorderStocks(ids)` |

### `server/src/routes/stockSearch.ts` *(thin handler)*

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/stocks/search?q=:query` | → `searchStocks(q)` |

### `server/src/services/watchlistService.ts`

Contains all business logic: `listWatchlists`, `createWatchlist`, `renameWatchlist`, `deleteWatchlist`, `reorderWatchlists`, `getStocksWithPrices`, `addStock`, `removeStock`, `reorderStocks`.

`getStocksWithPrices` calls `getLivePrices` from `stockService.ts` (shared utility).

### `server/src/services/stockSearchService.ts`

`searchStocks(query)` — calls `yf.search`, filters to `EQUITY | ETF | INDEX | CRYPTOCURRENCY`, returns `{ symbol, name, type, exchange }[]`.

Register both routers in `server/src/index.ts`.

---

## Client State — WatchlistContext

Extend `client/src/context/WatchlistContext.tsx`:

```ts
interface WatchlistContextValue {
  // existing
  watchlists, activeId, setActiveId, refresh
  // new
  stocks: StockWithPrice[];
  stocksLoading: boolean;
  refreshStocks: () => void;
}

interface StockWithPrice {
  id: number;
  ticker: string;
  exchange: string | null;
  position: number;
  price: number | null;
  change: number | null;
  changePct: number | null;
}
```

- Fetch `GET /api/watchlists/:activeId/stocks` when `activeId` changes
- Set up `setInterval(refreshStocks, 30_000)` whenever `activeId` is set; clear on unmount / activeId change
- `refreshStocks` re-fetches without resetting the list (no loading flash on refresh)

---

## UI — Sidebar Stock List

Replace `PLACEHOLDER_STOCKS` with `stocks` from context.

**Loading state:** while `stocksLoading`, show 3 skeleton rows (gray animated bars).

**Drag-to-reorder** (`@hello-pangea/dnd`):
- Wrap stock list with `<DragDropContext onDragEnd>` + `<Droppable droppableId="stocks">` + `<Draggable>` per row
- `GripVertical` icon (size 16) bound to `provided.dragHandleProps`; row `<div>` uses `provided.draggableProps` + `provided.innerRef`
- `onDragEnd`: **optimistically reorder** `stocks` state immediately via `setStocks(reordered)` to avoid visual flicker, then `PATCH /api/watchlists/:id/stocks/reorder` → `refreshStocks()` to sync with server
- `WatchlistContext` exposes `setStocks` to allow optimistic updates from Sidebar
- Column header row includes a spacer matching the grip handle width so "SYMBOL" aligns with ticker text

**Remove on hover:**
- Each stock row is `relative group`
- `<Trash2>` icon: `absolute right-2 hidden group-hover:flex` overlapping the row
- On click: `DELETE /api/watchlists/:id/stocks/:ticker` → `refreshStocks()`
- `e.stopPropagation()` to prevent navigating to `/stock/:ticker`

**"＋ Add" button** (Plus icon size 16 + "Add" label) sits right-aligned in the watchlist header row; opens `<AddTickerModal>`.

---

## UI — AddTickerModal

New file: `client/src/components/AddTickerModal.tsx`

```
┌─ Add to [watchlist name] ──────────── [✕] ─┐
│  🔍 [Search symbol or name…          ]      │
│ ─────────────────────────────────────────── │
│  🔖 AAPL   Apple Inc.              Stock  NASD  │  ← light gray = not in list
│  🔖 AAPL.L Apple Inc.              Stock  LSE   │
│  🔖 SPY    SPDR S&P 500 ETF        ETF    NYSE  │  ← red = already in list
│  ...                                        │
└─────────────────────────────────────────────┘
```

- Centered modal, dark backdrop overlay, closes on outside click or Escape
- Search input auto-focused; debounced 300ms → `GET /api/stocks/search?q=`
- Supports stocks, ETFs, indices, and crypto
- Each result row:
  - Bookmark icon (no brackets): `text-gray-500` if not in watchlist → click adds; `text-red-400` if already in list → click removes
  - Columns: bookmark | symbol (bold) | name | type badge | exchange
- After add/remove: update local `inWatchlist` set optimistically, then call `refreshStocks()`
- Empty state: "Type to search for a symbol"
- Loading state: spinner below the search input

---

## Files to Create / Modify

**Server:**
- `server/prisma/schema.prisma` — add `position` to Stock
- `server/src/services/watchlistService.ts` — stock CRUD + price enrichment *(new)*
- `server/src/services/stockSearchService.ts` — search via yahoo-finance2 *(new)*
- `server/src/routes/watchlistStocks.ts` — thin handler, delegates to watchlistService *(new)*
- `server/src/routes/stockSearch.ts` — thin handler, delegates to stockSearchService *(new)*
- `server/src/index.ts` — register new routes

**Client:**
- `client/src/context/WatchlistContext.tsx` — add stocks state + 30s refresh + `setStocks` for optimistic DnD updates
- `client/src/components/layout/Sidebar.tsx` — real data, DnD via `@hello-pangea/dnd`, hover trash, open modal
- `client/src/components/AddTickerModal.tsx` — search modal *(new)*
- `@hello-pangea/dnd` — added to `client/package.json`

---

## Verification

1. Open app → first watchlist's tickers shown with live prices
2. Switch watchlist → stock list updates immediately
3. Wait 30s → prices refresh without full page reload
4. Click "＋ Add" in the watchlist header → modal opens; type "AAPL" or "apple" → results appear with stock/ETF/index/crypto
5. Click gray bookmark → added to list; icon turns red
6. Click red bookmark → removed from list; icon turns gray
7. Drag stock row to reorder → new order persists after page reload
8. Hover stock row → trash icon appears; click → stock removed from list
