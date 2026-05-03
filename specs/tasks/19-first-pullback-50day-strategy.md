# Task 19 — First Pullback to 50-Day Strategy

## Goal

Implement a swing trading strategy that identifies stocks in a sustained Stage 2 uptrend pulling back to their 50-day EMA for the **first time**. The key differentiator from the Multi-Timeframe Pullback is the mandatory "first touch" gate — only setups where price has not crossed below the 50-day MA in the last 60 bars qualify.

---

## Strategy Logic

A stock that has been running above the 50-day MA for months without testing it creates a situation where institutional buyers who accumulated during the breakout will defend that level. The first test is historically the highest-probability entry because:
- No prior overhead supply at the 50-day from failed tests
- Institutions actively defend their cost basis
- The move back to the 50-day resets sentiment without breaking trend structure

---

## New Rules

### `firstPullbackToEma` (in `pullbackRules.ts`)

Counts the number of completed bars in the last `lookback` daily bars where `close ≤ EMA[period]`. Passes if count ≤ `maxPriorTouches`.

**Mandatory gate params:** `emaPeriod: 50, lookback: 60, maxPriorTouches: 1`  
**Scoring (purity) params:** `maxPriorTouches: 0` for pristine first test (5 pts), `1` for early second (3 pts)

### `priorRunStrength` (in `pullbackRules.ts`)

Finds the swing high in the last `lookback` bars via `findSwingHigh()`. Computes `(swingHigh.price − last(EMA[period])) / last(ATR[period])`. Measures how extended above the 50-day the stock got before pulling back.

**Scoring tiers:** > 5× ATR = 10 pts (powerful run), 3–5× = 7 pts, 1.5–3× = 4 pts

---

## Files

| File | Action |
|------|--------|
| `server/src/services/rules/pullbackRules.ts` | Added `firstPullbackToEma` + `priorRunStrength` |
| `server/src/services/rules/ruleRegistry.ts` | Registered both new rules |
| `specs/strategies/first_pullback_50day_v1.json` | Strategy definition |
| `specs/strategies/first_pullback_50day_v1.md` | Human-readable spec |
| `specs/strategies/index.json` | Added entry, `enabled: true` |

---

## Scoring Summary (max 100)

| # | Section | Max |
|---|---------|-----|
| 1 | Trend Strength — EMA slopes, weekly consistency, RS vs SPY | 25 |
| 2 | Prior Run Strength — peak extension above EMA 50, purity of first touch | 15 |
| 3 | Pullback Character — depth (Fib/ATR), volume, duration | 20 |
| 4 | Support at the 50-Day — price above EMA 50, alignment intact, confluence | 15 |
| 5 | RSI & Momentum — RSI level, RSI turning up | 10 |
| 6 | 1-Hour Trigger Signal — trigger type, volume, timing | 10 |
| 7 | Market Context — sector strength, VIX | 5 |

---

## Mandatory Gates (all 8 must pass)

1. Price above daily EMA 200
2. Daily EMA 20 > EMA 50 > EMA 200
3. Weekly close above EMA 50
4. **First or second touch of EMA 50 in last 60 bars** ← key differentiator
5. Valid pullback (0.5–4× ATR from 20-bar high)
6. Within 1× ATR of EMA 50
7. SPY above its 50-day EMA
8. No earnings within 5 trading days

---

## Verification

1. `npx tsc --noEmit` in `server/` — no errors
2. `GET /api/strategies` — `first_pullback_50day` v1.0 appears
3. `GET /api/strategies/first_pullback_50day/evaluate/:ticker` — markdown output with all 7 sections
4. Gate 4 fails for stocks that have repeatedly tested the 50-day recently
5. Gate 4 passes for stocks in clean Stage 2 uptrends that haven't tested the 50-day
6. Existing strategies evaluate unchanged
