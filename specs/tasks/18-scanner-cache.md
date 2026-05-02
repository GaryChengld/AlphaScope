# Task 18 — Scanner Scan-Scoped Cache

## Goal

Eliminate redundant Yahoo Finance requests during a full scanner run. Currently each `runStrategy(ticker, strategyId)` call fetches candles, VIX, and quoteSummary independently — even when the same ticker was already evaluated by a prior strategy in the same scan. This triggers rate-limit errors (`Too Many Requests`) and slows scans unnecessarily.

Add a **scan-scoped `ScanCache`** (a plain `Map`) created once at the start of `runScan()` and passed through to `buildStrategyContext`. All shared market data — including SPY and sector ETF data — goes through this single cache, replacing the current separate module-level cache variables for SPY and sector ETFs. This makes the cache structure uniform and easier to extend in the future.

---

## Deduplication Wins (5 strategies × 26 tickers)

| Resource | Before | After |
|---|---|---|
| VIX fetches | 130 | 1 |
| `quoteSummary` per ticker | 5 | 1 |
| Candles per (ticker, timeframe) | 5 | 1 |
| SPY candles | module-level 30-min TTL cache | unified ScanCache |
| Sector ETF returns | module-level 30-min TTL cache | unified ScanCache |

---

## Files to Modify (no new files)

| File | Change |
|------|--------|
| `server/src/services/strategy/strategyContext.ts` | Export `QuoteSummary`; add `ScanCache` type + export; add optional `scanCache?` param to `buildStrategyContext`; check/populate ScanCache for candles, SPY, sector ETFs, VIX, quoteSummary; remove module-level `spyCandlesPromise` / `sectorReturnsPromise` cache variables |
| `server/src/services/strategy/strategyService.ts` | Add optional `scanCache?: ScanCache` to `runStrategy`; import and pass through |
| `server/src/services/scannerService.ts` | `import type { ScanCache }`; create `new Map()` before the strategy loop; pass to each `runStrategy()` call |

---

## Cache Keys

| Key | Value type | Cached data |
|---|---|---|
| `candles:${ticker}:${timeframe}` | `OhlcvRow[]` | Raw OHLCV bars — covers ticker candles, SPY (`candles:SPY:1D`), and each sector ETF (`candles:XLK:1D`, etc.) |
| `summary:${ticker}` | `QuoteSummary \| null` | Sector + earnings date |
| `vix` | `number \| null` | VIX live price (once per scan) |
| `sectorReturns` | `Record<string, number>` | 22-day returns for all 11 sector ETFs (computed once per scan) |

SPY and sector ETF candles use the same `candles:${ticker}:${timeframe}` key pattern as stock candles — no special-casing needed.

---

## Module-Level Cache Removal

The current `getCachedSpyCandles()` and `getCachedSectorReturns()` functions (with their `spyCandlesPromise`, `spyCandlesTimestamp`, `sectorReturnsPromise`, `sectorReturnsTimestamp` module-level variables) are replaced by the ScanCache in the scan path.

**Non-scan path** (strategy API route — `runStrategy` called without a cache): `scanCache` is `undefined`, so `scanCache?.has(...)` short-circuits and the functions fall back to calling `getStockCandles` and `getLivePrices` directly — same behaviour as before, just without the 30-min TTL. Single strategy evaluations are rare and the fresh-fetch cost is acceptable.

---

## Backward Compatibility

All new parameters are optional. The strategy API route calls `runStrategy(ticker, id)` with two args — this still compiles and behaves identically.

---

## Verification

1. `npx tsc --noEmit` passes in `server/`
2. `GET /api/strategies/abc_pullback_continuation/evaluate/AAPL` still returns markdown (non-scanner path unaffected)
3. `POST /api/scanner/run` — console shows far fewer `Too Many Requests` errors than before
4. Run scan twice back-to-back — second scan starts with a fresh `Map()`, no stale data carried over
