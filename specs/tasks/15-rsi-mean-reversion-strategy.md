# Task 15 — RSI Mean Reversion (Range-Bound) Strategy

## Context

`specs/strategies/rsi_mean_reversion.md` describes a **counter-trend, range-bound** entry checklist whose statistical profile is the inverse of the trend-following strategies already in the library: oversold readings *revert* in ranges but *persist* in trends, so the strategy must aggressively gate out trending stocks before fading extremes inside a confirmed sideways structure.

The goal is to translate that markdown into a JSON strategy (`rsi_mean_reversion_v1.json`) that the existing engine can evaluate, exposed via the same `GET /api/strategies/:strategyId/evaluate/:ticker` endpoint and the Strategy tab. **Maximum reuse of existing rules** — a careful pass over the registry shows 7 rules can be reused as-is, one rule (`bullishReversalCandle`) gains a small backward-compatible extension to cover all four daily-bar reversal patterns, and 14 new rules cover range-detection, ADX gating, BB-position scoring, and counter-trend-specific market-stress gating.

## User-confirmed decisions

- **Indicators:** Extend the engine to compute **ADX(14)** alongside the existing EMA/ATR/RSI/BB/MACD. BB(20,2), RSI(2), and weekly EMA(50) are already supported via existing `IndicatorSpec` shape — only ADX is new.
- **200 SMA substitution:** Reuse `supportConfluence` with `emaPeriods: [50, 200]` for Section 3 confluence detection. EMA200 ≈ SMA200 for support-zone purposes; document the deviation in plan.
- **Reversal candle scope:** The existing `bullishReversalCandle` only detects bullish-engulfing + hammer. Spec needs four daily-bar patterns (engulfing-of-2+-reds, hammer, pin/doji, green-after-red). Extended via a new optional `pattern` param — default `'any'` retains exact current behavior so the v2 strategy is unaffected.
- **Range definition:** Range is the **fixed last-N-bar window** (default 60 trading days) — *not* the variable-window consolidation detected by `detectConsolidation`. A new helper `compute60dRangeStats` lives in `helpers.ts` next to the existing range/swing helpers; all range-aware rules call it.
- **RSI OR-gate:** "RSI(2) < 10 OR RSI(14) < 30" cannot be expressed via the engine's AND-only mandatory list. A single new rule `rsiOversoldEither` accepts both thresholds and passes if either is met.
- **Market-not-panic:** Spec asks for "VIX < 25 AND SPY not down 3% on the day" — distinct from `marketRegime` which also requires SPY > SPY-EMA. New rule `marketNotPanic` checks just the two panic conditions, leaving `marketRegime` untouched.
- **Anchor:** Evaluation is anchored to the most recent **daily** bar. Mean reversion is a discrete-event entry — most bars on most stocks fail the mandatory gate by design.
- **Mandatory simplification:** `weeklyTrendNotDown` and `nearRangeLow` are omitted from the v1 mandatory list — both rules are implemented in the codebase but not referenced in the JSON. `weeklyTrendNotDown` is redundant with ADX < 20 (a hard weekly downtrend produces ADX >> 20). `nearRangeLow` is implied by `lowerBbTag` + `rangeBound` together. `rangeBound.maxWidthAtr` relaxed from 5 to 7 to accommodate real-world range-bound blue-chips. Net result: **9 mandatory conditions** instead of 11.
- **Maximize reuse:** Existing rules are preferred over new ones. The single rule extension is backward-compatible.

## Scope

- **Server:** Add ADX pre-compute to `strategyContext.ts`. Add `compute60dRangeStats` helper to `helpers.ts`. Author 14 new rules across two new files (`rangeRules.ts` and `meanReversionRules.ts`). Apply one backward-compatible tweak to `bullishReversalCandle`. Reuse 7 existing rules.
- **Strategy file:** New `specs/strategies/rsi_mean_reversion_v1.json` with **9 mandatory gates**. Register in `specs/strategies/index.json` (enabled).
- **Client:** None — the Strategy tab picks up new strategies automatically via `GET /api/strategies`.

---

## Rule Reuse Map

### Reused as-is (7 rules)

| Existing rule | Used for | Params |
|---|---|---|
| `noNearEarnings` | Mandatory: no earnings within 5 trading days | `{ tradingDays: 5 }` |
| `triggerVolume` | Mandatory: today's volume above 20-day avg | `{ timeframe: "1D", avgWindow: 20, minPctAboveAvg: 0 }` |
| `triggerVolume` | Section 4 volume tiers (>2.0×, 1.5–2.0×, 1.0–1.5×) | `minPctAboveAvg` 100/50/0 with `maxPctAboveAvg` for tiering |
| `liquidityFloor` | Mandatory: 20-day avg dollar volume ≥ $5M | `{ timeframe: "1D", avgWindow: 20, minDollar: 5000000 }` |
| `rsiLevel` | Section 2 RSI(2) tiers + RSI(14) tiers | `{ timeframe: "1D", period: 2/14, min, max }` × 6 invocations |
| `rsiStructure` | Section 2 bullish RSI divergence (additive bonus) | `{ timeframe: "1D", period: 14, type: "divergence" }` |
| `supportConfluence` | Section 3 confluence count tiers | `{ timeframe: "1D", emaPeriods: [50, 200], minFactors: 1/2/3 }` × 3 |
| `manualReview` | Manual-review section (3 items) | `{ label: "..." }` × 3 |

### Modified rule (1 — backward-compatible)

**`bullishReversalCandle`** — `server/src/services/rules/triggerRules.ts`

Add an optional `pattern` parameter so the rule can score individual reversal patterns. When omitted (or `pattern === 'any'`), behavior is unchanged — current v2 strategy invocations stay correct.

```ts
type ReversalPattern = 'any' | 'engulfing_2plus' | 'hammer' | 'pin_doji' | 'green_after_red';

const pattern = (params.pattern as ReversalPattern | undefined) ?? 'any';

// Pattern detection helpers — all operate on `candles[curr]` and `candles[curr-1..]` as needed.
const isBullishEngulfing  = curr.close > curr.open && prev.close < prev.open
                          && curr.open <= prev.close && curr.close >= prev.open;
const isEngulfing2Plus    = isBullishEngulfing
                          && countConsecutiveRedBefore(candles, idx-1) >= 2
                          && curr.close >= Math.max(...lastNRedOpens);
const isHammer            = body > 0 && lowerWick >= 2 * body
                          && (curr.close - curr.low) / barRange >= 0.75;
const isPinOrDoji         = body > 0
                          && Math.abs(curr.close - curr.open) <= 0.3 * barRange
                          && lowerWick >= 0.6 * barRange;
const isGreenAfterRed     = curr.close > curr.open
                          && countConsecutiveRedBefore(candles, idx-1) >= 2;

if (pattern === 'any')              return pass = isBullishEngulfing || isHammer
                                                  || isPinOrDoji      || isGreenAfterRed;
if (pattern === 'engulfing_2plus')  return pass = isEngulfing2Plus;
if (pattern === 'hammer')           return pass = isHammer;
if (pattern === 'pin_doji')         return pass = isPinOrDoji;
if (pattern === 'green_after_red')  return pass = isGreenAfterRed && !isBullishEngulfing && !isHammer;
```

Default `'any'` adds `pin_doji` and `green_after_red` to the original `engulfing || hammer` predicate. The v2 strategy uses this rule on `1H` timeframe with no `pattern` param — broader detection there is *more* lenient, never less, so it doesn't shrink the v2 trigger set. Type check + a v2 evaluation regression test cover the no-regression claim.

### New rules (14)

#### File: `server/src/services/rules/rangeRules.ts` (7 rules)

All rules use a single shared helper `compute60dRangeStats(candles, atrSeries, lookback, tolerance)` (added to `helpers.ts`) returning `RangeStats { high, low, midpoint, widthAtr, upperTouches, lowerTouches, durationDays, weeksSinceFirstTouch } | null`. Centralizes the touch-counting and ATR-normalization logic.

| Rule | Mandatory? | Section | Purpose |
|---|---|---|---|
| `rangeBound` | ✅ | – | Anchor rule. Validates over the last 60 trading days: width ≤ `maxWidthAtr` × ATR(14) (v1: 7×) AND `upperTouches >= minTouches` AND `lowerTouches >= minTouches` (default 2 each, tolerance 2%). |
| `rangeTouchCount` | – | S1 | Detected `min(upperTouches, lowerTouches) >= minPerBound` (tiered: 3 / 2 / 1). |
| `rangeDuration` | – | S1 | `weeksSinceFirstTouch` in `[minWeeks, maxWeeks)` (tiered: ≥6 / 4–6 / 3–4). |
| `rangeWidth` | – | S1 | `widthAtr` in `[min, max)` (tiered: ≤3× / 3–5× / 5–7×). |
| `nearRangeLow` | – (implemented, not in v1 mandatory) | – | `(close - low) / ATR(14) <= maxAtrMultiple`; implied by `lowerBbTag` + `rangeBound`; scoring credit via `rangeFloorProximity`. |
| `rangeFloorProximity` | – | S3 | `(close - low) / ATR(14) <= maxAtrMultiple` (tiered: 0.25 / 0.5 / 1.0). |
| `rangeMidpointDistance` | – | S5 | `(midpoint - close) / midpoint * 100 >= minPct` (tiered: ≥10 / ≥5). |

#### File: `server/src/services/rules/meanReversionRules.ts` (7 rules)

| Rule | Mandatory? | Section | Purpose |
|---|---|---|---|
| `adxLevel` | ✅ + S1 | S1 | Daily ADX(period) `< max` and optionally `>= min` for tiering. Mandatory: `{ period: 14, max: 20 }`. Tiers: `< 15` (5pts), `15–20` (3pts). |
| `weeklyTrendNotDown` | – (implemented, not in v1 mandatory) | – | Weekly close > weekly EMA(`emaPeriod`) **OR** EMA slope flat; redundant with ADX < 20 gate — a real weekly downtrend produces ADX >> 20. |
| `rsiOversoldEither` | ✅ | – | `RSI(2) < rsi2Max` **OR** `RSI(14) < rsi14Max` on `timeframe`. Single rule encapsulating the OR — defaults `{ rsi2Max: 10, rsi14Max: 30, timeframe: "1D" }`. |
| `lowerBbTag` | ✅ | – | Today's `bar.low <= lowerBB(period, stdDev)` on `timeframe`. |
| `bbLowerPosition` | – | S5 | `quality` param: `"pierced"` (low < lowerBB AND close >= lowerBB), `"tagged"` (low <= lowerBB AND close < lowerBB), `"within_atr"` (close - lowerBB <= 0.5 × ATR(14)). |
| `consecutiveRedBars` | – | S2 | Counts red bars (close < open) immediately before the current bar. Tiered with `min` / optional `max` (4+ / 2–3 / 1). |
| `marketNotPanic` | ✅ | – | VIX `< maxVix` AND SPY 1-day return `>= minSpyDailyChangePct` (negative threshold). Defaults `{ maxVix: 25, minSpyDailyChangePct: -3 }`. |

**Net new-rule count: 14.** No new rule is required for sector tiers, RSI divergence, or confluence detection — those map cleanly to `sectorStrength` / `rsiStructure` / `supportConfluence`.

### Trade-offs accepted to maximize reuse

- **200 SMA → 200 EMA in confluence:** Spec lists "200 SMA" as one of the confluence factors. Reusing `supportConfluence` with `emaPeriods: [50, 200]` substitutes EMA200, which is functionally equivalent for support-zone detection (deviation ≈ a few cents on most names). Avoids adding SMA pre-compute or a new confluence variant.
- **Fibonacci 78.6% in spec → 23.6–61.8% zone in `supportConfluence`:** The current rule's hardcoded fib zone misses the 78.6% retracement the spec calls out. Acceptable: with 5 candidate factors (EMA50, EMA200, fib zone, swing-high polarity, round number) plus the literal range-floor proximity (covered by `rangeFloorProximity`), 2- and 3-factor confluence at the range low remains detectable. If false negatives appear in v1, extend `supportConfluence` with a `fibRange` param in v2.
- **Sector-in-clear-breakdown stays manual-review:** Spec lists "Sector in clear breakdown" as one of the manual-review warnings; the engine exposes `sectorStrength` (rank-based) but not "in clear breakdown" semantics. Manual review is the right home — keep as `manualReview` warning.

---

## Engine Extensions

### 1. ADX pre-compute

**File:** `server/src/services/strategy/strategyContext.ts`

Extend `IndicatorSpec` and `TimeframeData`:

```ts
import { ADX } from 'technicalindicators';

export interface IndicatorSpec {
  ema?:  number[];
  atr?:  number[];
  rsi?:  number[];
  adx?:  number[];   // NEW — ADX periods (typically [14])
  bb?:   { period: number; stdDev: number }[];
  macd?: { fast: number; slow: number; signal: number }[];
}

export interface TimeframeData {
  candles: OhlcvRow[];
  ema:  Record<number, number[]>;
  atr:  Record<number, number[]>;
  rsi:  Record<number, number[]>;
  adx:  Record<number, number[]>;   // NEW
  bb:   BollingerBandsSeries[];
  macd: MacdSeries[];
}
```

In `buildTimeframeData()`, add next to RSI:

```ts
const adx: Record<number, number[]> = {};
for (const p of reqs.adx ?? []) {
  if (closes.length > p * 2) {
    const out = ADX.calculate({ period: p, high: highs, low: lows, close: closes });
    adx[p] = out.map(a => a.adx ?? NaN);
  }
}
```

Initialize `adx: {}` on the empty-data fallback path. NaN guard handled by the existing candle filter.

### 2. `compute60dRangeStats` helper

**File:** `server/src/services/rules/helpers.ts`

```ts
export interface RangeStats {
  high:                 number;
  low:                  number;
  midpoint:             number;
  widthAtr:             number;
  upperTouches:         number;   // bars whose high is within tolerance of `high`
  lowerTouches:         number;   // bars whose low is within tolerance of `low`
  durationDays:         number;   // == lookback
  weeksSinceFirstTouch: number;   // earliest qualifying touch on either bound, in weeks (÷5)
}

export function compute60dRangeStats(
  candles: OhlcvRow[],
  atrLast: number | undefined,
  lookback = 60,
  tolerance = 0.02,
): RangeStats | null {
  if (candles.length < lookback || atrLast == null || atrLast <= 0) return null;
  const slice = candles.slice(-lookback);
  const high  = Math.max(...slice.map(c => c.high));
  const low   = Math.min(...slice.map(c => c.low));
  if (high <= 0) return null;

  const upperBand = high * (1 - tolerance);
  const lowerBand = low  * (1 + tolerance);
  let upperTouches = 0, lowerTouches = 0, firstTouchIdx = -1;
  slice.forEach((c, i) => {
    const upperHit = c.high >= upperBand;
    const lowerHit = c.low  <= lowerBand;
    if (upperHit) upperTouches++;
    if (lowerHit) lowerTouches++;
    if ((upperHit || lowerHit) && firstTouchIdx === -1) firstTouchIdx = i;
  });

  const barsSinceFirst   = firstTouchIdx >= 0 ? lookback - firstTouchIdx : 0;
  const weeksSinceFirstTouch = barsSinceFirst / 5;

  return {
    high, low, midpoint: (high + low) / 2,
    widthAtr: (high - low) / atrLast,
    upperTouches, lowerTouches,
    durationDays: lookback,
    weeksSinceFirstTouch,
  };
}
```

Range-aware rules each call this once via a thin wrapper similar to `getConsolidation` in `breakoutRules.ts`.

---

## JSON Strategy File

Path: `specs/strategies/rsi_mean_reversion_v1.json`

```json
{
  "id": "rsi_mean_reversion",
  "name": "RSI Mean Reversion (Range-Bound)",
  "version": "1.0",
  "totalMaxPoints": 100,

  "requires": {
    "timeframes": {
      "1D": {
        "ema":  [50, 200],
        "atr":  [14],
        "rsi":  [2, 14],
        "adx":  [14],
        "bb":   [{ "period": 20, "stdDev": 2 }]
      },
      "1W": { "ema": [50] }
    },
    "spy": { "ema": [50] }
  },

  "mandatory": [
    { "rule": "adxLevel",             "params": { "timeframe": "1D", "period": 14, "max": 20 },                                                               "label": "Range-bound regime — ADX(14) < 20" },
    { "rule": "rangeBound",           "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "maxWidthAtr": 7, "minTouches": 2, "tolerance": 0.02 }, "label": "Defined 60-day horizontal range (≤7×ATR width, ≥2 touches each bound)" },
    { "rule": "rsiOversoldEither",    "params": { "timeframe": "1D", "rsi2Max": 10, "rsi14Max": 30 },                                                         "label": "Oversold trigger — RSI(2) < 10 OR RSI(14) < 30" },
    { "rule": "lowerBbTag",           "params": { "timeframe": "1D", "period": 20, "stdDev": 2 },                                                             "label": "Lower BB tagged or pierced today" },
    { "rule": "bullishReversalCandle","params": { "timeframe": "1D", "pattern": "any" },                                                                      "label": "Bullish reversal candle (engulfing / hammer / pin / green-after-red)" },
    { "rule": "triggerVolume",        "params": { "timeframe": "1D", "avgWindow": 20, "minPctAboveAvg": 0 },                                                  "label": "Reversal volume above 20-day average" },
    { "rule": "liquidityFloor",       "params": { "timeframe": "1D", "avgWindow": 20, "minDollar": 5000000 },                                                 "label": "20-day avg dollar volume ≥ $5M" },
    { "rule": "noNearEarnings",       "params": { "tradingDays": 5 },                                                                                         "label": "No earnings within 5 trading days" },
    { "rule": "marketNotPanic",       "params": { "maxVix": 25, "minSpyDailyChangePct": -3 },                                                                 "label": "Market not in panic — VIX < 25 AND SPY not down 3%+" }
  ],

  "sections": [
    {
      "name": "Range Quality", "maxPoints": 30,
      "groups": [
        { "label": "Range Definition (touches at each bound)", "pick": "tiered", "conditions": [
          { "rule": "rangeTouchCount", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "tolerance": 0.02, "minPerBound": 3 }, "points": 12, "label": "3+ touches at each bound (crisp)" },
          { "rule": "rangeTouchCount", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "tolerance": 0.02, "minPerBound": 2 }, "points": 8,  "label": "2 touches at each bound (acceptable)" },
          { "rule": "rangeTouchCount", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "tolerance": 0.02, "minPerBound": 1 }, "points": 4,  "label": "Loosely defined (mixed touches)" }
        ]},
        { "label": "Range Duration", "pick": "tiered", "conditions": [
          { "rule": "rangeDuration", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "tolerance": 0.02, "minWeeks": 6 },              "points": 8, "label": "6+ weeks (mature)" },
          { "rule": "rangeDuration", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "tolerance": 0.02, "minWeeks": 4, "maxWeeks": 6 },"points": 5, "label": "4–6 weeks (developed)" },
          { "rule": "rangeDuration", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "tolerance": 0.02, "minWeeks": 3, "maxWeeks": 4 },"points": 3, "label": "3–4 weeks (young)" }
        ]},
        { "label": "ADX Reading", "pick": "tiered", "conditions": [
          { "rule": "adxLevel", "params": { "timeframe": "1D", "period": 14, "max": 15 },              "points": 5, "label": "ADX < 15 (strong range regime)" },
          { "rule": "adxLevel", "params": { "timeframe": "1D", "period": 14, "min": 15, "max": 20 },   "points": 3, "label": "ADX 15–20 (acceptable)" }
        ]},
        { "label": "Range Width (ATR-normalized)", "pick": "tiered", "conditions": [
          { "rule": "rangeWidth", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "max": 3 },              "points": 5, "label": "≤3× ATR (narrow)" },
          { "rule": "rangeWidth", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "min": 3, "max": 5 },   "points": 3, "label": "3–5× ATR (moderate)" },
          { "rule": "rangeWidth", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "min": 5, "max": 7 },   "points": 1, "label": "5–7× ATR (wide but contained)" }
        ]}
      ]
    },
    {
      "name": "Oversold Quality", "maxPoints": 25,
      "groups": [
        { "label": "RSI(2) Reading", "pick": "tiered", "conditions": [
          { "rule": "rsiLevel", "params": { "timeframe": "1D", "period": 2, "min": 0,  "max": 5  }, "points": 10, "label": "RSI(2) < 5 (extreme)" },
          { "rule": "rsiLevel", "params": { "timeframe": "1D", "period": 2, "min": 5,  "max": 10 }, "points": 6,  "label": "RSI(2) 5–10 (deep)" },
          { "rule": "rsiLevel", "params": { "timeframe": "1D", "period": 2, "min": 10, "max": 15 }, "points": 3,  "label": "RSI(2) 10–15 (moderate)" }
        ]},
        { "label": "RSI(14) Reading", "pick": "tiered", "conditions": [
          { "rule": "rsiLevel", "params": { "timeframe": "1D", "period": 14, "min": 0,  "max": 25 }, "points": 7, "label": "RSI(14) < 25 (extreme)" },
          { "rule": "rsiLevel", "params": { "timeframe": "1D", "period": 14, "min": 25, "max": 30 }, "points": 4, "label": "RSI(14) 25–30 (deep)" },
          { "rule": "rsiLevel", "params": { "timeframe": "1D", "period": 14, "min": 30, "max": 35 }, "points": 1, "label": "RSI(14) 30–35 (mild)" }
        ]},
        { "label": "Consecutive Red Days", "pick": "tiered", "conditions": [
          { "rule": "consecutiveRedBars", "params": { "timeframe": "1D", "min": 4 },              "points": 5, "label": "4+ consecutive red bars (capitulation)" },
          { "rule": "consecutiveRedBars", "params": { "timeframe": "1D", "min": 2, "max": 3 },    "points": 3, "label": "2–3 consecutive red bars" },
          { "rule": "consecutiveRedBars", "params": { "timeframe": "1D", "min": 1, "max": 1 },    "points": 1, "label": "1 red bar" }
        ]},
        { "label": "Bullish RSI Divergence (bonus)", "pick": "additive", "conditions": [
          { "rule": "rsiStructure", "params": { "timeframe": "1D", "period": 14, "type": "divergence" }, "points": 3, "label": "Price LL while RSI(14) HL" }
        ]}
      ]
    },
    {
      "name": "Support Confluence", "maxPoints": 20,
      "groups": [
        { "label": "Confluence Count at Bounce Level", "pick": "tiered", "conditions": [
          { "rule": "supportConfluence", "params": { "timeframe": "1D", "emaPeriods": [50, 200], "atrPeriod": 14, "lookback": 60, "minFactors": 3 }, "points": 12, "label": "3+ factors confluent" },
          { "rule": "supportConfluence", "params": { "timeframe": "1D", "emaPeriods": [50, 200], "atrPeriod": 14, "lookback": 60, "minFactors": 2 }, "points": 8,  "label": "2 factors confluent" },
          { "rule": "supportConfluence", "params": { "timeframe": "1D", "emaPeriods": [50, 200], "atrPeriod": 14, "lookback": 60, "minFactors": 1 }, "points": 4,  "label": "Range floor only (≥1 factor)" }
        ]},
        { "label": "Distance from Range Floor", "pick": "tiered", "conditions": [
          { "rule": "rangeFloorProximity", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "maxAtrMultiple": 0.25 }, "points": 8, "label": "Within 0.25× ATR" },
          { "rule": "rangeFloorProximity", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "maxAtrMultiple": 0.5  }, "points": 5, "label": "Within 0.5× ATR" },
          { "rule": "rangeFloorProximity", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "maxAtrMultiple": 1.0  }, "points": 2, "label": "Within 1× ATR" }
        ]}
      ]
    },
    {
      "name": "Reversal Candle Quality", "maxPoints": 15,
      "groups": [
        { "label": "Candle Type", "pick": "tiered", "conditions": [
          { "rule": "bullishReversalCandle", "params": { "timeframe": "1D", "pattern": "engulfing_2plus" }, "points": 10, "label": "Bullish engulfing of prior 2+ red candles" },
          { "rule": "bullishReversalCandle", "params": { "timeframe": "1D", "pattern": "hammer"          }, "points": 8,  "label": "Hammer (lower wick > 2× body)" },
          { "rule": "bullishReversalCandle", "params": { "timeframe": "1D", "pattern": "pin_doji"        }, "points": 5,  "label": "Pin bar / doji at support" },
          { "rule": "bullishReversalCandle", "params": { "timeframe": "1D", "pattern": "green_after_red" }, "points": 3,  "label": "Simple green close after red sequence" }
        ]},
        { "label": "Volume on Reversal Bar", "pick": "tiered", "conditions": [
          { "rule": "triggerVolume", "params": { "timeframe": "1D", "avgWindow": 20, "minPctAboveAvg": 100 },                       "points": 5, "label": ">2.0× avg" },
          { "rule": "triggerVolume", "params": { "timeframe": "1D", "avgWindow": 20, "minPctAboveAvg": 50, "maxPctAboveAvg": 100 }, "points": 4, "label": "1.5–2.0× avg" },
          { "rule": "triggerVolume", "params": { "timeframe": "1D", "avgWindow": 20, "minPctAboveAvg": 0,  "maxPctAboveAvg": 50  }, "points": 3, "label": "1.0–1.5× avg" }
        ]}
      ]
    },
    {
      "name": "BB Position & Mean Distance", "maxPoints": 10,
      "groups": [
        { "label": "BB Position", "pick": "tiered", "conditions": [
          { "rule": "bbLowerPosition", "params": { "timeframe": "1D", "period": 20, "stdDev": 2, "atrPeriod": 14, "quality": "pierced"    }, "points": 6, "label": "Pierced and closed back inside" },
          { "rule": "bbLowerPosition", "params": { "timeframe": "1D", "period": 20, "stdDev": 2, "atrPeriod": 14, "quality": "tagged"     }, "points": 4, "label": "Tagged exactly" },
          { "rule": "bbLowerPosition", "params": { "timeframe": "1D", "period": 20, "stdDev": 2, "atrPeriod": 14, "quality": "within_atr" }, "points": 2, "label": "Within 0.5× ATR of lower BB" }
        ]},
        { "label": "Distance from 60-Day Midpoint", "pick": "tiered", "conditions": [
          { "rule": "rangeMidpointDistance", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "minPct": 10 },              "points": 4, "label": "≥10% below midpoint" },
          { "rule": "rangeMidpointDistance", "params": { "timeframe": "1D", "lookback": 60, "atrPeriod": 14, "minPct": 5, "maxPct": 10 }, "points": 2, "label": "5–10% below midpoint" }
        ]}
      ]
    },
    {
      "name": "Manual Review", "maxPoints": 0,
      "groups": [
        { "label": "Discretionary checks", "pick": "additive", "conditions": [
          { "rule": "manualReview", "params": { "label": "Major news event (earnings/guidance/downgrade/FDA/lawsuit)" }, "points": 0, "label": "News-event check" },
          { "rule": "manualReview", "params": { "label": "Range breakdown in progress (close below prior 60d low)" },     "points": 0, "label": "Range-breakdown check" },
          { "rule": "manualReview", "params": { "label": "Sector in clear breakdown (sector-wide weakness)" },             "points": 0, "label": "Sector-breakdown check" }
        ]}
      ]
    }
  ]
}
```

Sections sum: 30 + 25 + 20 + 15 + 10 + 0 = **100** ✓ (validator pass).

The decision banner thresholds in `strategyService.ts:scoreDecision` (≥80/70/60/50) align reasonably with this spec's 80/70/60 ladder; counter-trend position-sizing language differs but the engine's rendered banner is informational, not enforced. Document the size-cap nuance in a `note` field on the strategy if needed in v2.

---

## Registry Update

`specs/strategies/index.json` — append:

```json
{
  "id":      "rsi_mean_reversion",
  "name":    "RSI Mean Reversion (Range-Bound)",
  "version": "1.0",
  "file":    "rsi_mean_reversion_v1.json",
  "enabled": true
}
```

---

## Implementation Order

1. **Engine extension** — add `adx?: number[]` to `IndicatorSpec`; add `adx: Record<number, number[]>` to `TimeframeData`; compute ADX in `buildTimeframeData()`. Initialize `adx: {}` on the empty fallback path. Type check.
2. **Helper** — add `compute60dRangeStats` and `RangeStats` interface to `helpers.ts`.
3. **Modify `bullishReversalCandle`** — add optional `pattern` param + four pattern detectors. Re-evaluate v2 strategy on a known passing ticker; confirm trigger result unchanged.
4. **Author `rangeRules.ts`** with the 7 range-aware rules; register each in `ruleRegistry.ts`.
5. **Author `meanReversionRules.ts`** with the 7 oscillator/regime rules; register each.
6. **Author `rsi_mean_reversion_v1.json`** per the skeleton above.
7. **Register** in `index.json`.
8. **Verify** end-to-end (see below).

Each rule should be small, parameterized, and pure — the existing `breakoutRules.ts` is a good model. Centralize range-stats computation in the helper to keep rules thin.

---

## Critical Files

- `server/src/services/strategy/strategyContext.ts` — add ADX pre-compute.
- `server/src/services/rules/helpers.ts` — add `compute60dRangeStats` + `RangeStats`.
- `server/src/services/rules/triggerRules.ts` — extend `bullishReversalCandle` with `pattern` param.
- `server/src/services/rules/rangeRules.ts` (new) — 7 range rules.
- `server/src/services/rules/meanReversionRules.ts` (new) — 7 oscillator/regime rules.
- `server/src/services/rules/ruleRegistry.ts` — register all 14 new rules.
- `specs/strategies/rsi_mean_reversion_v1.json` (new).
- `specs/strategies/index.json` — append new entry.

## Patterns Reused

- Indicator pre-compute layer: `strategyContext.ts:124` (`buildTimeframeData`).
- Anchor-rule pattern: `breakoutRules.ts` `consolidationDetected` + `getConsolidation` wrapper — replicate as `rangeBound` + `getRangeStats`.
- Tiered scoring with reused rule + different params: pattern from `multi_timeframe_pullback_v2.json` and `breakout_from_consolidation_v1.json`.
- `manualReview` warnings rendered by `strategyService.ts:renderSection`.
- Strategy JSON shape: `specs/strategies/breakout_from_consolidation_v1.json`.
- Param-typing: use `paramNum` / `paramStr` / `paramNumOpt` / `paramArr` from `helpers.ts` instead of `as TYPE` casts.

## Out of Scope

- No new client-side UI — Strategy tab picks the strategy up automatically.
- No SMA pre-compute — EMA200 substitutes for SMA200 in confluence detection.
- No fib-zone customization in `supportConfluence` — current 23.6–61.8% zone is reused; 78.6% retracement detection deferred.
- No backtest harness — single-ticker on-demand evaluation only.
- No automated detection of "major news event" / "range breakdown" / "sector breakdown" — discretionary `manualReview` warnings.
- No exit/management rules — execution rules in spec (entry/stop/targets/failure/kill-switch/time-stop) are documentation for the trader, not the entry-scanning engine.

## Verification

1. Type check: `cd server && npx tsc --noEmit`.
2. List strategies: `curl http://localhost:3001/api/strategies` — confirm `rsi_mean_reversion v1.0` appears alongside the existing two.
3. Evaluate a ticker known to be in a range with recent oversold trigger: `curl http://localhost:3001/api/strategies/rsi_mean_reversion/evaluate/<TICKER>` — markdown report renders 9 mandatory checks, score table sums to 100, decision banner present.
4. Evaluate a ticker in a clear uptrend (e.g., NVDA on a strong day) — confirm "Range-bound regime — ADX(14) < 20" mandatory gate fails cleanly without crash.
5. Evaluate a ticker with no recent oversold reading — confirm `rsiOversoldEither` mandatory fails cleanly.
6. **Regression check on v2 pullback:** `curl http://localhost:3001/api/strategies/multi_timeframe_pullback/evaluate/AAPL` — the `bullishReversalCandle` extension must not change v2's mandatory or scoring output. Compare before/after on the same ticker.
7. **Regression check on v1 breakout:** `curl http://localhost:3001/api/strategies/breakout_from_consolidation/evaluate/<TICKER>` — confirm no change after ADX/range additions.
8. UI: open `/stock/<TICKER>` → Strategy tab → dropdown now shows three strategies → evaluate each.
9. Edge case: invalid ticker `XXXXXX` — confirm graceful failure (rule errors surfaced as warnings, no 502).
10. Edge case: ticker with < 60 days of history — confirm `rangeBound` returns `pass: false` with a clear "Insufficient data" detail rather than throwing.
