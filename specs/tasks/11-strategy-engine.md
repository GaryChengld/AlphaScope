# 11 — Strategy Engine (JSON-Driven)

## Goal

Build a backend strategy evaluation engine that:
- Evaluates a single stock ticker against a strategy defined in a JSON file
- Returns a structured `StrategyResult` JSON from the pure engine; `strategyService` converts it to Markdown (or future formats)
- Is fully reusable — adding a new strategy requires only a new JSON file and, if needed, new rule functions
- Exposes REST endpoints under `/api/strategies` so the client can list strategies and evaluate any stock

---

## Architecture Overview

```
server/src/
├── services/
│   ├── rules/
│   │   ├── ruleRegistry.ts       — maps rule name string → RuleFn
│   │   ├── trendRules.ts         — priceAboveEma, emaAlignment, weeklyTrend, rsVsSpy, etc.
│   │   ├── pullbackRules.ts      — validPullback, fibRetracement, pullbackVolume, supportConfluence, rsiStructure, etc.
│   │   ├── triggerRules.ts       — hourlyEmaCrossover, hourlyEngulfing, triggerVolume, triggerTiming, etc.
│   │   └── marketRules.ts        — noNearEarnings, sectorStrength, marketRegime, manualReview
│   └── strategy/
│       ├── strategyContext.ts    — StrategyContext interface + buildStrategyContext(ticker)
│       ├── strategyEngine.ts     — pure evaluator: (StrategyContext, StrategyDef) → StrategyResult (JSON)
│       └── strategyService.ts    — orchestrator + format converters (toMarkdown, etc.)
├── routes/
│   └── strategyRoutes.ts         — GET /api/strategies, GET /api/strategies/:id/evaluate/:ticker
└── (project root) specs/strategies/
    └── multi_timeframe_pullback.json
```

**Data flow:**
```
strategyService (orchestrator)
  ├── strategyContext     → builds StrategyContext (all fetches + indicator series)
  ├── strategyEngine      → pure evaluation: StrategyContext + StrategyDef → StrategyResult (JSON)
  └── toMarkdown(result)  → Markdown string (or future: toHtml, toCsv, etc.)
```

---

## API Endpoints

### Strategy listing (for dropdown)
```
GET /api/strategies
→ [{ id, name, version }, ...]
```
Reads `specs/strategies/index.json`, filters `enabled: true`, returns `id`, `name`, `version` — no strategy JSON files are opened.

### Per-stock evaluation
```
GET /api/strategies/:strategyId/evaluate/:ticker
→ text/markdown
```
`strategyId` matches the `"id"` field in the JSON (e.g. `multi_timeframe_pullback`).
Returns 404 if the strategy file is not found.

---

## Data Layer — StrategyContext (strategyContext.ts)

All data for one ticker is fetched concurrently via `Promise.allSettled` and assembled into a `StrategyContext`. `buildStrategyContext` reads the strategy's `requires` block and only fetches and computes what is declared — making it efficient and fully driven by the JSON.

### TypeScript interfaces

```ts
export interface TimeframeData {
  candles: OhlcvRow[];
  ema: Record<number, number[]>;   // period → full series, e.g. ema[20], ema[200]
  atr: Record<number, number[]>;   // period → full series, e.g. atr[14]
  rsi: Record<number, number[]>;   // period → full series, e.g. rsi[14]
}

export interface StrategyContext {
  ticker: string;
  timeframes: Record<string, TimeframeData>;  // keyed by timeframe: '1D', '1W', '1H', etc.
  spy: TimeframeData;                          // SPY 1D, always fetched; always includes EMA200
  vix:           number | null;
  earningsDate:  string | null;          // ISO date from calendarEvents
  sectorEtf:     string | null;          // e.g. "XLK", mapped from assetProfile.sector
  sectorReturns: Record<string, number>; // all 11 ETF tickers → 30-day return
}
```

**Rules access data as:**
- `ctx.timeframes['1D'].ema[20]` — daily EMA20 series (last element = current value)
- `ctx.timeframes['1W'].ema[50]` — weekly EMA50 series
- `ctx.timeframes['1H'].ema[9]`  — hourly EMA9 series
- `ctx.spy.ema[200]`             — SPY daily EMA200 series

### `buildStrategyContext` signature

```ts
export async function buildStrategyContext(
  ticker: string,
  requires: IndicatorRequirements,
): Promise<StrategyContext>

export interface IndicatorRequirements {
  timeframes: Record<string, {
    ema?: number[];
    atr?: number[];
    rsi?: number[];
  }>;
}
```

`buildStrategyContext` reads `requires.timeframes` and fetches only the declared timeframes for the ticker. SPY 1D + EMA200, VIX, earnings date, and all 11 sector ETF 30-day returns are always fetched regardless.

### Concurrent fetches

- `getStockCandles(ticker, tf)` for each timeframe declared in `requires` — reuse existing service
- `getStockCandles('SPY', '1D')` — always
- `getLivePrices(['^VIX'])` — always
- `yf.quoteSummary(ticker, { modules: ['assetProfile', 'calendarEvents'] }, { validateResult: false })` — always
- `Promise.allSettled(SECTOR_TICKERS.map(t => getStockCandles(t, '1D')))` → compute 30-day return per ETF — always

**30-day return:** `(last.close - candles[candles.length - 22].close) / candles[candles.length - 22].close`

**Indicator series:** computed via `EMA.calculate`, `ATR.calculate`, `RSI.calculate` from `technicalindicators`. Series are shorter than the candle array — align by trimming candles to match series length.

**Sector name → ETF mapping** (Yahoo Finance returns names like "Technology", "Financial Services"):
```ts
const SECTOR_TO_ETF: Record<string, string> = {
  'Technology':             'XLK',
  'Financial Services':     'XLF',
  'Energy':                 'XLE',
  'Healthcare':             'XLV',
  'Industrials':            'XLI',
  'Communication Services': 'XLC',
  'Consumer Cyclical':      'XLY',
  'Consumer Defensive':     'XLP',
  'Real Estate':            'XLRE',
  'Basic Materials':        'XLB',
  'Utilities':              'XLU',
};
```

---

## Atomic Rule Functions (rules/)

### Shared contract

```ts
export interface RuleResult {
  pass:     boolean;
  points:   number;
  detail:   string;
  warning?: string;
}

type RuleFn = (ctx: StrategyContext, params: Record<string, unknown>) => RuleResult;
```

Rules use `params.timeframe` (e.g. `'1D'`, `'1W'`, `'1H'`) to index into `ctx.timeframes`. All timeframe string values in rule params must exactly match the keys declared in the strategy's `requires.timeframes`.

`ruleRegistry.ts` imports all rule files and exports:
```ts
export const RULES: Record<string, RuleFn> = { ...trendRules, ...pullbackRules, ...triggerRules, ...marketRules };
```

### Rule Inventory

**`trendRules.ts`**

| Rule ID | Description | Key params |
|---------|-------------|------------|
| `priceAboveEma` | Price > EMA(period) on given timeframe | `period`, `timeframe` (`'1D'`/`'1W'`/`'1H'`) |
| `emaAlignment` | EMA20 > EMA50 > EMA200 on daily | — |
| `emaAlignmentSlope` | Quality of EMA slope over last 5 bars | `quality`: `all_sloping` / `ema200_flat` / `converging` |
| `weeklyTrend` | Price above weekly EMA50 + HH/HL structure | `minWeeks` |
| `uptrendDuration` | Consecutive weeks of HH+HL | `minWeeks`, `maxWeeks?` |
| `rsVsSpy` | 63-day RS ratio vs SPY | `minRatio`, `maxRatio?` |
| `spyAboveEma200` | SPY price > SPY EMA 200 | — |

**`pullbackRules.ts`**

| Rule ID | Description | Key params |
|---------|-------------|------------|
| `validPullback` | Pullback depth 1–3× ATR from 20-bar high | `minAtr`, `maxAtr` |
| `pullbackToSupport` | Within N× ATR of EMA20 or EMA50 | `atrThreshold` |
| `pullbackAtrDepth` | ATR-based pullback depth range | `min`, `max` |
| `fibRetracement` | Fibonacci retracement % of last swing | `min`, `max` |
| `pullbackVolume` | Volume behaviour during pullback | `quality`: `ideal` / `below_avg` / `flat` / `increasing` |
| `pullbackDuration` | Trading days since swing high | `minDays`, `maxDays?` |
| `supportProximity` | Price within 0.5× ATR of EMA or round number | `ema`: 20/50, `roundNumber` |
| `swingHighPolarity` | Prior swing high acting as current support (polarity flip) — finds the most recent daily swing high before the pullback, passes if current price is within 0.5× ATR of that level | — |
| `supportConfluence` | Count of overlapping support factors (EMA20, EMA50, Fib level, swing high polarity, round number) | `minFactors` |
| `rsiLevel` | RSI(14) within a range | `min`, `max` |
| `rsiStructure` | RSI divergence or turning up | `type`: `divergence` / `turning_up` |

**`triggerRules.ts`**

| Rule ID | Description | Key params |
|---------|-------------|------------|
| `hourlyEmaCrossover` | EMA9 crosses above EMA21 on 1H | `fast`, `slow` |
| `hourlyStructureBreak` | Close breaks above recent 1H swing high | `lookback` |
| `hourlyEngulfing` | Bullish engulfing candle on 1H | — |
| `triggerVolume` | Trigger candle volume vs 1H average | `minPctAboveAvg` |
| `triggerTiming` | Days between pullback signal and trigger | `maxDaysAfterSignal` |
| `triggerTimeOfDay` | Trigger candle hour in EST | `minHour`, `maxHour` |

**`marketRules.ts`**

| Rule ID | Description | Key params |
|---------|-------------|------------|
| `noNearEarnings` | No earnings within N trading days | `tradingDays` |
| `sectorStrength` | Stock's sector ETF ranked in top N | `topN` |
| `marketRegime` | SPY uptrend + VIX below threshold | `maxVix` |
| `manualReview` | Emits a warning; always pass=false, points=0 | `label` |

---

## Strategy Engine (strategyEngine.ts)

Pure function — no I/O, no file reads:

```ts
export function evaluateStrategy(
  ctx: StrategyContext,
  strategy: StrategyDefinition,
): StrategyResult
```

### StrategyResult shape

```ts
export interface StrategyResult {
  ticker: string;
  strategyId: string;
  strategyName: string;
  generatedAt: string;        // ISO datetime
  mandatoryPass: boolean;
  mandatory: MandatoryResult[];
  sections: SectionResult[];
  totalScore: number;         // 0 if mandatory failed
}

interface MandatoryResult {
  label: string;
  pass: boolean;
  detail: string;
  warning?: string;
}

interface SectionResult {
  name: string;
  maxPoints: number;
  score: number;              // capped by section.cap if present
  groups: GroupResult[];
}

interface GroupResult {
  label: string;
  score: number;
  winner?: ConditionResult;   // undefined for 'additive' pick
  evaluated: ConditionResult[];
}

interface ConditionResult {
  label: string;
  pass: boolean;
  points: number;
  detail: string;
  warning?: string;
}
```

### Group evaluation

```ts
function evaluateGroup(group: GroupDef, ctx: StrategyContext): GroupResult {
  const evaluated = group.conditions.map(c => ({
    ...c, result: RULES[c.rule](ctx, c.params ?? {}),
  }));
  switch (group.pick) {
    case 'tiered':
      // Award the first condition that passes
      const hit = evaluated.find(e => e.result.pass);
      return { group, evaluated, score: hit?.points ?? 0, winner: hit };
    case 'best_trigger':
      // Award the highest-scoring passing condition
      const best = evaluated.filter(e => e.result.pass)
                            .sort((a, b) => b.points - a.points)[0];
      return { group, evaluated, score: best?.points ?? 0, winner: best };
    case 'additive':
      // Sum all passing conditions
      const total = evaluated.filter(e => e.result.pass)
                             .reduce((s, e) => s + e.points, 0);
      return { group, evaluated, score: total };
  }
}
```

**Section 5 conditional:** Only evaluate the 1H Trigger section when sections 1–4 combined score ≥ 40 points.

---

## Strategy Service (strategyService.ts)

### Strategies directory resolution

Strategy JSON files live in `specs/strategies/` at the project root, separate from the server source tree. The path is resolved via environment variable so strategies and code can be managed and deployed independently:

```ts
const STRATEGIES_DIR = process.env.STRATEGIES_DIR
  ?? path.resolve(__dirname, '../../../../specs/strategies');
```

The fallback (`__dirname` + 4 levels up) reaches the project root from both dev (`server/src/services/strategy/`) and prod (`server/dist/services/strategy/`), so no env var is needed during local development. In production, set `STRATEGIES_DIR` to the absolute path of the strategies folder.

Add to `.env` for production deployments:
```
STRATEGIES_DIR=/absolute/path/to/specs/strategies
```

### Exported functions

```ts
export function listStrategies(): { id: string; name: string; version: string }[]
// Reads index.json from STRATEGIES_DIR, filters enabled: true.
// Never opens individual strategy JSON files.

export function loadStrategy(id: string): StrategyDefinition
// 1. Reads index.json, finds entry by id.
// 2. Throws 'STRATEGY_NOT_FOUND' if missing or enabled: false.
// 3. Loads path.join(STRATEGIES_DIR, entry.file).

export async function runStrategy(ticker: string, strategyId: string): Promise<StrategyResult>
// 1. loadStrategy(strategyId)                       → StrategyDefinition
// 2. buildStrategyContext(ticker, strategy.requires) → StrategyContext
// 3. evaluateStrategy(ctx, strategy)                → StrategyResult

export function toMarkdown(result: StrategyResult): string
```
```

**toMarkdown score bands** (from strategy spec):
- `totalScore ≥ 80` → `🟢 EXCELLENT SETUP — Full position size (risk 1.5–2% of account)`
- `totalScore ≥ 70` → `🟢 STRONG SETUP — Standard position size (risk 1% of account)`
- `totalScore ≥ 60` → `🟡 ACCEPTABLE SETUP — Reduced position size (risk 0.5–0.75% of account)`
- `totalScore ≥ 50` → `🔴 MARGINAL SETUP — DO NOT ENTER, wait for improvement or skip`
- `totalScore < 50`  → `🔴 WEAK SETUP — DO NOT ENTER`
- `mandatoryPass === false` → `**DO NOT ENTER**` banner, no scoring sections rendered

**Known limitation — manual triggers in Section 5:**
Two trigger conditions in the strategy JSON use `manualReview` (`"Descending trendline break"` at 8 pts, `"1H RSI divergence"` at 7 pts). Because `manualReview` returns `pass: false`, these are never selected by `best_trigger` and cannot contribute to the automated score. They appear in the report output as `⚠️ Manual review required` warnings. The engine only scores the three detectable triggers: `hourlyStructureBreak` (8 pts), `hourlyEngulfing` (7 pts), and `hourlyEmaCrossover` (6 pts).

---

## Strategy Registry — specs/strategies/index.json

The index is the single source of truth for strategy metadata. `name`, `version`, `file`, and `enabled` all live here; the strategy JSON files are not opened for listing.

```json
[
  {
    "id":      "multi_timeframe_pullback",
    "name":    "Multi-Timeframe Pullback Swing Trading",
    "version": "1.0",
    "file":    "multi_timeframe_pullback_v1.json",
    "enabled": true
  }
]
```

**Version upgrade workflow:** create `multi_timeframe_pullback_v2.json`, update the index entry's `file` and `version` fields. The old file stays for rollback. The `name`/`version` fields inside each strategy JSON are kept for self-documentation but are not used at runtime.

**TypeScript interface for an index entry:**
```ts
interface StrategyEntry {
  id:      string;
  name:    string;
  version: string;
  file:    string;
  enabled: boolean;
}
```

---

## Strategy JSON Schema (specs/strategies/multi_timeframe_pullback_v1.json)

### Top-level shape

```json
{
  "id":      "multi_timeframe_pullback",
  "name":    "Multi-Timeframe Pullback Swing Trading",
  "version": "1.0",
  "requires": {
    "timeframes": {
      "1D": { "ema": [20, 50, 200], "atr": [14], "rsi": [14] },
      "1W": { "ema": [50] },
      "1H": { "ema": [9, 21] }
    }
  },
  "mandatory": [ ...ConditionDef[] ],
  "sections":  [ ...SectionDef[]   ]
}
```

`requires.timeframes` declares exactly which candle timeframes and indicator series to fetch for the stock being evaluated. SPY 1D (EMA200), VIX, earnings, and sector ETF returns are always fetched and do not need to be declared.

### ConditionDef (mandatory array)

```json
{ "rule": "<ruleId>", "params": {}, "label": "Human-readable label" }
```

### SectionDef

```json
{
  "name":      "Section name",
  "maxPoints": 25,
  "cap":       25,
  "groups":    [ ...GroupDef[] ]
}
```

### GroupDef

```json
{
  "label": "Group label",
  "pick":  "tiered | best_trigger | additive",
  "conditions": [ ...ScoringCondition[] ]
}
```

`pick` semantics:
- **`tiered`** — evaluate all in order, award the first passing condition
- **`best_trigger`** — evaluate all, award the highest-scoring passing condition
- **`additive`** — evaluate all independently, sum points

### ScoringCondition

```json
{ "rule": "<ruleId>", "params": {}, "points": 10, "label": "...", "warning": "optional" }
```

### Full JSON — `multi_timeframe_pullback_v1.json`

```json
{
  "id": "multi_timeframe_pullback",
  "name": "Multi-Timeframe Pullback Swing Trading",
  "version": "1.0",

  "requires": {
    "timeframes": {
      "1D": { "ema": [20, 50, 200], "atr": [14], "rsi": [14] },
      "1W": { "ema": [50] },
      "1H": { "ema": [9, 21] }
    }
  },

  "mandatory": [
    { "rule": "priceAboveEma",     "params": { "period": 200, "timeframe": "1D" },
      "label": "Price above daily EMA 200" },
    { "rule": "emaAlignment",      "params": {},
      "label": "EMA 20 > EMA 50 > EMA 200 (daily)" },
    { "rule": "weeklyTrend",       "params": { "minWeeks": 2 },
      "label": "Weekly trend — above EMA 50, HH/HL structure" },
    { "rule": "validPullback",     "params": { "minAtr": 1, "maxAtr": 3 },
      "label": "Valid pullback 1–3× ATR from 20-bar high" },
    { "rule": "pullbackToSupport", "params": { "atrThreshold": 1 },
      "label": "Pullback within 1× ATR of EMA 20 or EMA 50" },
    { "rule": "spyAboveEma200",    "params": {},
      "label": "SPY above its 200-day EMA" },
    { "rule": "noNearEarnings",    "params": { "tradingDays": 5 },
      "label": "No earnings within 5 trading days" }
  ],

  "sections": [
    {
      "name": "Trend Strength", "maxPoints": 25,
      "groups": [
        {
          "label": "EMA Alignment Quality", "pick": "tiered",
          "conditions": [
            { "rule": "emaAlignmentSlope", "params": { "quality": "all_sloping" }, "points": 10, "label": "All three sloping upward" },
            { "rule": "emaAlignmentSlope", "params": { "quality": "ema200_flat" }, "points": 7,  "label": "EMA 200 flat" },
            { "rule": "emaAlignmentSlope", "params": { "quality": "converging" },  "points": 4,  "label": "EMA 20 and 50 converging" }
          ]
        },
        {
          "label": "Uptrend Duration", "pick": "tiered",
          "conditions": [
            { "rule": "uptrendDuration", "params": { "minWeeks": 12 },                  "points": 8, "label": "3+ months" },
            { "rule": "uptrendDuration", "params": { "minWeeks": 8, "maxWeeks": 12 },   "points": 5, "label": "2–3 months" },
            { "rule": "uptrendDuration", "params": { "minWeeks": 6, "maxWeeks": 8 },    "points": 3, "label": "6–8 weeks" }
          ]
        },
        {
          "label": "Relative Strength vs SPY (63 days)", "pick": "tiered",
          "conditions": [
            { "rule": "rsVsSpy", "params": { "minRatio": 1.2 },                          "points": 7, "label": "RS > 1.2" },
            { "rule": "rsVsSpy", "params": { "minRatio": 1.0, "maxRatio": 1.2 },         "points": 4, "label": "RS 1.0–1.2" },
            { "rule": "rsVsSpy", "params": { "minRatio": 0.9, "maxRatio": 1.0 },         "points": 2, "label": "RS 0.9–1.0" }
          ]
        }
      ]
    },
    {
      "name": "Pullback Quality", "maxPoints": 25,
      "groups": [
        {
          "label": "Fibonacci Retracement Depth", "pick": "tiered",
          "conditions": [
            { "rule": "fibRetracement", "params": { "min": 38.2, "max": 50.0 }, "points": 10, "label": "38.2–50% (ideal)" },
            { "rule": "fibRetracement", "params": { "min": 50.0, "max": 61.8 }, "points": 7,  "label": "50–61.8%" },
            { "rule": "fibRetracement", "params": { "min": 23.6, "max": 38.2 }, "points": 5,  "label": "23.6–38.2%" },
            { "rule": "fibRetracement", "params": { "min": 61.8, "max": 78.6 }, "points": 2,  "label": "61.8–78.6%" }
          ]
        },
        {
          "label": "ATR-Based Pullback Depth", "pick": "tiered",
          "conditions": [
            { "rule": "pullbackAtrDepth", "params": { "min": 1.5, "max": 2.5 }, "points": 5, "label": "1.5–2.5× ATR" },
            { "rule": "pullbackAtrDepth", "params": { "min": 1.0, "max": 1.5 }, "points": 3, "label": "1.0–1.5× ATR" },
            { "rule": "pullbackAtrDepth", "params": { "min": 2.5, "max": 3.0 }, "points": 2, "label": "2.5–3.0× ATR" }
          ]
        },
        {
          "label": "Volume During Pullback", "pick": "tiered",
          "conditions": [
            { "rule": "pullbackVolume", "params": { "quality": "ideal" },     "points": 7, "label": "Progressively declining, final < 80% avg" },
            { "rule": "pullbackVolume", "params": { "quality": "below_avg" }, "points": 4, "label": "Below avg, not consistently declining" },
            { "rule": "pullbackVolume", "params": { "quality": "flat" },      "points": 2, "label": "Roughly at 20-day average" }
          ]
        },
        {
          "label": "Pullback Duration", "pick": "tiered",
          "conditions": [
            { "rule": "pullbackDuration", "params": { "minDays": 3, "maxDays": 8  }, "points": 3, "label": "3–8 trading days" },
            { "rule": "pullbackDuration", "params": { "minDays": 9, "maxDays": 15 }, "points": 2, "label": "9–15 trading days" },
            { "rule": "pullbackDuration", "params": { "minDays": 1, "maxDays": 2  }, "points": 1, "label": "1–2 trading days" }
          ]
        }
      ]
    },
    {
      "name": "Support Confluence", "maxPoints": 15, "cap": 15,
      "groups": [
        {
          "label": "Primary Support Level", "pick": "tiered",
          "conditions": [
            { "rule": "supportProximity",  "params": { "ema": 20 },           "points": 5, "label": "Near EMA 20 (0.5× ATR)" },
            { "rule": "supportProximity",  "params": { "ema": 50 },           "points": 4, "label": "Near EMA 50 (0.5× ATR)" },
            { "rule": "swingHighPolarity", "params": {},                       "points": 4, "label": "Prior swing high acting as support (polarity flip)" },
            { "rule": "supportProximity",  "params": { "roundNumber": true },  "points": 2, "label": "Near round number" }
          ]
        },
        {
          "label": "Support Confluence Bonus", "pick": "tiered",
          "conditions": [
            { "rule": "supportConfluence", "params": { "minFactors": 3 }, "points": 10, "label": "3+ factors converging" },
            { "rule": "supportConfluence", "params": { "minFactors": 2 }, "points": 7,  "label": "2 factors converging" },
            { "rule": "supportConfluence", "params": { "minFactors": 1 }, "points": 3,  "label": "1 factor only" }
          ]
        }
      ]
    },
    {
      "name": "RSI & Momentum", "maxPoints": 10,
      "groups": [
        {
          "label": "RSI(14) Reading", "pick": "tiered",
          "conditions": [
            { "rule": "rsiLevel", "params": { "min": 40, "max": 50 }, "points": 5, "label": "RSI 40–50 (ideal)" },
            { "rule": "rsiLevel", "params": { "min": 50, "max": 55 }, "points": 3, "label": "RSI 50–55" },
            { "rule": "rsiLevel", "params": { "min": 35, "max": 40 }, "points": 2, "label": "RSI 35–40" }
          ]
        },
        {
          "label": "RSI Structure", "pick": "tiered",
          "conditions": [
            { "rule": "rsiStructure", "params": { "type": "divergence"  }, "points": 5, "label": "Bullish divergence" },
            { "rule": "rsiStructure", "params": { "type": "turning_up" }, "points": 3, "label": "RSI > 40 and turning upward" }
          ]
        }
      ]
    },
    {
      "name": "1-Hour Chart Trigger Signal", "maxPoints": 20, "cap": 20,
      "note": "Only evaluated when Sections 1–4 score ≥ 40 points combined",
      "groups": [
        {
          "label": "Trigger Type", "pick": "best_trigger",
          "conditions": [
            { "rule": "manualReview",         "params": { "label": "Descending trendline break" },             "points": 8, "label": "1H candle closes above descending trendline",                                "warning": "Manual review required — trendline cannot be detected automatically" },
            { "rule": "hourlyStructureBreak", "params": { "lookback": 6 },                                     "points": 8, "label": "1H structure break — price above most recent 1H swing high" },
            { "rule": "hourlyEngulfing",      "params": {},                                                     "points": 7, "label": "Bullish engulfing or hammer/pin bar at daily support on 1H" },
            { "rule": "manualReview",         "params": { "label": "1H RSI divergence + break above mid-point high" }, "points": 7, "label": "Bullish RSI divergence on 1H + price breaks above high between two lows", "warning": "Manual review required — RSI divergence pattern cannot be detected automatically" },
            { "rule": "hourlyEmaCrossover",   "params": { "fast": 9, "slow": 21 },                             "points": 6, "label": "EMA 9 crossed above EMA 21 on 1H" }
          ]
        },
        {
          "label": "Volume on Trigger", "pick": "tiered",
          "conditions": [
            { "rule": "triggerVolume", "params": { "minPctAboveAvg": 50 }, "points": 5, "label": "50%+ above 1H average" },
            { "rule": "triggerVolume", "params": { "minPctAboveAvg": 20 }, "points": 3, "label": "20–50% above 1H average" },
            { "rule": "triggerVolume", "params": { "minPctAboveAvg": 0  }, "points": 1, "label": "At 1H average" }
          ]
        },
        {
          "label": "Trigger Timing", "pick": "tiered",
          "conditions": [
            { "rule": "triggerTiming", "params": { "maxDaysAfterSignal": 2 }, "points": 4, "label": "Day 1–2 after pullback signal" },
            { "rule": "triggerTiming", "params": { "maxDaysAfterSignal": 3 }, "points": 2, "label": "Day 3 after pullback signal" }
          ]
        },
        {
          "label": "Trigger Time of Day (EST)", "pick": "tiered",
          "conditions": [
            { "rule": "triggerTimeOfDay", "params": { "minHour": 10,   "maxHour": 14   }, "points": 3, "label": "10:00 AM–2:00 PM" },
            { "rule": "triggerTimeOfDay", "params": { "minHour": 14,   "maxHour": 15.5 }, "points": 2, "label": "2:00–3:30 PM" }
          ]
        }
      ]
    },
    {
      "name": "Sector & Market Context", "maxPoints": 5,
      "groups": [
        {
          "label": "Sector ETF Strength (30-day return rank)", "pick": "tiered",
          "conditions": [
            { "rule": "sectorStrength", "params": { "topN": 3 }, "points": 3, "label": "Top 3 performing sectors" },
            { "rule": "sectorStrength", "params": { "topN": 7 }, "points": 1, "label": "In line with market" }
          ]
        },
        {
          "label": "Broad Market Condition", "pick": "tiered",
          "conditions": [
            { "rule": "marketRegime", "params": { "maxVix": 20 }, "points": 2, "label": "SPY uptrend + VIX < 20" },
            { "rule": "marketRegime", "params": { "maxVix": 30 }, "points": 1, "label": "SPY uptrend + VIX 20–30" }
          ]
        }
      ]
    }
  ]
}
```

---

## Markdown Output Shape

```markdown
# Multi-Timeframe Pullback Scan — AAPL
*Generated: 2026-04-19 14:32 ET · Strategy v1.0*

## Mandatory Conditions
- [x] Price above daily EMA 200 — $175.50 > EMA200 $162.30
- [x] EMA 20 > EMA 50 > EMA 200 — $176.2 / $170.1 / $162.3
- [x] Weekly trend — above weekly EMA 50, 8 weeks HH/HL
- [x] Valid pullback — 2.1× ATR below 20-bar high ($189.40)
- [x] Pullback to support — 0.4× ATR from EMA 20
- [x] SPY regime — SPY $510.2 > SPY EMA200 $480.1
- [x] No near-term earnings — next: 2026-05-02 (9 trading days)

✅ All mandatory conditions met. Proceeding to score...

---

## Score Summary

| Section | Max | Score |
|---------|-----|-------|
| 1. Trend Strength | 25 | 18 |
| 2. Pullback Quality | 25 | 17 |
| 3. Support Confluence | 15 | 12 |
| 4. RSI & Momentum | 10 | 7 |
| 5. 1H Trigger Signal | 20 | 14 |
| 6. Sector & Market Context | 5 | 4 |
| **TOTAL** | **100** | **72** |

### 🟢 STRONG SETUP — Standard position size (risk 1% of account)

---

## Section 1: Trend Strength — 18/25

**EMA Alignment Quality** → All three sloping upward **+10 pts**
**Uptrend Duration** → 8 weeks HH/HL **+5 pts**
**RS vs SPY (63 days)** → RS ratio 1.18 **+4 pts**

## Section 5: 1H Trigger Signal — 14/20

**Trigger Type** → EMA 9 crossed above EMA 21 on 1H **+6 pts**
**Volume on Trigger** → 60% above 1H average **+5 pts**
**Trigger Timing** → Day 2 after pullback signal **+4 pts**
**Time of Day** → 11:30 AM EST **+3 pts**
⚠️ Descending trendline break — Manual review
⚠️ 1H RSI divergence — Manual review

...
```

---

## Files to Create / Modify

| Action | File |
|--------|------|
| Create | `server/src/services/strategy/strategyContext.ts` |
| Create | `server/src/services/rules/ruleRegistry.ts` |
| Create | `server/src/services/rules/trendRules.ts` |
| Create | `server/src/services/rules/pullbackRules.ts` |
| Create | `server/src/services/rules/triggerRules.ts` |
| Create | `server/src/services/rules/marketRules.ts` |
| Create | `server/src/services/strategy/strategyEngine.ts` |
| Create | `server/src/services/strategy/strategyService.ts` |
| Create | `specs/strategies/index.json` — strategy registry |
| Create | `specs/strategies/multi_timeframe_pullback_v1.json` — strategy definition |
| Create | `server/src/routes/strategyRoutes.ts` |
| Modify | `server/src/index.ts` — mount strategies router |

---

## Tasks

- [x] `strategyContext.ts` — define `StrategyContext`, `TimeframeData`, `IndicatorRequirements` interfaces; implement `buildStrategyContext(ticker, requires)` — reads `requires.timeframes`, fetches only declared candles, pre-computes declared indicator series; always fetches SPY/VIX/earnings/sector
- [x] `trendRules.ts` — implement 7 trend rules
- [x] `pullbackRules.ts` — implement 11 pullback/support/RSI rules (includes `swingHighPolarity`)
- [x] `triggerRules.ts` — implement 6 hourly trigger rules
- [x] `marketRules.ts` — implement 4 market/sector rules
- [x] `ruleRegistry.ts` — export unified `RULES` map
- [x] `specs/strategies/index.json` — create strategy registry with the multi_timeframe_pullback entry
- [x] `specs/strategies/multi_timeframe_pullback_v1.json` — write full strategy definition JSON
- [x] `strategyEngine.ts` — implement pure `evaluateStrategy` returning `StrategyResult`
- [x] `strategyService.ts` — implement `loadStrategy`, `listStrategies`, `runStrategy`, `toMarkdown`
- [x] `strategyRoutes.ts` — `GET /api/strategies` and `GET /api/strategies/:id/evaluate/:ticker`
- [x] `index.ts` — mount strategies router at `/api/strategies`

---

## Verification

### 1. Strategy listing endpoint
```bash
curl http://localhost:3001/api/strategies
```
Expected: JSON array containing `{ id: "multi_timeframe_pullback", name: "...", version: "1.0" }`.

### 2. Unknown strategy ID → 404
```bash
curl -i http://localhost:3001/api/strategies/nonexistent/evaluate/AAPL
```
Expected: HTTP 404 with `{ "error": "unknown strategy" }`.

### 3. Stock that fails mandatory conditions (ticker in downtrend)
```bash
curl http://localhost:3001/api/strategies/multi_timeframe_pullback/evaluate/SQQQ
```
Expected: Markdown with one or more `- [ ]` mandatory items and a `**DO NOT ENTER**` banner. No scoring sections rendered.

### 4. Full evaluation on a healthy uptrending stock
```bash
curl http://localhost:3001/api/strategies/multi_timeframe_pullback/evaluate/AAPL
```
Expected: All 7 mandatory items checked `[x]`, Score Summary table with 6 sections totalling ≤ 100, and an Entry Decision line matching the score band.

### 5. Cross-check computed values
For the ticker tested in step 4, open TradingView and verify:
- EMA 20 / EMA 50 / EMA 200 values on the daily chart match the report within ~0.5%
- ATR(14) daily value matches
- RSI(14) daily value matches

### 6. Data failure resilience
Temporarily use an invalid ticker — server should return 502, not crash.
```bash
curl -i http://localhost:3001/api/strategies/multi_timeframe_pullback/evaluate/XXXXXX
```

### 7. Adding a second strategy requires no code changes
Create `specs/strategies/test_strategy_v1.json` with `id`, `name`, `version`, `requires`, one mandatory rule, and one scoring section. Add an entry to `index.json` with `enabled: true`. Confirm it appears in `GET /api/strategies` and evaluates correctly.

### 8. Disabled strategy is hidden and returns 404
Set `enabled: false` on an entry in `index.json`. Confirm it does not appear in `GET /api/strategies` and returns 404 from the evaluate endpoint.
