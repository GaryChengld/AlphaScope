# 10 — Stock Analysis Tab

## Goal

Add an **Analysis** tab to the Stock Detail page for EQUITY stocks only (after Technicals).
Combines analyst price targets, recommendation breakdown, recent analyst actions, and
qualitative valuation from two data sources: `quoteSummary` and `yf.insights`.

---

## Data Sources

### `quoteSummary` modules (already partially used)
- **`financialData`** — consensus target prices + recommendation key/mean/count
- **`recommendationTrend`** — 4-month breakdown of Strong Buy / Buy / Hold / Sell / Strong Sell counts
- **`upgradeDowngradeHistory`** — per-firm recent rating changes with price targets

### `yf.insights` (new)
- **`instrumentInfo.valuation`** — Trading Central qualitative valuation (Overvalued/Undervalued, discount %, relativeValue)
- **`instrumentInfo.technicalEvents`** — short / intermediate / long-term outlook direction + score
- **`instrumentInfo.keyTechnicals`** — support, resistance, stop-loss levels
- **`recommendation`** — Argus Research rating + target price

---

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ANALYST CONSENSUS           │  VALUATION (Trading Central)     │
│  ● BUY  (1.89 / 5.0)        │  Overvalued  −6%  Premium        │
│  40 analysts                │  Support: 229.40                  │
│  Target: $297 mean          │  Resistance: 271.41              │
│  Range: $205 – $350         │  Stop Loss: 253.01               │
│  ─────────────────────────  ├──────────────────────────────────┤
│  Strong Buy  ████████   7   │  TECHNICAL OUTLOOK               │
│  Buy         █████████ 24   │  Short-term:    Bullish (2/5)    │
│  Hold        █████     14   │  Intermediate:  Bullish (3/5)    │
│  Sell        █          1   │  Long-term:     Bullish (2/5)    │
│  Strong Sell █          1   │                                  │
├─────────────────────────────┴──────────────────────────────────┤
│  RECENT ANALYST ACTIONS                                         │
│  Date        Firm               Action    Grade     Target      │
│  Apr 17      BNP Paribas        Upgrade   Outperform  $300     │
│  Apr 14      B of A Securities  Maintain  Buy         $325     │
│  Mar 31      Wedbush            Maintain  Outperform  $350     │
│  ...                                                           │
└────────────────────────────────────────────────────────────────┘
```

---

## Server

### New endpoint: `GET /api/stocks/:ticker/analysis`

Thin route handler in `stockDetail.ts` delegating to `stockService.ts`.

#### New service function: `getStockAnalysis(ticker: string)`

```ts
export interface StockAnalysis {
  // Analyst consensus (financialData)
  targetMeanPrice: number | null;
  targetMedianPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  numberOfAnalystOpinions: number | null;
  recommendationKey: string | null;      // "buy" | "hold" | "sell" | "strong_buy" | "strong_sell"
  recommendationMean: number | null;     // 1.0 (Strong Buy) – 5.0 (Strong Sell)

  // Recommendation breakdown — current month only (recommendationTrend.trend[0])
  recommendationBreakdown: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  } | null;

  // Qualitative valuation (insights.instrumentInfo.valuation)
  valuation: {
    description: string;       // "Overvalued" | "Undervalued" | "Fairly Valued"
    discount: string;          // "-6%" or "+12%"
    relativeValue: string;     // "Premium" | "Discount"
    provider: string;          // "Trading Central"
  } | null;

  // Key technicals from insights
  keyTechnicals: {
    support: number;
    resistance: number;
    stopLoss: number;
    provider: string;
  } | null;

  // Technical outlook from insights
  technicalOutlook: {
    shortTerm:    { direction: string; score: number; description: string };
    intermediate: { direction: string; score: number; description: string };
    longTerm:     { direction: string; score: number; description: string };
    provider: string;
  } | null;

  // Recent analyst actions (upgradeDowngradeHistory — last 10)
  analystActions: Array<{
    date: string;              // ISO date string
    firm: string;
    fromGrade: string | null;
    toGrade: string;
    action: string;            // "up" | "down" | "main" | "reit" | "init"
    currentPriceTarget: number | null;
  }>;
}
```

**Implementation:**
- Call `quoteSummary(ticker, { modules: ['financialData', 'recommendationTrend', 'upgradeDowngradeHistory'] })` and `yf.insights(ticker)` concurrently with `Promise.allSettled`.
- Use `{ validateResult: false }` on both.
- Map results to `StockAnalysis`; return all-null if both calls fail.
- Limit `analystActions` to the 10 most recent entries.

---

## Client

### New state in `StockDetail.tsx`

```ts
const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
const [analysisLoading, setAnalysisLoading] = useState(false);
```

Fetch lazily — only when the Analysis tab is first activated:

```ts
useEffect(() => {
  if (activeTab !== 'analysis' || analysis !== null || !ticker) return;
  setAnalysisLoading(true);
  fetch(`/api/stocks/${encodeURIComponent(ticker)}/analysis`)
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d) setAnalysis(d); })
    .catch(() => {})
    .finally(() => setAnalysisLoading(false));
}, [activeTab, ticker]);
```

Reset on ticker change: include `setAnalysis(null)` in the existing `useEffect` on `ticker`.

### Tab visibility

Add `'analysis'` to `visibleTabs` filter alongside `'fundamentals'` — show only for EQUITY:

```ts
const visibleTabs = (['fundamentals', 'technicals', 'analysis', 'news'] as const)
  .filter(t => t !== 'fundamentals' && t !== 'analysis' || isStock);
```

### UI sections

#### Analyst Consensus card
- Large pill badge for `recommendationKey` (Strong Buy = green, Buy = light green, Hold = yellow, Sell = red, Strong Sell = deep red)
- `recommendationMean` shown as `X.X / 5.0`
- Mean / Median / High / Low target prices
- Number of analysts

#### Recommendation Breakdown (horizontal bar chart)
- Five rows: Strong Buy, Buy, Hold, Sell, Strong Sell
- Bar: `bg-green-500`, `bg-green-400`, `bg-yellow-400`, `bg-red-400`, `bg-red-600`
- Bar width proportional to count vs. total analysts
- Count label on the right

#### Valuation card (Trading Central)
- Large label: "Overvalued" / "Undervalued" in appropriate color (red/green)
- Discount % badge
- relativeValue ("Premium" / "Discount")
- Support / Resistance / Stop Loss rows

#### Technical Outlook (Trading Central)
- Three rows: Short-term · Intermediate · Long-term
- Direction badge colored by Bullish (green) / Bearish (red) / Neutral (gray)
- Score shown as `X/5` with filled dots or a simple score bar

#### Recent Analyst Actions table
- Columns: **Date** | **Firm** | **Action** | **Grade** | **Target**
- Action badge: Upgrade (green), Downgrade (red), Maintain/Reiterate (gray), Initiate (blue)
- Show up to 10 rows; most recent first

#### Loading / empty states
- Skeleton rows while `analysisLoading`
- "Analysis data unavailable" if all fields null

---

## Files

| Action | File |
|--------|------|
| Modify | `server/src/services/stockService.ts` — add `getStockAnalysis` |
| Modify | `server/src/routes/stockDetail.ts` — add `GET /:ticker/analysis` |
| Modify | `client/src/pages/StockDetail.tsx` — new tab + all UI sections |

---

## Tasks

- [ ] `stockService.ts` — add `getStockAnalysis`: fetch `quoteSummary` + `insights` concurrently, map to `StockAnalysis`
- [ ] `stockDetail.ts` — add `GET /:ticker/analysis` route
- [ ] `StockDetail.tsx` — add `'analysis'` to `visibleTabs`, lazy-fetch state, reset on ticker change
- [ ] `StockDetail.tsx` — Analyst Consensus card + Recommendation Breakdown bars
- [ ] `StockDetail.tsx` — Valuation card + Technical Outlook section
- [ ] `StockDetail.tsx` — Recent Analyst Actions table
