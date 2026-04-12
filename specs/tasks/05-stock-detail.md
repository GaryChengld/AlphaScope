# 05 — Stock Detail Page

## Context

`StockDetail.tsx` is currently a placeholder. This task implements the full page: a live summary header, a chart (TradingView embed for stock/ETF/crypto, lightweight-charts for index), a key stats panel beside the chart, fundamental + technical sections, and a latest news feed powered by the Finnhub API.

---

## Layout

```
┌─ Summary header ────────────────────────────────────────────────────┐
│  AAPL  Apple Inc.   $213.45  +2.31 (+1.09%)                        │
│  High: 215.00  Low: 211.00  Vol: 45.2M  Cap: $3.2T                 │
├─ Chart area (flex-1) ─────────────────┬─ Key Stats (300px) ─────────┤
│  [1D][5D][1M][3M][1Y]                 │  Previous Close             │
│                                        │  Open                       │
│  TradingView widget  (stock/ETF/crypto)│  Day's Range                │
│  lightweight-charts  (index only)      │  52 Week Range              │
│                                        │  Volume / Avg. Volume       │
│                                        │  Market Cap (intraday)      │
│                                        │  Beta (5Y Monthly)          │
│                                        │  PE Ratio (TTM)             │
│                                        │  EPS (TTM)                  │
│                                        │  Next Earnings Date         │
│                                        │  Forward Dividend & Yield   │
│                                        │  Ex-Dividend Date           │
│                                        │  1y Target Est              │
├─ Fundamentals ────────────────────────┴─────────────────────────────┤
│  Revenue/Share | Gross Profits | Profit Margin | Op. Margin | ROE | ROA │
├─ Technicals ────────────────────────────────────────────────────────┤
│  MA5–MA200 (Above/Below) | RSI(14) | ATR(14) | MACD | BB | Stoch   │
├─ News ──────────────────────────────────────────────────────────────┤
│  [img] Headline (link)                     Source · Date            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Routes

New file: `server/src/routes/stockDetail.ts`  
Register in `server/src/index.ts` alongside existing `/api/stocks/search` route.

### `GET /api/stocks/:ticker/summary`

Calls in parallel via `Promise.allSettled`:
1. `yf.quote(ticker)` — live price, change, quoteType, exchange, shortName
2. `yf.quoteSummary(ticker, { modules: ['summaryDetail', 'defaultKeyStatistics', 'calendarEvents', 'financialData'] }, { validateResult: false })`
3. `yf.historical(ticker, { period1: today-300days, interval: '1d' })` — for technicals

Computes technicals server-side using `technicalindicators` package:
- SMA(5/10/20/50/100/200), RSI(14), ATR(14), MACD(12,26,9), BollingerBands(20,2), Stochastic(14,3)

Returns merged flat object (all fields nullable — use `??  null` throughout):
```ts
{
  symbol, shortName, quoteType, exchange,
  price, change, changePct, high, low, volume, marketCap,
  previousClose, open, dayRangeLow, dayRangeHigh,
  fiftyTwoWeekLow, fiftyTwoWeekHigh, averageVolume,
  beta, dividendRate, dividendYield, exDividendDate,
  trailingPE, trailingEps,
  earningsDate,
  targetMeanPrice,
  revenuePerShare, grossProfits, profitMargins, operatingMargins,
  returnOnEquity, returnOnAssets,
  technicals: {
    ma5, ma10, ma20, ma50, ma100, ma200,
    rsi14, atr14,
    macd: { macd, signal, histogram } | null,
    bollingerBands: { upper, middle, lower } | null,
    stochastic: { k, d } | null,
  } | null,
}
```

### `GET /api/stocks/:ticker/history?period=1d|5d|1m|3m|1y`

Used only for index (lightweight-charts). Period → `yf.historical` mapping:

| period | interval | days back |
|--------|----------|-----------|
| 1d     | 5m       | 1         |
| 5d     | 60m      | 5         |
| 1m     | 1d       | 30        |
| 3m     | 1d       | 90        |
| 1y     | 1d       | 365       |

Returns `{ time, open, high, low, close, volume }[]`.

### `GET /api/stocks/:ticker/news`

- Calls `https://finnhub.io/api/v1/company-news?symbol=:ticker&from=:7daysAgo&to=:today&token=FINNHUB_API_KEY`
- Key from `process.env.FINNHUB_API_KEY` (`server/.env`); returns `[]` if key missing
- Returns top 10: `{ headline, source, url, datetime, summary, image }[]`

---

## Chart Components

### `client/src/components/TradingViewChart.tsx` *(new)*

For EQUITY / ETF / CRYPTOCURRENCY:
- `useEffect` injects TradingView Advanced Chart Widget script into a container `<div>`
- Props: `symbol: string`, `period: string`
- Period → TradingView interval: `1d→"D"`, `5d→"W"`, `1m→"M"`, `3m→"3M"`, `1y→"12M"`
- Cleans up (removes script + clears container) on symbol/period change

### `client/src/components/IndexChart.tsx` *(new)*

For INDEX:
- Fetches `GET /api/stocks/:ticker/history?period=:period` on mount and period change
- Creates `createChart()` from `lightweight-charts`, adds `CandlestickSeries`
- `ResizeObserver` handles container resize; cleanup on unmount

---

## StockDetail Page

`client/src/pages/StockDetail.tsx` — full rewrite:

1. `useParams<{ ticker: string }>()` to extract ticker
2. Fetch `/summary` and `/news` in parallel on ticker change; loading/error states
3. **Summary header** — symbol (bold, large), shortName, price (`toLocaleString` format `999,999.99`), change + changePct (green/red with ▲/▼), high/low/volume/marketCap row
4. **Chart + Key Stats** — flex row; chart takes `flex-1`, key stats panel is `w-[300px] shrink-0`
   - Period buttons `[1D][5D][1M][3M][1Y]` above chart; active button highlighted blue
   - Render `<TradingViewChart>` or `<IndexChart>` based on `quoteType === 'INDEX'`
5. **Key Stats panel** — label/value grid; `—` for nulls; format: numbers with `toLocaleString`, percentages ×100 with `%`, dates with `toLocaleDateString`
6. **Fundamentals section** — card grid: Revenue/Share, Gross Profits, Profit Margin, Operating Margin, ROE, ROA
7. **Technicals section** — two sub-grids:
   - MA table: period | value | vs price signal (green "Above" / red "Below")
   - Oscillators: RSI(14) with Overbought/Neutral/Oversold label; ATR(14); MACD with Bullish/Bearish; BB upper/mid/lower; Stochastic %K/%D with label
8. **News section** — list of up to 10 articles: `<img>` thumbnail (40×40, fallback gray box) | headline as `<a target="_blank">` | source + formatted date

---

## Files to Create / Modify

**Server:**
- `server/src/routes/stockDetail.ts` — all three endpoints + technicals computation *(new)*
- `server/src/index.ts` — register `stockDetailRouter` under `/api/stocks`
- `server/.env` — add `FINNHUB_API_KEY=`

**Client:**
- `client/src/pages/StockDetail.tsx` — full rewrite
- `client/src/components/TradingViewChart.tsx` *(new)*
- `client/src/components/IndexChart.tsx` *(new)*

---

## Verification

1. Click AAPL → header shows live price, change, high/low/vol/cap
2. TradingView chart renders; period buttons switch interval
3. Click `^GSPC` → lightweight-charts candlestick renders with history data
4. Key stats panel shows Previous Close, PE Ratio, EPS, dividend info, etc.
5. Fundamentals section shows revenue, margins, ROE/ROA
6. Technicals shows MA5–MA200 signals, RSI label, ATR, MACD, BB, Stochastic
7. All null/missing fields display `—`
8. News section shows up to 10 articles with thumbnail, headline link, source + date
