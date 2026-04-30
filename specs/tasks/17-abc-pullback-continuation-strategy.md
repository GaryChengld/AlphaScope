# Task 17 — ABC Pullback Continuation Strategy (v1.0)

## Goal

Add the ABC Pullback Continuation bullish strategy to the JSON-driven strategy engine. This is a trend-continuation pattern: an impulse leg (A→B) followed by a healthy pullback to a support zone (C), then entry on a lower-timeframe trigger. The strategy has 9 mandatory gates and 6 scoring sections totalling 100 pts.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 4H timeframe (Section 1 +7 pts) | **Included** | No engine change needed — just add `'4H': { ema: [9,21,50] }` to `requires`. Yahoo Finance provides 4H data; `buildTimeframeData` handles any timeframe string. |
| VIX EMA comparison (Section 6 +2 pts) | **Replaced** | `VIX_5EMA < VIX_20EMA` requires VIX historical series not available in context. Replaced with `noNearEarnings` +2 pts. Section 6 max stays 5; total stays 100. |
| No-bearish-divergence gate | **New `abcNoDivergence` rule** | `rsiStructure(type:'divergence')` passes when divergence IS present (opposite of what we need). Dedicated rule avoids a negate flag on the engine. |

---

## Key Concepts

```
B_point     = highest CLOSE in last 20 bars (top of impulse)
A_point     = lowest LOW in candles[0..bIdx] within same window (base of impulse)
HL          = most recent 3-bar pivot low before B (low[i] < low[i-1] && low[i] < low[i+1])
C / pullbackLow = lowest LOW in bars after B (the pullback trough)
barsAgo     = lookback − 1 − bIdx (bars from B to current bar)
```

All ABC points are computed by `computeAbcPoints(candles, lookback)` in `helpers.ts`. Each rule that needs these points calls this helper internally (rules are invoked independently so per-call recomputation is acceptable).

---

## Rule Reuse Map

### Existing rules reused as-is

| Requirement | Rule | File |
|------------|------|------|
| `close > EMA50` | `priceAboveEma` | trendRules.ts |
| `EMA20 > EMA50` on 1D | `emaAlignment` | trendRules.ts |
| `EMA9 > EMA21 > EMA50` on 4H | `emaAlignment` (timeframe:'4H', periods:[9,21,50]) | trendRules.ts |
| SPY > EMA50 | `spyAboveEma` | trendRules.ts |
| Pullback 0.5–4×ATR | `pullbackAtrDepth` | pullbackRules.ts |
| Fib retracement of A→B | `abcFibRetracement` | abcRules.ts (new — see note) |
| Volume declining on pullback | `pullbackVolume` | pullbackRules.ts |
| Pullback duration | `pullbackDuration` | pullbackRules.ts |
| C-point confluence ≥2/3 factors | `supportConfluence` | pullbackRules.ts |
| RSI turning up (Section 4) | `rsiStructure(type:'turning_up')` | pullbackRules.ts |
| RSI in range | `rsiLevel` | pullbackRules.ts |
| SPY+VIX regime | `marketRegime` | marketRules.ts |
| No near earnings | `noNearEarnings` | marketRules.ts |
| 1H bullish reversal candle | `bullishReversalCandle` | triggerRules.ts |
| 1H close > swing high | `hourlyStructureBreak` | triggerRules.ts |
| 1H EMA9 cross EMA21 | `hourlyEmaCrossover` | triggerRules.ts |
| 1H trigger volume | `triggerVolume` | triggerRules.ts |

### New rules (`abcRules.ts`)

| Rule | Mode | Purpose |
|------|------|---------|
| `abcHHHL` | mandatory + scoring | Counts HH (high[i]>high[i-1]) and HL (low[i]>low[i-1]) over last N bars; pass when both counts meet thresholds |
| `abcImpulse` | mandatory | Validates A→B: size≥1.5×ATR, bullish-candle-ratio≥0.6, max-consec-bearish≤3, B above prior 20-bar high, overextension (B−EMA20_at_B)≤2×ATR |
| `abcStructure` | mandatory + scoring | Checks close (mandatory) or bar low (scoring) vs HL; `checkField` param: `'close'` / `'low'` / `'low_near'` |
| `abcNearSupport` | mandatory | OR-gate: close within 1.5×ATR of EMA20 OR EMA50 OR fib 38.2/50/61.8% level |
| `abcNoDivergence` | mandatory | Passes when RSI < maxRsi AND no bearish RSI divergence in last N bars |
| `abcImpulseQuality` | scoring | Bullish candle ratio tiers for A→B segment |
| `abcCPointWick` | scoring | Lower wick quality: `minWickRatio` and `minClosePos` params |
| `abcPullbackBodyRatio` | scoring | Avg body size of pullback bars vs impulse bars |
| `abcFibRetracement` | mandatory + scoring | Correct A→B fib: `(B_close − close) / (B_close − A_low) × 100`. The generic `fibRetracement` uses the highest HIGH for B and the post-B swing low (C) as denominator — wrong for ABC. This rule uses `computeAbcPoints` for proper B (highest close) and A (lowest low before B). |
| `abcDaysSinceC` | scoring | Bars since C_point (pullback low) |
| `abcMomentum` | scoring | `check` param: `'above_lower_high'` or `'top_third'` |

### New helpers (`helpers.ts`)

- **`findSwingLow(ctx, timeframe, lookback)`** → `SwingLow { price, barsAgo }` — mirrors existing `findSwingHigh`
- **`computeAbcPoints(candles, lookback)`** → `AbcPoints { bPoint, bIdx, barsAgo, aPoint, aIdx, hl, hlIdx, pullbackLow }` — shared by all abc rules

---

## Files

### New Files

| File | Purpose |
|------|---------|
| `server/src/services/rules/abcRules.ts` | 10 new rule functions |
| `specs/strategies/abc_pullback_continuation_v1.json` | Strategy JSON definition |

### Modified Files

| File | Change |
|------|--------|
| `server/src/services/rules/helpers.ts` | Added `SwingLow`, `findSwingLow()`, `AbcPoints`, `computeAbcPoints()` |
| `server/src/services/rules/ruleRegistry.ts` | Registered 10 new abc rules under "ABC Pullback Continuation" section |
| `specs/strategies/index.json` | Appended `abc_pullback_continuation` entry (enabled) |

---

## Strategy JSON Overview

### `requires` block

```json
{
  "timeframes": {
    "1D": { "ema": [20, 50], "atr": [14], "rsi": [14] },
    "4H": { "ema": [9, 21, 50] },
    "1H": { "ema": [9, 21] }
  },
  "spy": { "ema": [50] }
}
```

### Mandatory Conditions (9 gates — all must pass)

| # | Label | Rule | Key Params |
|---|-------|------|-----------|
| 1 | Uptrend — close above EMA50 | `priceAboveEma` | timeframe:"1D", period:50 |
| 2 | Uptrend — EMA20 above EMA50 | `emaAlignment` | timeframe:"1D", periods:[20,50] |
| 3 | HH≥2 and HL≥2 in last 20 bars | `abcHHHL` | lookback:20, minHH:2, minHL:2 |
| 4 | A→B impulse quality | `abcImpulse` | minAtrSize:1.5, minBullishRatio:0.6, maxConsecBearish:3, maxOverextAtr:2 |
| 5 | Pullback depth 0.5–4×ATR | `pullbackAtrDepth` | atrPeriod:14, lookback:20, min:0.5, max:4 |
| 6 | Fib retracement of A→B 23.6–78.6% | `abcFibRetracement` | lookback:20, min:23.6, max:78.6 |
| 7 | Structure intact — close above HL | `abcStructure` | lookback:20, checkField:"close" |
| 8 | Near EMA20, EMA50, or key fib level (OR) | `abcNearSupport` | emaPeriods:[20,50], fibLevels:[0.382,0.5,0.618], atrMultiple:1.5 |
| 9 | RSI < 70 and no bearish divergence | `abcNoDivergence` | rsiPeriod:14, maxRsi:70, lookback:10 |

### Scoring Sections (100 pts total)

#### Section 1: Trend Structure (Max 25)

| Group | Pick | Tiers | Max |
|-------|------|-------|-----|
| HH/HL Count | tiered | minHH:3+minHL:3 → 10; minHH:2 → 7; minHH:1 → 4 | 10 |
| A→B Bullish Ratio | tiered | ratio≥0.7 → 8; ≥0.6 → 5; ≥0 → 2 | 8 |
| EMA Alignment | tiered | 4H aligned (9>21>50) → 7; 1D aligned (20>50) → 4 | 7 |

#### Section 2: Pullback Quality (Max 25)

| Group | Pick | Tiers | Max |
|-------|------|-------|-----|
| Fib Retracement | tiered | 38.2–50% → 10; 50–61.8% → 7; 23.6–38.2% → 5; other → 2 | 10 |
| Body Ratio (pullback/impulse) | tiered | ≤50% → 7; ≤80% → 4; any → 1 | 7 |
| Pullback Volume | tiered | ideal (declining+<80%avg) → 5; below avg → 3; flat → 1 | 5 |
| Pullback Duration | tiered | 3–10 bars → 3; 1–20 → 2; any → 1 | 3 |

#### Section 3: C-Point Quality (Max 20)

| Group | Pick | Tiers | Max |
|-------|------|-------|-----|
| Support Confluence | tiered | ≥3 factors → 10; ≥2 → 7; ≥1 → 3 | 10 |
| Lower Wick Quality | tiered | wick≥2×body AND close≥67% → 6; wick≥1× → 3 | 6 |
| Structure at C | tiered | low>HL → 4; low within 0.3×ATR of HL → 2 | 4 |

#### Section 4: Momentum (Max 10)

| Group | Pick | Tiers | Max |
|-------|------|-------|-----|
| Price Momentum | tiered | close>last lower high → 5; 2 closes in top 33% → 3 | 5 |
| RSI Momentum | tiered | RSI turning up (>40, increasing) → 5; RSI 50–55 → 3; RSI 35–70 → 1 | 5 |

#### Section 5: Lower Timeframe Trigger — `dependsOn: { sections:[0,1,2,3], minTotal:40 }` (Max 15)

| Group | Pick | Tiers | Max |
|-------|------|-------|-----|
| 1H Trigger Type | tiered | 1H structure break → 8; bullish reversal candle → 6; EMA9 cross EMA21 → 5 | 8 |
| 1H Trigger Volume | tiered | >1.5× avg → 4; >1.2× avg → 2; above avg → 1 | 4 |
| Recency of C-Point | tiered | ≤3 bars ago → 3; any → 1 | 3 |

#### Section 6: Market Context (Max 5)

| Group | Pick | Tiers | Max |
|-------|------|-------|-----|
| SPY + VIX | tiered | SPY>EMA50 AND VIX<20 → 3; SPY>EMA50 only → 1 | 3 |
| No Near Earnings | additive | no earnings within 5 days → 2 | 2 |

---

## Key Implementation Notes

- **`abcImpulse` overextension check**: EMA20 at the B bar is accessed as `ema20[ema20.length - 1 - barsAgo]` — EMA arrays are right-aligned with the candle array
- **`abcStructure` dual use**: same rule handles mandatory (`checkField:'close'`) and two scoring tiers (`checkField:'low'` and `checkField:'low_near'` with `maxAtrFraction:0.3`)
- **Section 5 `dependsOn`**: uses 0-indexed section references `[0,1,2,3]` — the engine skips the entire section if these sections total < 40; scored as 0 pts if skipped
- **Fib params in JSON**: mandatory uses `min:23.6, max:78.6` (percentage); scoring tiers use narrower bands for graduated scoring
- **`abcNoDivergence` bearish check**: looks for two local price+RSI highs where price[i2]>price[i1] but RSI[i2]<RSI[i1] — distinct from the bullish divergence in `rsiStructure`

---

## Verification

1. `npx tsc --noEmit` clean on server
2. Section maxPoints sum = 100 (25+25+20+10+15+5) — confirmed via JSON parse
3. Mandatory gate count = 9 — confirmed
4. `GET /api/strategies` lists "ABC Pullback Continuation v1.0"
5. `GET /api/strategies/abc_pullback_continuation/evaluate/:ticker` returns markdown
6. Stock in downtrend (close < EMA50) → gate 1 fails, evaluation stops before scoring
7. Sections 1–4 total < 40 → Section 5 shows as skipped (0 pts) in markdown output
8. Known ABC setup scores ≥ 60
