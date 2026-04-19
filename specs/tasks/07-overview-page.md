# 07 — Overview Page

## Goal

Implement the Overview page with a live market indicators bar, an interactive index chart, and a real-data sector heatmap.

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [S&P 500] [Nasdaq 100] [Nasdaq Comp] [Dow] [VIX] [DXY] [TNX] [Oil]  │  ← top bar
├──────────────────────────────────┬──────────────────────────┤
│                                  │                          │
│   IndexChart  (2/3 width)        │  Sector Heatmap (1/3)   │
│   + period selector              │                          │
│                                  │                          │
└──────────────────────────────────┴──────────────────────────┘
```

---

## Instruments

| Label        | Ticker     | Notes                        |
|--------------|------------|------------------------------|
| S&P 500      | ^GSPC      | default selected             |
| Nasdaq 100   | ^NDX       |                              |
| Nasdaq Comp  | ^IXIC      | broader market               |
| Dow Jones    | ^DJI       |                              |
| VIX          | ^VIX       | volatility — no volume       |
| US Dollar    | DX-Y.NYB   | DXY index                    |
| 10Y Yield    | ^TNX       | client shows raw value + `%` (Yahoo returns actual % e.g. 4.25) |
| Crude Oil    | CL=F       | WTI front-month futures      |

> **Note on ^TNX:** Yahoo Finance returns the 10-year yield as the actual percentage value (e.g. 4.25 = 4.25%). The client appends `%` with no division needed.

---

## Server

### New service: `overviewService.ts`

**`getMarketIndicators()`**
- Calls `getLivePrices(['^GSPC', '^NDX', '^IXIC', '^DJI', '^VIX', 'DX-Y.NYB', '^TNX', 'CL=F'])`
- Returns array: `{ ticker, label, price, change, changePct }` — same shape as existing `getLivePrices`, with `label` added from a static map
- No instrument-specific corrections; all raw Yahoo values

**`getSectorPrices()`**
- Calls `getLivePrices(['XLK','XLF','XLE','XLV','XLI','XLC','XLY','XLP','XLRE','XLB','XLU'])`
- Returns array: `{ ticker, name, changePct }` — `name` from static sector name map

### New route: `overview.ts`

```
GET /api/overview/markets   → getMarketIndicators()
GET /api/overview/sectors   → getSectorPrices()
```

Mount at `/api/overview` in `index.ts`.

---

## Client

### `Overview.tsx` (full rewrite)

**State:**
- `indicators`: market indicator data (polled every 30s)
- `sectors`: sector data (polled every 30s)
- `selected`: ticker string, default `'^GSPC'`
- `period`: chart period, default `'1D'` (same `PERIODS` type as StockDetail)

**Top bar — `MarketIndicatorBar`**
- Horizontal scrollable row of pill cards
- Each card: label (top, small gray), price (large, white), change% (colored)
- Active card: blue ring / subtle blue background
- On click: sets `selected` → chart updates

**Chart section**
- Reuse `IndexChart` component directly — pass `ticker={selected}` and `period={period}`
- Period selector row sits **above** the chart, same pill-button style and `PERIODS` list as StockDetail (`['15m','30m','1H','2H','4H','1D','1W','1M']`)
- Chart takes 2/3 of the bottom area width

**Sector heatmap — `SectorHeatmap`**
- 11 tiles in a **3-column grid**
- Each tile: sector ETF ticker + full name + change%
- Background color driven by `changePct`: deep green (>+2%) → light green → neutral gray (0%) → light red → deep red (<-2%)
- Color scale uses Tailwind opacity variants (e.g. `bg-green-500/80`, `bg-green-500/30`)
- Takes 1/3 of the bottom area width

---

## Sector full names

| ETF   | Name                    |
|-------|-------------------------|
| XLK   | Technology              |
| XLF   | Financials              |
| XLE   | Energy                  |
| XLV   | Health Care             |
| XLI   | Industrials             |
| XLC   | Communication Services  |
| XLY   | Consumer Discretionary  |
| XLP   | Consumer Staples        |
| XLRE  | Real Estate             |
| XLB   | Materials               |
| XLU   | Utilities               |

---

## Tasks

- [ ] `overviewService.ts` — `getMarketIndicators` + `getSectorPrices`
- [ ] `overview.ts` route — two GET endpoints + mount in `index.ts`
- [ ] `Overview.tsx` — layout skeleton with state + polling
- [ ] `MarketIndicatorBar` — pill cards, active state, click handler
- [ ] Chart section — `IndexChart` + period selector
- [ ] `SectorHeatmap` — grid tiles with intensity color scale
- [ ] Wire everything together + manual test
