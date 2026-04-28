# Task 14 — Breakout from Consolidation Strategy

## Context

`specs/strategies/breakout_from_consolidation.md` describes a discrete breakout system: scan for stocks emerging from a 10–40-day tight base on confirmed volume. The spec has been sharpened to remove vague tiers (concrete thresholds in Sections 3 and 6), promote three of the original five disqualifiers to mandatory gates, and quantify the prior-trend mandatory gate. BB(20,2) and MACD are required indicators per user direction.

The goal is to translate that markdown into a JSON strategy (`breakout_from_consolidation_v1.json`) that the existing engine can evaluate, exposed via the same `GET /api/strategies/:strategyId/evaluate/:ticker` endpoint and the Strategy tab built in task 13. **Maximum reuse of existing rules** — a careful pass over the registry shows 8 rules can be reused as-is and one (`triggerVolume`) gains a small backward-compatible tweak to cover all volume tiers.

## User-confirmed decisions

- **Indicators:** Extend the engine to compute Bollinger Bands and MACD alongside the existing EMA/ATR/RSI.
- **SMA gate:** Reuse `spyAboveEma { period: 50 }` for the "SPY above 50-day SMA" mandatory gate. SMA and EMA at 50 periods on SPY are functionally equivalent for trend filtering. Document the deviation in the JSON `note`.
- **Disqualifiers:** Three were promoted to mandatory in the spec (extension < 5%, consolidation volume sane, VIX < 30). Three discretionary items remain as manual-review warnings (major resistance, news spike, erratic breakout volume) — implemented as a final scoring section using the existing `manualReview` rule.
- **Anchor:** Evaluation is anchored to the most recent bar. The "Breakout confirmed" mandatory gate fails on any bar that doesn't close above the consolidation high — by design, this strategy returns no signal on most bars.
- **Maximize reuse:** Existing rules are preferred over new ones. Modifications to existing rules are acceptable when backward-compatible.

## Scope

- **Server:** Add BB and MACD pre-compute to `strategyContext.ts`. Author ~12 new rules in a new `breakoutRules.ts`. Apply one backward-compatible tweak to `triggerVolume`. Reuse 8 existing rules.
- **Strategy file:** New `specs/strategies/breakout_from_consolidation_v1.json`. Register in `specs/strategies/index.json` (enabled).
- **Client:** None — the Strategy tab from task 13 picks up new strategies automatically via `GET /api/strategies`.

---

## Rule Reuse Map

### Reused as-is (8 rules)

| Existing rule | Used for | Params |
|---|---|---|
| `noNearEarnings` | Mandatory: no earnings within 5 trading days | `{ tradingDays: 5 }` |
| `spyAboveEma` | Mandatory: SPY above 50-day (substituting EMA for SMA) | `{ period: 50 }` |
| `marketRegime` | Mandatory: VIX < 30 (SPY check is redundant with the dedicated SPY gate but harmless) | `{ spyEmaPeriod: 50, maxVix: 30 }` |
| `marketRegime` | Section 6 VIX tiers — invoked twice with different `maxVix` thresholds | `{ spyEmaPeriod: 50, maxVix: 18 }` (5pts) and `{ maxVix: 22 }` (3pts) |
| `triggerVolume` | Mandatory: breakout volume ≥ 1.5× 20-day avg (works on any timeframe, including `"1D"`) | `{ timeframe: "1D", avgWindow: 20, minPctAboveAvg: 50 }` |
| `triggerVolume` | Section 2 volume tiers — once `maxPctAboveAvg` is added (see Modified rules) | three tiered invocations |
| `rsVsSpy` | Section 4 RS vs SPY tiers (calibrated ratio thresholds in lieu of % delta — ratio 1.05 ≈ +5% delta) | `{ timeframe: "1D", lookback: 60, minRatio, maxRatio }` × 4 tiers |
| `rsiLevel` | Section 5 — RSI(14) > 60 on breakout | `{ timeframe: "1D", period: 14, min: 60, max: 100 }` |
| `sectorStrength` | Section 6 sector tiers — rank-based proxy ("breaking out" ≈ top 3 of 11 sectors, "mild" ≈ top 7) | `{ topN: 3 }` (5pts) and `{ topN: 7 }` (3pts) |
| `manualReview` | Final manual-review section (3 items) | `{ label: "..." }` × 3 |

### Modified rules (1 — backward-compatible)

**`triggerVolume`** — `server/src/services/rules/triggerRules.ts`

Add an optional `maxPctAboveAvg` parameter so the rule can express tiered ranges (e.g., 50–100% above avg = the 1.5–2.0× tier). When omitted, behavior is unchanged.

```ts
const minPctAboveAvg = paramNum(params, 'minPctAboveAvg');
const maxPctAboveAvg = paramNumOpt(params, 'maxPctAboveAvg');
// ...
const pass = pctAbove >= minPctAboveAvg && (maxPctAboveAvg == null || pctAbove < maxPctAboveAvg);
```

This is a 2-line diff and existing v2 strategy invocations of `triggerVolume` are unaffected.

### New rules (12) — `server/src/services/rules/breakoutRules.ts`

Most consolidation-anchored rules call a single shared helper `detectConsolidation(candles, minDays, maxDays, maxWidthPct)` from `helpers.ts` that returns `{ startIdx, endIdx, high, low, widthPct } | null`. This keeps each rule thin and the detection logic centralized.

| Rule | Mandatory? | Section | Purpose |
|---|---|---|---|
| `consolidationDetected` | ✅ | – | Anchor rule. Detects a sideways window of 10–40 bars whose width is in `[minWidthPct, maxWidthPct]` (currently 2–10%). Enforces both bounds in one place; `consolidationWidth` is **scoring-only** and never appears in mandatory. All other consolidation-aware rules call the same helper internally. |
| `consolidationWidth` | – | S1 | Detected width in `[min, max]` (tiered: 2–5 / 5–7 / 7–12). Scoring-only — the mandatory width gate lives inside `consolidationDetected`. |
| `consolidationDuration` | – | S1 | Detected window length in `[minDays, maxDays]` (tiered: 25–40 / 15–24 / 10–14). |
| `bbSqueeze` | – | S1 | Latest BB(20,2) width percentile vs 90 days. Scoring-only (the breakout bar itself widens BB, making a mandatory squeeze gate nearly always fail). Tiers at 0/10/25. Needs the new BB indicator. |
| `priorTrendBeforeBase` | ✅ + S3 | S3 | % gain over the 60 trading days before the consolidation start ≥ minGainPct. Mandatory: ≥ −5% (not in sustained downtrend). Section 3 tiers: ≥15%/4w, 8–15%/2–4w, <8%. |
| `breakoutConfirmed` | ✅ | – | Latest close > consolidation high (helper-fed). |
| `breakoutNotExtended` | ✅ | – | Latest close ≤ consolidation high × (1 + maxExtensionPct). |
| `consolidationVolumeSane` | ✅ | – | No bar in the detected window had volume > maxRatio × 20-day avg. |
| `liquidityFloor` | ✅ | – | 20-day avg dollar volume ≥ minDollar (default $20M). |
| `breakoutCloseStrength` | – | S2 | `(close − low) / (high − low) ≥ threshold` (tiered: ≥0.9, ≥0.75, ≥0.5). |
| `breakoutCandleSize` | – | S2 | `(high − low) / ATR(14)` in `[min, max]` (tiered: >1.5×, 0.8–1.5×, <0.8×). |
| `largerStructurePosition` | – | S3 | Single rule with `quality` param: `"new_high"` (52-week high or 6+ month base, 7pts), `"intermediate_base"` (8–12 week base, 4pts), `"below_resistance"` (below 6-month high, 1pt). |
| `macdBullishCrossAboveZero` | – | S5 | MACD line crossed above signal line within `lookbackBars` while both > 0. Needs the new MACD indicator. |

**Net new-rule count: 12** (down from ~17 in the first draft). No new rule is required for sector tiers (rank proxy via `sectorStrength`) or VIX tiers (level thresholds via `marketRegime`).

### Trade-off accepted to maximize reuse

The spec says the top VIX tier is "VIX < 18 **AND falling**". The "falling" qualifier needs historical VIX, which the context doesn't expose today (`ctx.vix` is a single live price). To avoid extending the context for one tier modifier, we drop "falling" from the top VIX tier — it becomes "VIX < 18" only. This loses a marginal discriminator at the top tier but eliminates the need for VIX history pre-compute and any further `marketRegime` modification. Update the spec markdown if proceeding.

The same trade-off applies to the sector tier semantics: spec wants "above 50-EMA" (absolute), reuse uses "top-N by 30-day return" (relative). Both filter for "uptrending sectors" and produce strongly correlated outputs in practice. Strict 50-EMA semantics would require fetching sector ETF candles in the context — not worth the engine churn for one scoring tier.

---

## Engine Extensions

### 1. Bollinger Bands and MACD pre-compute

**File:** `server/src/services/strategy/strategyContext.ts`

Extend `IndicatorSpec` and `TimeframeData`:

```ts
export interface IndicatorSpec {
  ema?:  number[];
  atr?:  number[];
  rsi?:  number[];
  bb?:   { period: number; stdDev: number }[];
  macd?: { fast: number; slow: number; signal: number }[];
}

export interface TimeframeData {
  candles: OhlcvRow[];
  ema:  Record<number, number[]>;
  atr:  Record<number, number[]>;
  rsi:  Record<number, number[]>;
  bb:   { period: number; stdDev: number; upper: number[]; middle: number[]; lower: number[] }[];
  macd: { fast: number; slow: number; signal: number; macd: number[]; signalLine: number[]; histogram: number[] }[];
}
```

`technicalindicators` exposes `BollingerBands` and `MACD` — drop them into `buildTimeframeData()` next to the existing EMA/ATR/RSI loops. NaN guard already handled by the existing candle filter.

### 2. No sector-ETF-candles extension needed

Earlier draft proposed caching sector ETF candles to support an "above 50-EMA" sector classifier. Replaced by reusing the existing `sectorStrength` rank proxy. Drop this work item.

### 3. No VIX history extension needed

Earlier draft proposed adding VIX history to support "VIX falling". Replaced by dropping the "falling" qualifier from the top VIX tier (level-only). Drop this work item.

---

## JSON Strategy File

Path: `specs/strategies/breakout_from_consolidation_v1.json`

```json
{
  "id": "breakout_from_consolidation",
  "name": "Breakout from Consolidation",
  "version": "1.0",
  "totalMaxPoints": 100,

  "requires": {
    "timeframes": {
      "1D": {
        "ema":  [20, 50],
        "atr":  [14],
        "rsi":  [14],
        "bb":   [{ "period": 20, "stdDev": 2 }],
        "macd": [{ "fast": 12, "slow": 26, "signal": 9 }]
      }
    },
    "spy": { "ema": [50] }
  },

  "mandatory": [
    { "rule": "consolidationDetected",   "params": { "timeframe": "1D", "minDays": 10, "maxDays": 40, "minWidthPct": 2, "maxWidthPct": 10 }, "label": "Consolidation detected (10–40 days, width 2–10%)" },
    { "rule": "priorTrendBeforeBase",    "params": { "timeframe": "1D", "lookbackDays": 60, "minGainPct": -5 },             "label": "Not in a sustained downtrend (≥−5% over 60 days before base)" },
    { "rule": "breakoutConfirmed",       "params": { "timeframe": "1D" },                                                   "label": "Close above consolidation high" },
    { "rule": "breakoutNotExtended",     "params": { "timeframe": "1D", "maxExtensionPct": 5 },                             "label": "Close within 5% of breakout level" },
    { "rule": "triggerVolume",           "params": { "timeframe": "1D", "avgWindow": 20, "minPctAboveAvg": 30 },            "label": "Breakout volume ≥1.3× 20-day average" },
    { "rule": "consolidationVolumeSane", "params": { "timeframe": "1D", "avgWindow": 20, "maxRatio": 3.0 },                 "label": "No volume spike >3× avg during consolidation" },
    { "rule": "spyAboveEma",             "params": { "period": 50 },                                                        "label": "SPY above 50-EMA (proxy for 50-SMA)" },
    { "rule": "marketRegime",            "params": { "spyEmaPeriod": 50, "maxVix": 30 },                                    "label": "VIX < 30 (broad market not under pressure)" },
    { "rule": "noNearEarnings",          "params": { "tradingDays": 5 },                                                    "label": "No earnings within 5 trading days" },
    { "rule": "liquidityFloor",          "params": { "timeframe": "1D", "avgWindow": 20, "minDollar": 5000000 },            "label": "20-day avg dollar volume ≥ $5M" }
  ],

  "sections": [
    {
      "name": "Consolidation Quality", "maxPoints": 25,
      "groups": [
        { "label": "Range Width",         "pick": "tiered", "conditions": [
          { "rule": "consolidationWidth", "params": { "timeframe": "1D", "min": 3,   "max": 5 },  "points": 12, "label": "3–5%" },
          { "rule": "consolidationWidth", "params": { "timeframe": "1D", "min": 5,   "max": 7 },  "points": 8,  "label": ">5–7%" },
          { "rule": "consolidationWidth", "params": { "timeframe": "1D", "min": 7,   "max": 10 }, "points": 4,  "label": ">7–10%" }
        ]},
        { "label": "Duration",            "pick": "tiered", "conditions": [
          { "rule": "consolidationDuration", "params": { "timeframe": "1D", "minDays": 25, "maxDays": 40 }, "points": 8, "label": "25–40 days" },
          { "rule": "consolidationDuration", "params": { "timeframe": "1D", "minDays": 15, "maxDays": 24 }, "points": 5, "label": "15–24 days" },
          { "rule": "consolidationDuration", "params": { "timeframe": "1D", "minDays": 10, "maxDays": 14 }, "points": 3, "label": "10–14 days" }
        ]},
        { "label": "BB Squeeze Strength", "pick": "tiered", "conditions": [
          { "rule": "bbSqueeze", "params": { "timeframe": "1D", "lookback": 90, "maxPercentile": 0  }, "points": 5, "label": "At 90-day low" },
          { "rule": "bbSqueeze", "params": { "timeframe": "1D", "lookback": 90, "maxPercentile": 10 }, "points": 3, "label": "Lowest 10%" },
          { "rule": "bbSqueeze", "params": { "timeframe": "1D", "lookback": 90, "maxPercentile": 25 }, "points": 1, "label": "Lowest 25%" }
        ]}
      ]
    },
    {
      "name": "Breakout Quality", "maxPoints": 30,
      "groups": [
        { "label": "Volume",         "pick": "tiered", "conditions": [
          { "rule": "triggerVolume", "params": { "timeframe": "1D", "avgWindow": 20, "minPctAboveAvg": 150 },                       "points": 15, "label": ">2.5× avg" },
          { "rule": "triggerVolume", "params": { "timeframe": "1D", "avgWindow": 20, "minPctAboveAvg": 100, "maxPctAboveAvg": 150 }, "points": 12, "label": "2.0–2.5× avg" },
          { "rule": "triggerVolume", "params": { "timeframe": "1D", "avgWindow": 20, "minPctAboveAvg": 50,  "maxPctAboveAvg": 100 }, "points": 8,  "label": "1.5–2.0× avg" }
        ]},
        { "label": "Close Strength", "pick": "tiered", "conditions": [
          { "rule": "breakoutCloseStrength", "params": { "timeframe": "1D", "minRangePct": 0.9  }, "points": 10, "label": "Top 10% of range" },
          { "rule": "breakoutCloseStrength", "params": { "timeframe": "1D", "minRangePct": 0.75 }, "points": 6,  "label": "Top 25% of range" },
          { "rule": "breakoutCloseStrength", "params": { "timeframe": "1D", "minRangePct": 0.5  }, "points": 3,  "label": "Top 50% of range" }
        ]},
        { "label": "Candle Size",    "pick": "tiered", "conditions": [
          { "rule": "breakoutCandleSize", "params": { "timeframe": "1D", "atrPeriod": 14, "min": 1.5 },              "points": 5, "label": ">1.5× ATR" },
          { "rule": "breakoutCandleSize", "params": { "timeframe": "1D", "atrPeriod": 14, "min": 0.8, "max": 1.5 }, "points": 3, "label": "Normal (0.8–1.5× ATR)" }
        ]}
      ]
    },
    {
      "name": "Prior Trend Context", "maxPoints": 15,
      "groups": [
        { "label": "Strength of Prior Uptrend", "pick": "tiered", "conditions": [
          { "rule": "priorTrendBeforeBase", "params": { "timeframe": "1D", "lookbackDays": 28, "minGainPct": 15 }, "points": 8, "label": "≥15% over 4+ weeks" },
          { "rule": "priorTrendBeforeBase", "params": { "timeframe": "1D", "lookbackDays": 14, "minGainPct": 8  }, "points": 5, "label": "8–15% over 2–4 weeks" },
          { "rule": "priorTrendBeforeBase", "params": { "timeframe": "1D", "lookbackDays": 14, "minGainPct": 0  }, "points": 2, "label": "<8% / choppy" }
        ]},
        { "label": "Larger Structure",          "pick": "tiered", "conditions": [
          { "rule": "largerStructurePosition", "params": { "timeframe": "1D", "quality": "new_high"          }, "points": 7, "label": "52-week high or 6+ mo base" },
          { "rule": "largerStructurePosition", "params": { "timeframe": "1D", "quality": "intermediate_base" }, "points": 4, "label": "Intermediate base (8–12w)" },
          { "rule": "largerStructurePosition", "params": { "timeframe": "1D", "quality": "below_resistance"  }, "points": 1, "label": "Below 6-month high" }
        ]}
      ]
    },
    {
      "name": "Relative Strength vs SPY (60d)", "maxPoints": 10,
      "groups": [
        { "label": "RS ratio", "pick": "tiered", "conditions": [
          { "rule": "rsVsSpy", "params": { "timeframe": "1D", "lookback": 60, "minRatio": 1.05 },                  "points": 10, "label": "Outperformed SPY ≥5%" },
          { "rule": "rsVsSpy", "params": { "timeframe": "1D", "lookback": 60, "minRatio": 1.00, "maxRatio": 1.05 }, "points": 6,  "label": "Outperformed SPY 0–5%" },
          { "rule": "rsVsSpy", "params": { "timeframe": "1D", "lookback": 60, "minRatio": 0.98, "maxRatio": 1.00 }, "points": 3,  "label": "Roughly matched SPY" }
        ]}
      ]
    },
    {
      "name": "Momentum Confirmation", "maxPoints": 10,
      "groups": [
        { "label": "Momentum signals", "pick": "additive", "conditions": [
          { "rule": "macdBullishCrossAboveZero", "params": { "timeframe": "1D", "lookbackBars": 5 },                  "points": 5, "label": "MACD bullish cross above zero (last 5 bars)" },
          { "rule": "rsiLevel",                  "params": { "timeframe": "1D", "period": 14, "min": 60, "max": 100 }, "points": 5, "label": "RSI(14) > 60 on breakout" }
        ]}
      ]
    },
    {
      "name": "Sector & Market Support", "maxPoints": 10,
      "groups": [
        { "label": "Sector",            "pick": "tiered", "conditions": [
          { "rule": "sectorStrength", "params": { "topN": 3 }, "points": 5, "label": "Sector ETF top-3 (proxy for breaking out)" },
          { "rule": "sectorStrength", "params": { "topN": 7 }, "points": 3, "label": "Sector ETF top-7 (proxy for mild uptrend)" }
        ]},
        { "label": "Volatility Regime", "pick": "tiered", "conditions": [
          { "rule": "marketRegime", "params": { "spyEmaPeriod": 50, "maxVix": 18 }, "points": 5, "label": "VIX < 18" },
          { "rule": "marketRegime", "params": { "spyEmaPeriod": 50, "maxVix": 22 }, "points": 3, "label": "VIX 18–22" }
        ]}
      ]
    },
    {
      "name": "Manual Review", "maxPoints": 0,
      "groups": [
        { "label": "Discretionary checks", "pick": "additive", "conditions": [
          { "rule": "manualReview", "params": { "label": "Breaking into major resistance" },                  "points": 0, "label": "Major resistance check" },
          { "rule": "manualReview", "params": { "label": "News-driven move (earnings/M&A/FDA/upgrade)" },     "points": 0, "label": "News-spike check" },
          { "rule": "manualReview", "params": { "label": "Breakout volume erratic vs steadily rising" },      "points": 0, "label": "Volume quality check" }
        ]}
      ]
    }
  ]
}
```

The Manual Review section uses `maxPoints: 0` so it sums correctly to 100. `manualReview` always returns `pass: false` with a warning, which the existing `toMarkdown()` flow surfaces as a ⚠️ line — no engine schema changes needed.

> Note: The strategy validator (task 12 #13) requires `sum(sections.maxPoints) === totalMaxPoints`. Sections 1–6 sum to 25+30+15+10+10+10 = 100; Manual Review's 0 keeps the sum at 100. ✓

---

## Registry Update

`specs/strategies/index.json` — append:

```json
{
  "id":      "breakout_from_consolidation",
  "name":    "Breakout from Consolidation",
  "version": "1.0",
  "file":    "breakout_from_consolidation_v1.json",
  "enabled": true
}
```

---

## Implementation Order

1. **Engine extension** — add BB + MACD to `IndicatorSpec`, `TimeframeData`, `buildTimeframeData()`. Verify the v2 pullback strategy still loads cleanly.
2. **Modify `triggerVolume`** — add optional `maxPctAboveAvg`. Type check. Re-evaluate the v2 strategy to confirm no regression.
3. **Add `detectConsolidation` helper** in `helpers.ts` (returns `{ startIdx, endIdx, high, low, widthPct } | null`).
4. **Author `breakoutRules.ts`** with the 12 new rules; register each in `ruleRegistry.ts`.
5. **Author `breakout_from_consolidation_v1.json`** per the skeleton above.
6. **Register** in `index.json`.
7. **Verify** end-to-end (see below).

---

## Critical Files

- `server/src/services/strategy/strategyContext.ts` — add BB + MACD pre-compute.
- `server/src/services/rules/triggerRules.ts` — add `maxPctAboveAvg` to `triggerVolume`.
- `server/src/services/rules/breakoutRules.ts` (new) — 12 rules.
- `server/src/services/rules/ruleRegistry.ts` — register new rules.
- `server/src/services/rules/helpers.ts` — add `detectConsolidation` helper.
- `specs/strategies/breakout_from_consolidation_v1.json` (new).
- `specs/strategies/index.json` — append new entry.

## Patterns Reused

- Indicator pre-compute layer: `strategyContext.ts:103–133` (`buildTimeframeData`).
- Tiered scoring with reused rule + different params: pattern from `multi_timeframe_pullback_v2.json` (`fibRetracement`, `rsVsSpy`, `pullbackVolume`, `pullbackDuration`).
- `manualReview` warnings rendered by `strategyService.ts:renderSection`.
- Helper-driven rules with shared detection logic: `helpers.ts` `findSwingHigh` / `priorSwingHigh` / `nearestRoundNumber`.
- Strategy JSON shape: `specs/strategies/multi_timeframe_pullback_v2.json`.

## Out of Scope

- No JSON disqualifier-block schema extension — manual-review items use a maxPoints:0 section.
- No new client-side UI — Strategy tab from task 13 picks this up automatically.
- No backtest harness — single-ticker on-demand evaluation only.
- No sector ETF candle caching — `sectorStrength` rank proxy is sufficient.
- No VIX history pre-compute — top VIX tier drops the "falling" qualifier (spec to be updated).
- Detection of "major resistance" / "news spike" / "erratic volume" remains discretionary (manualReview warnings).

## Verification

1. Type check: `cd server && npx tsc --noEmit`.
2. List strategies: `curl http://localhost:3001/api/strategies` — confirm `breakout_from_consolidation v1.0` appears.
3. Evaluate a known recent breakout candidate: `curl http://localhost:3001/api/strategies/breakout_from_consolidation/evaluate/<TICKER>` — markdown report renders mandatory checks, score table sums to 100, decision banner present.
4. Evaluate a non-breakout stock (e.g., one in a downtrend) — confirm "Breakout confirmed" mandatory gate fails cleanly without crash.
5. Existing v2 strategy: `curl http://localhost:3001/api/strategies/multi_timeframe_pullback/evaluate/AAPL` — confirm no regression after BB/MACD/triggerVolume changes.
6. UI: open `/stock/<TICKER>` → Strategy tab → dropdown now shows two strategies → evaluate each.
7. Edge case: invalid ticker `XXXXXX` — confirm graceful failure (rule errors surfaced as warnings, no 502).
