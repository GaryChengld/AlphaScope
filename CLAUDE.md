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
- **Indicators:** `technicalindicators` library (VWAP, SMA, RSI, ATR)
- **Charts:** `lightweight-charts` v5 (SPX candlestick chart with VWAP, volume, RSI pane)

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
    prisma.ts           # Prisma client singleton
    yf.ts               # yahoo-finance2 singleton
  services/
    stockService.ts     # getStockSummary, getStockCandles, getLivePrices, computeTechnicals
    newsService.ts      # getStockNews (Finnhub)
    stockSearchService.ts  # searchStocks
    watchlistService.ts # watchlist + stock CRUD (listWatchlists, createWatchlist, getStocksWithPrices, addStock, …)
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
  socket/
    index.ts
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

Store API keys in `.env` (gitignored). Required keys: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. The strategy engine reads `STRATEGIES_DIR` (path to `specs/strategies/`) from `server/.env`.
