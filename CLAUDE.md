# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Alpha Scope** is a client/server application for maintaining stock watchlists and showing stock details. Trading strategies are described in plain English and translated into JSON definitions under `specs/strategies/` that the strategy engine evaluates against live market data. At runtime, evaluation uses pure logic — no AI is involved unless explicitly requested.

## Tech Stack

- **Runtime:** Node.js v20+ with TypeScript
- **Frontend:** React 18 + Vite + Tailwind CSS + Lucide Icons + socket.io-client + react-markdown + @hello-pangea/dnd (drag-to-reorder)
- **Backend:** Express.js + Socket.io (real-time streaming)
- **Database:** SQLite via Prisma ORM
- **AI:** Multi-provider LLM support — Google Gemini, OpenAI, Claude (persistent chat session, lazy-initialized)
- **Market Data:** `yahoo-finance2` (on-demand 5-min OHLC + daily candles for SPX, SPY, and 11 sector ETFs)
- **Calendar Data:** Finnhub (company news + earnings calendar), FRED / St. Louis Fed (economic releases — free, no plan gating)
- **Indicators:** `technicalindicators` library (VWAP, SMA, RSI, ATR)
- **Charts:** `lightweight-charts` v5 (SPX candlestick chart with VWAP, volume, RSI pane)
- **Scheduler:** `node-cron` v3 (strategy scanner, fires at 10:00/12:00/14:00/16:00 ET on market days)

## Repository Structure

```
server/     # Express + Socket.io backend (Node.js + TypeScript)
client/     # React + Vite frontend (TypeScript)
specs/      # Architecture docs and task tracking
  tasks/      # Plan files (NN-short-kebab-case-description.md)
  strategies/ # JSON strategy definitions + index.json registry
```

Server and client are independently runnable while manageable from the workspace root.

### Server Layer Architecture

Routes are thin HTTP handlers only — they parse/validate request parameters and delegate all business logic to services.

```
server/src/
  lib/
    dateUtils.ts        # subDate / today / tomorrow helpers
    marketCalendar.ts   # isMarketDay() — NYSE holiday check (algorithmic, no hardcoded lists)
    prisma.ts           # Prisma client singleton
    yf.ts               # yahoo-finance2 singleton
  services/
    stockService.ts     # getStockSummary, getStockCandles, getLivePrices, computeTechnicals
    newsService.ts      # getStockNews (Finnhub)
    calendarService.ts  # getEconomicEvents (FRED curated releases) + getEarningsForWeek (Finnhub calendar → Yahoo calendarEvents fallback)
    overviewService.ts  # getMarketIndicators, getSectorPrices
    stockSearchService.ts  # searchStocks
    watchlistService.ts # watchlist + stock CRUD (listWatchlists, createWatchlist, getStocksWithPrices, addStock, …)
    scannerService.ts   # triggerScan() fire-and-forget + private runScan(); _scanning flag prevents concurrent runs; skips index tickers (^)
    scannerScheduler.ts # initScheduler() — node-cron jobs at 10/12/14/16 ET; isMarketDay() + triggerScan() guards
    strategy/
      strategyContext.ts  # Concurrent fetcher + indicator pre-compute (cached SPY/sector ETFs)
      strategyEngine.ts   # Pure evaluator: ctx + def → StrategyResult JSON
      strategyService.ts  # Loader + JSON validator + runStrategy() + toMarkdown()
    rules/
      types.ts            # RuleResult interface
      helpers.ts          # last/lastN/slope, findSwingHigh, priorSwingHigh, nearestRoundNumber, paramNum/Str/Arr/Bool
      ruleRegistry.ts     # name → rule function map
      trendRules.ts       # priceAboveEma, emaAlignment, weeklyTrend, rsVsSpy, spyAboveEma, …
      pullbackRules.ts    # validPullback, fibRetracement, rsiStructure, supportConfluence, …
      triggerRules.ts     # hourlyEmaCrossover, bullishReversalCandle, triggerTiming, triggerTimeOfDay, …
      marketRules.ts      # noNearEarnings, sectorStrength, marketRegime, manualReview
  routes/               # Express routers — no business logic
    stockDetail.ts
    stockSearch.ts
    watchlists.ts
    watchlistStocks.ts
    strategyRoutes.ts
    scannerRoutes.ts    # scannerRouter (POST /run) + notificationRouter (GET, PATCH /:id/read, DELETE /:id)
    overview.ts         # overviewRouter — /markets, /sectors, /economic, /earnings
  socket/
    index.ts            # initSocket() + getIo() singleton export
  index.ts
```

**Rule:** Any reusable data-fetching or computation goes in a service, not in a route handler. Routes import from services only.

### Strategy Engine

Strategies are declarative JSON in `specs/strategies/`. The engine has three layers:

- **`strategyContext.ts`** — given a strategy's `requires` block (`{ timeframes: { '1D': { ema: [...], atr: [...], rsi: [...] }, ... }, spy?: { ema: [...] } }`), fetches all needed candles in parallel via `Promise.allSettled` and pre-computes indicator series. SPY candles and the 11 sector ETFs are cached at promise level for 30 minutes. NaN/non-finite OHLC bars are filtered before indicator computation.
- **`strategyEngine.ts`** — pure function `evaluateStrategy(ctx, def) → StrategyResult`. Walks `mandatory[]` first (any failure halts scoring), then sections of `groups[]` of `conditions[]`. Group `pick` is `tiered` (first passing wins), `best_trigger` (highest-points passing wins), or `additive` (sum of all passing). A section can declare `dependsOn: { sections: [1,2,3,4], minTotal: 40 }` to be skipped unless upstream sections meet a threshold. Rule exceptions are caught per-condition so one bad rule can't crash the evaluation.
- **`strategyService.ts`** — `loadStrategy()` reads `specs/strategies/index.json`, parses the JSON file, and runs `validateStrategy()` (required fields, every `condition.rule` exists in `RULES`, sections sum to `totalMaxPoints`/100). `runStrategy()` orchestrates load + context + evaluate. `toMarkdown()` renders the JSON result.

**Rules** are tiny pure functions `(ctx, params) → RuleResult { pass, detail, warning? }`. Every period/timeframe/threshold is a JSON param — no hardcoded periods. Use `paramNum/Str/Arr/Bool` from `helpers.ts` instead of `as TYPE` casts so malformed params throw a descriptive error. To add a rule: implement it in the appropriate `*Rules.ts` file, add it to `RULES` in `ruleRegistry.ts`, then reference it from a strategy JSON.

**Strategy registry:** `specs/strategies/index.json` lists `{ id, name, version, file, enabled }`. Versioning is by filename (`*_v1.json`, `*_v2.json`); upgrade by adding a new file and updating the index entry. The `STRATEGIES_DIR` env var (set in `server/.env`) points to `specs/strategies/` at runtime — fallback resolves relative to `__dirname`.

**Endpoints:**
- `GET /api/strategies` → `[{ id, name, version }]` (only enabled)
- `GET /api/strategies/:strategyId/evaluate/:ticker` → `text/markdown` (200 success, 404 unknown/disabled, 502 evaluation failure)

### Scanner & Notification System

The scanner runs all enabled strategies against every stock and ETF in every watchlist (indices with `^` prefix are skipped) and persists results for stocks that pass all mandatory gates.

**Data model:** One `Notification` per (strategyId, calendar-day); child `NotificationTicker` rows hold per-stock score + full markdown. Deduplication is enforced in the service layer — the same (ticker, strategy) pair is only recorded once per day.

**`scannerService.ts`** exports `triggerScan()` — synchronous, fire-and-forget. Sets a module-level `_scanning` flag, starts `runScan()` as a detached promise, returns `true`. Returns `false` immediately (without starting a scan) if `_scanning` is already true. Both the HTTP route and the cron scheduler use `triggerScan()`, so they share the same in-progress guard.

**`scannerScheduler.ts`** calls `initScheduler()` on server startup. Registers four `node-cron` jobs (10:00, 12:00, 14:00, 16:00 ET via `timezone: 'America/New_York'`). Each callback checks `isMarketDay()` before calling `triggerScan()`.

**Socket event:** server emits `notification:update` with the full `Notification` (including all current `tickers[]`) each time a new ticker is added during a scan. The client upserts by id.

**Endpoints:**
- `POST /api/scanner/run` → `202 { message }` (scan started) or `409 { error }` (already running)
- `GET /api/notifications` → `Notification[]` with nested `tickers[]`, last 90 days, newest first
- `PATCH /api/notifications/:id/read` → marks read
- `DELETE /api/notifications/:id` → deletes notification + tickers (cascade)

**Frontend:** `Shell.tsx` owns notification state (fetch on mount + socket subscription). `Topbar.tsx` shows unread badge. `RightPanel.tsx` renders accordion cards — collapsed by default, one expanded at a time; "Run Scan" button; trash delete per card. Clicking a ticker navigates to `/stock/:ticker` with Router state `{ ticker, notificationMarkdown, strategyId }`; `StockDetail.tsx` reads this state and pre-populates the Strategy tab with the stored markdown (no re-evaluation).

### Overview Calendar (Economic & Earnings)

The Overview page shows a weekly calendar (`Overview.tsx` — `EconomicTable` + `EarningsTable`), fed by `calendarService.ts` via `GET /api/overview/economic` and `/earnings` (both take `?from=&to=` = the selected Mon–Sun week).

**Economic events — FRED.** Finnhub/FMP/Trading Economics all moved their economic calendars behind paid plans, so economic data comes from the **FRED API** (St. Louis Fed — free, no plan gating). FRED is series-based, not a calendar, so `getEconomicEvents` curates a small `FRED_EVENTS` list of high-impact US releases (`{ seriesId, releaseId, name, display, unit }`). For each: look up whether the release fired in `[from, to]` via `/fred/release/dates` (cached per `releaseId` — CPI+Core share release 10, NFP+Unemployment share 50), then pull `/fred/series/observations` (limit 14) and derive a headline via `display` mode — `level`, `mom_change`, `mom_pct`, or `yoy_pct`. Releases dated after today are shown pending (`actual: null`). Returns `EconomicEvent { date, event, actual, prev, change, unit }` — **no consensus forecast** (FRED has none), so the panel columns are Date / Release / Actual / Prior / Change. Needs `FRED_API_KEY`; missing key → warn + `[]`. Known quirk: Fed Funds Rate maps to the H.15 release, which publishes weekly, so it appears most weeks (usually `change 0`).

**Earnings — Finnhub primary, Yahoo fallback.** `getEarningsForWeek` pulls the DB's distinct watchlist tickers, keeps EQUITY-type via `yf.quote`, then: (1) queries Finnhub `/calendar/earnings` filtered to those tickers; (2) if Finnhub returns none of our tickers for the window, falls back to Yahoo `quoteSummary` `calendarEvents.earnings.earningsDate` (the **actual** upcoming date — do NOT use `earningsHistory + N days`, which wrongly clusters same-fiscal-quarter companies onto one fake date). Returns `EarningsEvent { date, ticker, shortName, epsEstimate, epsActual, revenueEstimate, revenueActual }`. Needs `FINNHUB_API_KEY` for path 1.

### Sidebar Stock List Behaviour

- **Column-header sorting:** Clicking Symbol / Price / Change / Chg% cycles asc → desc → normal. Active column shows a `ChevronUp`/`ChevronDown` icon. Only one column sorted at a time; clicking a different column resets the previous.
- **Drag-to-reorder:** Only available in normal (unsorted) order. When any sort is active, grip handles are hidden (`invisible`) and `isDragDisabled` is set on every `<Draggable>`. Drag calls `PATCH /api/watchlists/:id/stocks/reorder` with an optimistic state update to avoid flicker.
- **Sort is local state** in `Sidebar.tsx` — no server or context changes needed. It resets automatically on watchlist switch.

## Working Conventions

- **Plan first:** Always create a plan before starting implementation work.
- **Plan files:** Use the filename pattern `NN-short-kebab-case-description.md` (e.g., `01-initialize-project-structure.md`) under `specs/tasks/`.
- **Scope changes:** If implementation scope changes, update the corresponding plan file before continuing.
- **Code generation is opt-in:** Do not generate implementation code, scaffolding, or starter files unless explicitly asked.
- **Stack alignment:** Keep recommendations aligned with the tech stack above unless asked to change it.

## Environment & Secrets

Store API keys in `.env` (gitignored). Keys: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (LLM providers); `FINNHUB_API_KEY` (company news + earnings calendar); `FRED_API_KEY` (economic releases — free key from the St. Louis Fed). The strategy engine reads `STRATEGIES_DIR` (path to `specs/strategies/`) from `server/.env`.
