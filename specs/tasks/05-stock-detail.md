# 05 — Stock Detail Page ✅ COMPLETED

## Context

Implements the full stock detail page: live summary header, chart, key stats panel, and tabbed sections for Fundamentals, Technicals, and News.

---

## Layout

```
┌─ Summary header ─────────────────────────────── H/L/Vol/Cap (right) ─┐
│  AAPL  Apple Inc.   $213.45  +2.31 (+1.09%)                           │
├─ Chart area ──────────────────────────────────┬─ Key Stats (280px) ───┤
│  [1H][2H][4H][1D][1W][1M]  ← timeframe        │  Previous Close       │
│                                                │  Open / Day's Range   │
│  TradingView widget (EQUITY / ETF / CRYPTO)    │  52 Week Range        │
│  lightweight-charts  (INDEX only)              │  Volume / Avg Volume  │
│    • Candlestick + Volume histogram (pane 0)   │  Market Cap / Beta    │
│    • RSI (pane 1, 25%)                         │  PE Ratio / EPS       │
│    • attributionLogo: false                    │  Earnings Date        │
│    • 30s auto-refresh (preserves zoom)         │  Dividend / Ex-Date   │
│                                                │  1y Target Est        │
├─ Tabs: Fundamentals | Technicals | News ───────┴───────────────────────┤
│  (tab panel scrollable; chart + header fixed)                           │
├─ Fundamentals (4-column grid of groups) ────────────────────────────── │
│  Valuation | Income Statement | Margins | Profitability                 │
│  Balance Sheet | Cash Flow | Share Statistics                           │
├─ Technicals ────────────────────────────────────────────────────────── │
│  MA5–MA200 (Above/Below) | RSI(14) | ATR(14) | MACD | BB | Stochastic  │
├─ News ──────────────────────────────────────────────────────────────── │
│  Headline (link)    Source · Date Time                                  │
│  ─────────────────────────────────────────────                          │
└─────────────────────────────────────────────────────────────────────── ┘
```

---

## Server Architecture

Follows the service/route separation pattern (see CLAUDE.md).

### `server/src/services/stockService.ts`

All data-fetching and computation logic:

- **`getStockSummary(ticker)`** — calls `yf.quote`, `yf.quoteSummary` (modules: `summaryDetail`, `defaultKeyStatistics`, `calendarEvents`, `financialData`), and `yf.historical` in parallel via `Promise.allSettled`. Returns fully merged flat object (all fields nullable).
- **`getStockCandles(ticker, period)`** — fetches OHLCV candles using `yf.chart()` for intraday (60m) or `yf.historical()` for daily+; aggregates to 2H/4H if needed; uses `tomorrow()` as `period2` to include today's candle.
- **`computeTechnicals(candles)`** — SMA(5/10/20/50/100/200), RSI(14), ATR(14), MACD(12,26,9), BollingerBands(20,2), Stochastic(14,3) via `technicalindicators` library.
- **`getLivePrices(tickers)`** — shared utility, also used by `watchlistService`.

### `server/src/services/newsService.ts`

- **`getStockNews(ticker)`** — Finnhub REST API, last 7 days, top 10 articles. Key from `process.env.FINNHUB_API_KEY`; returns `[]` if missing.

### `server/src/routes/stockDetail.ts` *(thin handler)*

| Method | Path | Delegates to |
|--------|------|--------------|
| `GET` | `/api/stocks/:ticker/summary` | `getStockSummary` |
| `GET` | `/api/stocks/:ticker/history?period=` | `getStockCandles` |
| `GET` | `/api/stocks/:ticker/news` | `getStockNews` |

### Timeframe → interval mapping

| Timeframe | Yahoo interval | Lookback | Notes |
|-----------|---------------|----------|-------|
| 1H | 60m | 30 days | `yf.chart()` |
| 2H | 60m | 60 days | aggregate 2 × 1H |
| 4H | 60m | 120 days | aggregate 4 × 1H |
| 1D | 1d | 365 days | `yf.historical()` |
| 1W | 1wk | 5 years | `yf.historical()` |
| 1M | 1mo | 10 years | `yf.historical()` |

### Summary response shape

```ts
{
  // quote
  symbol, shortName, quoteType, exchange,
  price, change, changePct, high, low, volume, marketCap,
  // summaryDetail
  previousClose, open, dayRangeLow, dayRangeHigh,
  fiftyTwoWeekLow, fiftyTwoWeekHigh, averageVolume,
  beta, dividendRate, dividendYield, exDividendDate,
  // valuation (multi-source fallback)
  trailingPE, forwardPE, trailingEps,
  pegRatio,        // computed: trailingPE / (earningsGrowth × 100)
  priceToBook, priceToSales, enterpriseValue,
  enterpriseToEbitda, enterpriseToRevenue,
  bookValue, sharesOutstanding, floatShares,
  heldByInsiders, heldByInstitutions, shortRatio,
  // calendar
  earningsDate,
  // financialData
  targetMeanPrice, totalRevenue, revenuePerShare, revenueGrowth,
  grossProfits, grossMargins, ebitda, ebitdaMargins,
  netIncomeToCommon, earningsGrowth,
  profitMargins, operatingMargins, returnOnEquity, returnOnAssets,
  totalCash, totalDebt, debtToEquity, currentRatio, quickRatio,
  operatingCashflow, freeCashflow,
  // technicals
  technicals: {
    ma5, ma10, ma20, ma50, ma100, ma200,
    rsi14, atr14,
    macd: { macd, signal, histogram } | null,
    bollingerBands: { upper, middle, lower } | null,
    stochastic: { k, d } | null,
  } | null,
}
```

---

## Client Components

### `client/src/components/TradingViewChart.tsx`

For EQUITY / ETF / CRYPTOCURRENCY. Injects TradingView Advanced Chart Widget script.
- `hide_side_toolbar: true`
- `studies: ['RSI@tv-basicstudies']`
- Period → TradingView interval: `1H→"60"`, `2H→"120"`, `4H→"240"`, `1D→"D"`, `1W→"W"`, `1M→"M"`

### `client/src/components/IndexChart.tsx`

For INDEX (ticker starts with `^` or `quoteType === 'INDEX'`). Single `createChart()` instance with two panes:
- Pane 0: `CandlestickSeries` + `HistogramSeries` (volume, `priceScaleId: 'volume'`, `scaleMargins: { top: 0.8, bottom: 0 }`)
- Pane 1: `LineSeries` for RSI — `chart.addSeries(LineSeries, opts, 1)`
- Pane ratio: `panes[0].setStretchFactor(3)`, `panes[1].setStretchFactor(1)`
- `layout.attributionLogo: false`
- 30s `setInterval` refresh; skips `fitContent()` on subsequent loads to preserve user zoom

---

## StockDetail Page

`client/src/pages/StockDetail.tsx`:

1. `useParams<{ ticker: string }>()`
2. Fetch `/summary` + `/news` in parallel on ticker change; `/summary` also re-fetches every 30s
3. **Summary header** — symbol + name (left), price + change (left), H/L/Vol/Cap stacked 4 lines (right)
4. **Chart** — `isIndex = quoteType === 'INDEX' || ticker.startsWith('^')`; fixed `height: 600`, `overflow-hidden`
5. **Key Stats panel** — `w-[280px] shrink-0`; 14 rows; `—` for nulls
6. **Tabs** — `fundamentals | technicals | news`; tab panel is `overflow-y-auto flex-1` (only scrollable section)
7. **Fundamentals** — 4-column grid of `FundGroup` components (each a bordered card with green group title):
   - Valuation, Income Statement, Margins, Profitability, Balance Sheet, Cash Flow, Share Statistics
8. **Technicals** — two columns: Moving Averages (MA5–MA200 with Above/Below badge) + Oscillators (RSI, ATR, MACD, BB, Stochastic)
9. **News** — `divide-y divide-gray-800` list; each item: headline link + source · date time; no thumbnails

---

## Files Created / Modified

**Server:**
- `server/src/lib/dateUtils.ts` — `subDate`, `today`, `tomorrow` *(new)*
- `server/src/services/stockService.ts` — summary, candles, technicals, live prices *(new)*
- `server/src/services/newsService.ts` — Finnhub news *(new)*
- `server/src/routes/stockDetail.ts` — thin handler *(rewritten)*
- `server/.env` — `FINNHUB_API_KEY=`

**Client:**
- `client/src/pages/StockDetail.tsx` — full implementation *(rewritten)*
- `client/src/components/TradingViewChart.tsx` *(new)*
- `client/src/components/IndexChart.tsx` *(new)*

---

## Verification

1. Click AAPL → header shows live price, change, H/L/Vol/Cap on the right
2. TradingView chart renders; timeframe buttons (1H–1M) switch interval; left toolbar hidden
3. Click `^GSPC` → lightweight-charts with candles, volume histogram, RSI pane
4. Chart height stays fixed when switching tabs
5. Key stats panel shows all 14 rows; null fields show `—`
6. Fundamentals tab: 7 groups in 4-column grid, green group titles, all values populated for stocks
7. Technicals tab: MA signals, RSI label, ATR, MACD, BB, Stochastic
8. News tab: articles separated by divider lines, source + date + time shown
9. Summary header auto-refreshes every 30s; chart data refreshes every 30s (index only)
