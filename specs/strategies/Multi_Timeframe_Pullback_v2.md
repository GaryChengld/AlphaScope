# Strategy: Multi-Timeframe Pullback Swing Trading v2.0 — Entry Checklist

## Evaluation Anchor

This strategy evaluates whether the **current daily bar** is a valid pullback entry within a confirmed uptrend. It fails on most bars — the mandatory gates are designed to pass only when price is near a key support level after a healthy retracement from a swing high.

---

## MANDATORY CONDITIONS

_All must be true or no trade._

- [ ] **Price above daily EMA 200** — Close must be above the 200-period EMA on the daily chart
- [ ] **Weekly trend intact** — Price is above the weekly EMA 50, and at least 1 consecutive rising weekly bar
- [ ] **Valid pullback** — Price has pulled back **0.5–4× ATR(14)** from the 20-bar high (not too shallow, not too deep)
- [ ] **Near support** — Close is within **1.5× ATR(14)** of either the daily EMA 20 or EMA 50
- [ ] **SPY above its 50-day EMA** — Market is in a bullish regime
- [ ] **No earnings within 5 trading days** — Avoids earnings-event risk

If all mandatory conditions are met, go to scoring.

---

## SCORING (0–100)

_Enter only if score is **60 or higher**._
_Choose one item per group unless noted._

### 1) Trend Strength (Max 25)

**EMA Alignment Quality** _(daily chart: EMA 20, 50, 200)_

- [ ] **EMA 20 > 50 > 200, all three sloping upward** = 10
- [ ] **EMA 20 > 50 > 200, but EMA 200 is flat** = 7
- [ ] **EMA 20 > 50 > 200, but EMA 20 and 50 are converging** = 4

**Uptrend Duration** _(weekly chart — consecutive rising bars)_

- [ ] **3+ months (≥12 consecutive rising weekly bars)** = 8
- [ ] **2–3 months (8–12 weekly bars)** = 5
- [ ] **6–8 weeks (6–8 weekly bars)** = 3

**Relative Strength vs SPY** _(63-day return ratio)_

- [ ] **RS ratio > 1.2 (strong outperformance)** = 7
- [ ] **RS ratio 1.0–1.2 (slight outperformance)** = 4
- [ ] **RS ratio 0.9–1.0 (matched SPY)** = 2

---

### 2) Pullback Quality (Max 25)

**Fibonacci Retracement Depth** _(from the prior swing high over last 20 bars)_

- [ ] **38.2–50% retracement (ideal golden zone)** = 10
- [ ] **50–61.8% retracement (deeper but still valid)** = 7
- [ ] **23.6–38.2% retracement (shallow pullback)** = 5
- [ ] **61.8–78.6% retracement (deep, higher risk)** = 2

**ATR-Based Pullback Depth** _(from the 20-bar high)_

- [ ] **1.5–2.5× ATR(14) (ideal range)** = 5
- [ ] **1.0–1.5× ATR(14) (shallow)** = 3
- [ ] **2.5–3.0× ATR(14) (deep)** = 2

**Volume During Pullback** _(last 5 bars vs 20-day average)_

- [ ] **Progressively declining, final day < 80% of 20-day avg** = 7
- [ ] **Below 20-day average, not consistently declining** = 4
- [ ] **Roughly at 20-day average (flat)** = 2

**Pullback Duration** _(days since 20-bar high)_

- [ ] **3–8 trading days (healthy consolidation)** = 3
- [ ] **9–15 trading days (extended but holding support)** = 2
- [ ] **1–2 trading days (very shallow, may not be complete)** = 1

---

### 3) Support Confluence (Max 15)

**Primary Support Level** _(choose one — best match)_

- [ ] **Bouncing from EMA 20 (within 0.5× ATR)** = 5
- [ ] **Bouncing from EMA 50 (within 0.5× ATR)** = 4
- [ ] **Prior swing high acting as support (polarity flip)** = 4
- [ ] **Near round number ($50, $100, $150, $200, etc.)** = 2

**Support Confluence Bonus** _(how many support factors converge at this level)_

- [ ] **3 or more support factors converging** = 10
- [ ] **2 support factors converging** = 7
- [ ] **1 support factor only** = 3

---

### 4) RSI & Momentum (Max 10)

**RSI(14) Reading** _(daily chart)_

- [ ] **RSI 40–50 (pulled back from overbought — ideal entry zone)** = 5
- [ ] **RSI 50–55 (mild pullback, still acceptable)** = 3
- [ ] **RSI 35–40 (deeper pullback, watch for trend failure)** = 2

**RSI Structure**

- [ ] **Bullish divergence — price lower low, RSI higher low** = 5
- [ ] **RSI holding above 40 and turning upward** = 3

---

### 5) 1-Hour Chart Trigger Signal (Max 20)

> Only evaluated when Sections 1–4 combined score ≥ 40 points. If the upstream score is below 40, this section scores 0 automatically.

**Trigger Type** _(best-scoring trigger wins)_

- [ ] **1H candle closes above pullback's descending trendline** = 8 ⚠️ _manual review_
- [ ] **1H structure break — price above most recent 1H swing high (last 6 bars)** = 8
- [ ] **Bullish engulfing or hammer / pin bar at daily support on 1H** = 7
- [ ] **Bullish RSI divergence on 1H + price breaks above mid-point high** = 7 ⚠️ _manual review_
- [ ] **EMA 9 crossed above EMA 21 on 1H** = 6

**Volume on Trigger** _(trigger bar vs 20-bar 1H average)_

- [ ] **50%+ above 1H average** = 5
- [ ] **20–50% above 1H average** = 3
- [ ] **At or near 1H average** = 1

**Trigger Timing** _(days since daily pullback signal)_

- [ ] **Within 1–2 trading days of daily pullback signal** = 4
- [ ] **Day 3 after daily pullback signal** = 2

**Trigger Time of Day (Eastern)** 

- [ ] **10:00 AM – 2:00 PM (optimal session)** = 3
- [ ] **2:00 – 3:30 PM (acceptable)** = 2

---

### 6) Sector & Market Context (Max 5)

**Sector ETF Strength** _(30-day return rank vs 11 sector ETFs)_

- [ ] **Sector ETF in top 3 performing sectors** = 3
- [ ] **Sector ETF performing in line with broad market (top 7)** = 1

**Broad Market Condition**

- [ ] **SPY in uptrend and VIX below 20** = 2
- [ ] **SPY in uptrend but VIX 20–30** = 1

---

## SCORING SUMMARY

| Section                        |     Max |      Score |
| ------------------------------ | ------: | ---------: |
| 1. Trend Strength              |      25 |     \_\_\_ |
| 2. Pullback Quality            |      25 |     \_\_\_ |
| 3. Support Confluence          |      15 |     \_\_\_ |
| 4. RSI & Momentum              |      10 |     \_\_\_ |
| 5. 1-Hour Trigger Signal       |      20 |     \_\_\_ |
| 6. Sector & Market Context     |       5 |     \_\_\_ |
| **TOTAL**                      | **100** | **\_\_\_** |

---

## ENTRY DECISION

- **80–100** = Excellent setup — Risk **1.5–2%** of account
- **70–79** = Strong setup — Risk **1%** of account
- **60–69** = Acceptable setup — Risk **0.5–0.75%** of account
- **50–59** = Marginal — **DO NOT ENTER**, wait for improvement or skip
- **Below 50** = Weak — **DO NOT ENTER**

---

## BASIC EXECUTION RULES

- [ ] **Entry** — Enter on the trigger bar close (1H or daily)
- [ ] **Stop** — Below the pullback low or below the nearest key support level
- [ ] **Failure rule** — Exit if price closes below EMA 20 on the daily chart
- [ ] **Profit target** — Prior swing high; partial exit at 1:1 R/R, trail the rest
- [ ] **No follow-through** — Exit or reduce if price stalls for 3–5 trading days after entry

---

## SIMPLE DEFINITIONS

- **ATR(14)** = 14-day Average True Range
- **EMA N** = N-period Exponential Moving Average
- **Pullback** = decline from the most recent 20-bar swing high to the current close
- **Fibonacci retracement** = measured from the most recent swing low to the 20-bar swing high
- **Support confluence** = count of support factors (EMA 20, EMA 50, prior swing high, round number) within 0.5× ATR of the current close
- **RS ratio** = `(stock 63d return + 1) / (SPY 63d return + 1)` — values > 1.0 mean the stock is outperforming SPY
- **Polarity flip** = a prior resistance level (swing high) now acting as support after the price breaks above it and pulls back
- **1H trigger bar** = the most recent completed hourly candle that matches one of the Trigger Type conditions

---

## NOTES ON MANUAL-REVIEW TRIGGERS

Two trigger types in Section 5 are marked ⚠️ _manual review_:

1. **Descending trendline break** — requires a hand-drawn trendline connecting the pullback's lower highs. Not detectable algorithmically.
2. **Bullish RSI divergence on 1H + mid-point high break** — requires visual confirmation of divergence on the hourly chart.

Both still contribute to the automated score (the `manualReview` rule always returns "not detected" with a warning), so the automated score will be conservative when these are the only trigger present. They should be layered on top of an already-qualifying automated setup.
