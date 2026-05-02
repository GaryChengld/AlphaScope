# Task 16 — Scanner and Notification System

## Goal

Automate the strategy evaluation engine into a scanner that runs against every stock and ETF in every watchlist, persists qualifying results, and surfaces them in the existing notification panel (RightPanel). The bell icon and RightPanel skeleton were already in place with placeholder data; this task wires them to real data.

---

## Scope

- **Backend**: Prisma schema (2 new models), 4 new files, 2 modified files, 1 new dependency (`node-cron`)
- **Frontend**: 4 modified components (Shell, Topbar, RightPanel, StockDetail)
- **Scheduler**: 4 automatic scans per market day (10:00, 12:00, 14:00, 16:00 ET); NYSE holiday-aware
- **Manual trigger**: "Run Scan" button in RightPanel for on-demand runs

---

## Data Model

One `Notification` per **scan run per strategy** (if at least one ticker qualifies). Multiple notifications for the same strategy can exist on the same day — one per scan run. A ticker that appeared in any prior notification for the same strategy+day is skipped in subsequent runs.

```
Notification
  id           Int      PK
  strategyId   String
  strategyName String
  date         String   "YYYY-MM-DD"
  read         Boolean  default false
  createdAt    DateTime

NotificationTicker
  id             Int      PK
  notificationId Int      FK → Notification (cascade delete)
  ticker         String
  score          Int
  markdown       String   full toMarkdown() output for this stock
  addedAt        DateTime
  UNIQUE(notificationId, ticker)
```

**Scan run logic (in `scannerService.ts`):**
1. Before evaluating tickers, query all `NotificationTicker` rows for this strategy+date across all prior notifications → build `seenToday` set
2. Evaluate every ticker; skip if in `seenToday`; collect new passes for this run
3. If no new tickers pass, skip creating a notification entirely
4. Otherwise create one new `Notification` with all passing tickers attached atomically; emit `notification:update`

**Deduplication examples:**

| Scenario | Result |
|----------|--------|
| 10am scan: RSI matches AAPL, MSFT | 1 `Notification` created (RSI, today); 2 `NotificationTicker` rows |
| 12pm scan: RSI matches AAPL, GOOG | AAPL skipped (seen today); 1 new `Notification` created with GOOG only |
| 12pm scan: RSI matches nothing new | No `Notification` created |
| 12pm scan: Breakout matches AAPL | 1 new `Notification` created (Breakout, today); AAPL added |
| Tomorrow scan: RSI matches AAPL | 1 new `Notification` created (RSI, tomorrow's date); AAPL added |

---

## New Dependency

`node-cron` v3 (TypeScript types included). Installed in `server/`:
```
npm install node-cron
```

---

## Files

### New Files

| File | Purpose |
|------|---------|
| `server/src/lib/marketCalendar.ts` | `isMarketDay(date)` — NYSE weekday + holiday check; fully algorithmic (Easter algorithm + observed-date rules for all 10 NYSE holidays; no hardcoded annual lists) |
| `server/src/services/scannerService.ts` | `triggerScan()` (fire-and-forget, returns bool) + private `runScan()` — fetches unique stock/ETF tickers (indices excluded), iterates strategies × tickers, deduplicates, persists, emits socket events |
| `server/src/services/scannerScheduler.ts` | `initScheduler()` — 4 `node-cron` jobs at 10/12/14/16 ET; `isMarketDay()` guard and in-progress guard via `triggerScan()` |
| `server/src/routes/scannerRoutes.ts` | Exports `scannerRouter` (`POST /api/scanner/run`) and `notificationRouter` (`GET`, `PATCH /:id/read`, `DELETE /:id`) |

### Modified Files

| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Added `Notification` and `NotificationTicker` models |
| `server/src/socket/index.ts` | Stores `io` as module-level singleton `_io`; exports `getIo()` for use by scanner service |
| `server/src/index.ts` | Imports and registers `scannerRouter`, `notificationRouter`; calls `initScheduler()` after `initSocket()` |
| `client/src/components/layout/Shell.tsx` | Fetches notifications on mount; subscribes to `notification:update` socket event (upserts by id); holds `notifications` state; passes `unreadCount` to Topbar and `notifications` + `onMarkRead` + `onDelete` to RightPanel |
| `client/src/components/layout/Topbar.tsx` | Added `unreadCount?: number` prop; blue circular badge on bell icon when count > 0 |
| `client/src/components/layout/RightPanel.tsx` | Replaced hardcoded placeholder arrays with real props; accordion collapse/expand (one at a time, collapsed by default); "Run Scan" button; delete button per card; navigate passes `{ ticker, notificationMarkdown, strategyId }` state on ticker click |
| `client/src/pages/StockDetail.tsx` | Added `useLocation`; extra `useEffect` pre-populates strategy tab (tab switch + stored markdown + strategyId) when navigated from a notification link |

---

## API Endpoints

| Method   | Path | Description | Response |
|----------|------|-------------|----------|
| `POST`   | `/api/scanner/run` | Fire-and-forget scan trigger — returns immediately; 409 if scan already running | `202 { message }` or `409 { error }` |
| `GET`    | `/api/notifications` | All notifications, last 90 days, newest first, includes `tickers[]` | `Notification[]` |
| `PATCH`  | `/api/notifications/:id/read` | Mark notification as read | Updated `Notification` |
| `DELETE` | `/api/notifications/:id` | Delete a notification and all its tickers (cascade) | 204 No Content |

---

## Socket Events

| Event | Direction | Payload | When |
|-------|-----------|---------|------|
| `notification:update` | Server → Client | Full `Notification` with `tickers[]` ordered by score desc | Every time a new ticker is added to a notification during a scan |
| `scanner:started` | Server → Client | _(no payload)_ | When `triggerScan()` starts a new scan (manual or scheduled) |
| `scanner:complete` | Server → Client | `ScanSummary { created, skipped, errors }` | When the scan finishes (success or error) |

`notification:update` upsert logic: replace existing record by `id` or prepend if new — clients see tickers added incrementally in real time.

`scanner:started` / `scanner:complete` drive the `scanRunning` boolean in Shell, which is passed to RightPanel to control the scan button vs label.

---

## Scheduler

- **Times**: 10:00, 12:00, 14:00, 16:00 `America/New_York` (cron `timezone` option ensures ET regardless of server timezone or DST)
- **Cron expressions**: `0 10 * * 1-5`, `0 12 * * 1-5`, `0 14 * * 1-5`, `0 16 * * 1-5`
- **Holiday check**: `isMarketDay()` called inside the callback (Mon–Fri filter from cron + NYSE holiday filter from `marketCalendar.ts`)
- **In-progress guard**: cron callback calls `triggerScan()` — if a previous scheduled or manual scan is still running, it returns `false` and the new trigger is skipped
- **NYSE holidays computed algorithmically**: New Year's Day, MLK Day (3rd Mon Jan), Presidents' Day (3rd Mon Feb), Good Friday (Easter − 2 days), Memorial Day (last Mon May), Juneteenth (Jun 19 observed), Independence Day (Jul 4 observed), Labor Day (1st Mon Sep), Thanksgiving (4th Thu Nov), Christmas (Dec 25 observed)

---

## Frontend Behaviour

### Shell.tsx
- Fetches `GET /api/notifications` on mount; populates `notifications` state
- Connects socket on mount; listens for `notification:update`, `scanner:started`, `scanner:complete`; disconnects on unmount
- `scanRunning` state: set `true` on `scanner:started`, `false` on `scanner:complete` — reflects both manual and scheduled scans
- `markAsRead(id)` optimistically updates local state then calls `PATCH /api/notifications/:id/read`
- `deleteNotification(id)` optimistically removes from local state then calls `DELETE /api/notifications/:id`
- Derives `unreadCount = notifications.filter(n => !n.read).length`
- Passes `scanRunning` to RightPanel

### StockDetail.tsx
- Imports `useLocation` from `react-router-dom`
- Extra `useEffect` (deps: `[location.state, ticker]`) reads navigation state: if `state.ticker === ticker` and `state.notificationMarkdown` is set, switches to the strategy tab, sets `selectedStrategyId`, and sets `strategyMarkdown` to the stored markdown — no new API call needed
- Effect runs after the ticker-reset effect (React runs effects in declaration order), so the pre-populated markdown wins over the reset-to-null

### Topbar.tsx
- `unreadCount` prop → blue `<span>` badge overlaid on bell icon when > 0; shows "99+" when > 99

### RightPanel.tsx
- One card per `Notification` (one per strategy per day)
- **Collapsed by default** — all cards start collapsed; `expandedId: number | null` state tracks which one is open (only one at a time)
- Clicking the card header toggles expand/collapse; `ChevronRight` when collapsed, `ChevronDown` when expanded; ticker count `(N)` always visible in header
- **Unread card**: `border-blue-900 bg-gray-900`, blue dot, bold strategy name
- **Read card**: `border-gray-800 bg-gray-950`, muted text, no dot
- Each expanded card lists tickers with score; clicking a ticker calls `onMarkRead(n.id)` then navigates to `/stock/:ticker` with React Router `state` carrying `{ ticker, notificationMarkdown, strategyId }` — StockDetail reads this state and pre-populates the strategy tab
- **Delete button** (`Trash2` icon, 11px) in each card header, right of timestamp; `e.stopPropagation()` prevents accordion toggle; hover turns red; calls `onDelete(n.id)` which removes the card immediately (optimistic) and fires `DELETE /api/notifications/:id`
- **Scan status in header**: when `scanRunning=false` shows a "Run Scan" button (calls `POST /api/scanner/run`, fire-and-forget, no local loading state); when `scanRunning=true` replaces the button with a pulsing yellow "Scanning in progress…" label — reflects both user-triggered and scheduler-triggered scans via socket events
- **Empty state**: "No notifications — click 'Run Scan' to find setups"
- **Relative timestamps** via `relativeTime(iso)`: "just now" / "Nm ago" / "Nh ago" / "Mon D"
- AI Analysis section retained as placeholder (unchanged)

---

## Key Implementation Notes

- **Fire-and-forget scan**: `triggerScan()` sets `_scanning = true`, starts `runScan()` as a detached promise with `.finally(() => _scanning = false)`, returns `true`; returns `false` immediately if already running. Both the API route and the scheduler use `triggerScan()` — they share the same in-progress flag regardless of who triggered the scan
- **Index exclusion**: tickers beginning with `^` are filtered out before the strategy loop — consistent with how `StockDetail.tsx` identifies indices (`ticker.startsWith('^')`)
- `runScan()` iterates **strategies outer, tickers inner**; for each strategy it pre-fetches all tickers seen in prior notifications for that strategy+date, then evaluates all tickers, then creates one new notification for the run (if any new tickers passed)
- Notification is created atomically with all its tickers via Prisma nested `create`; `notification:update` is emitted once per notification (not once per ticker)
- `Notification` has no unique constraint on `(strategyId, date)` — multiple notifications per strategy per day are intentional (one per scan run)
- Cross-run deduplication is application-level: query `NotificationTicker` filtering through the `notification` relation on `{ strategyId, date }` before each strategy's ticker loop
- `getIo()` throws if called before `initSocket()` runs, so `initScheduler()` must be called after `initSocket()` in `index.ts`
- `date` field on `Notification` is a plain `String` ("YYYY-MM-DD") derived from `new Date().toISOString().slice(0, 10)` (UTC) — consistent across all calls
- **Migration**: schema initially applied with `prisma db push` (no migration history existed). Proper migration file created at `prisma/migrations/20260427000000_init/migration.sql` and marked applied with `prisma migrate resolve --applied 20260427000000_init` — no data was lost

---

## Verification

1. `npm install node-cron` in `server/` succeeds
2. `npx prisma migrate status` shows "Database schema is up to date"
3. `npx tsc --noEmit` passes on both `server/` and `client/`
4. Server starts; console shows `[scheduler] Scanner scheduled at 10:00, 12:00, 14:00, 16:00 ET on market days`
5. RightPanel shows empty state with collapsed cards (if any); bell shows no badge
6. Click "Run Scan" → returns immediately (202); qualifying stocks appear as real-time collapsed cards via Socket.io
7. Click a card header → expands to show ticker list; clicking another card collapses the first
8. Bell badge shows unread count; cards show blue dot + border
9. Click a ticker → navigates to stock page; strategy tab pre-populated with stored markdown; badge decrements
10. `DELETE /api/notifications/:id` → card disappears immediately; `NotificationTicker` rows cascade-deleted
11. Click "Run Scan" while scan is running → `POST /api/scanner/run` returns `409 { error: 'Scan already in progress' }`
12. Index tickers (e.g. `^GSPC`) in watchlists are not evaluated and do not appear in notifications
13. Run scan again → tickers from the first run are skipped; if new tickers qualify, a second notification card appears; if none qualify, no new notification is created
14. On a scheduled fire time (market day) → console logs "triggering scheduled scan"
15. On weekend or NYSE holiday → console logs "not a market day, scan skipped"
