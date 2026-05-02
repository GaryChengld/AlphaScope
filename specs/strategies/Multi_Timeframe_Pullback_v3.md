# Multi-Timeframe Pullback Swing Trading v3.0 — Simplified Checklist

## Strategy Anchor

Evaluates whether the current daily bar is a valid pullback entry within a confirmed uptrend. Designed to fail on most bars and pass only when price is near key support after a healthy retracement.

---

## 🚦 MANDATORY GATES (all must be true — else no trade)

- [ ] **Daily trend up** — Close > Daily EMA 200, and EMA 20 > EMA 50 > EMA 200
- [ ] **Weekly trend up** — Close > Weekly EMA 50
- [ ] **Valid pullback** — Price has pulled back 1.0–3.0× ATR(14) from the 20-bar high
- [ ] **Near support** — Close within 1.0× ATR(14) of Daily EMA 20 or EMA 50
- [ ] **Bullish market** — SPY > its 50-day EMA
- [ ] **No earnings** within 5 trading days

If all pass → proceed to scoring.

---

## 📊 SCORING (0–100)

> **Enter only if total score ≥ 60.**
> Choose the single best-matching option in each subsection.

---

### 1) Trend Strength (Max 20)

**EMA Slope Quality** _(daily)_

- [ ] All three EMAs (20/50/200) sloping upward = **8**
- [ ] EMA 20 & 50 up, EMA 200 flat = **5**
- [ ] EMA 20 up, EMA 50 flat = **2**

**Weekly Trend Health** _(last 12 weeks)_

- [ ] ≥10 of last 12 weekly closes above Weekly EMA 50 = **6**
- [ ] 7–9 of last 12 weekly closes above Weekly EMA 50 = **4**
- [ ] 5–6 of last 12 weekly closes above Weekly EMA 50 = **2**

**Relative Strength vs SPY** _(63-day return ratio)_

- [ ] RS ratio > 1.10 = **6**
- [ ] RS ratio 1.00–1.10 = **3**
- [ ] RS ratio 0.95–1.00 = **1**

---

### 2) Pullback Quality (Max 25)

**Pullback Depth** _(use the better of Fib or ATR — not both)_

- [ ] Fib 38.2–50% **OR** ATR 1.5–2.5× = **12** (ideal)
- [ ] Fib 50–61.8% **OR** ATR 2.5–3.0× = **8** (deeper but valid)
- [ ] Fib 23.6–38.2% **OR** ATR 1.0–1.5× = **6** (shallow)

**Volume During Pullback** _(last 5 bars vs 20-day avg)_

- [ ] Declining, final day < 80% of 20-day avg = **8**
- [ ] Below 20-day avg, not consistently declining = **5**
- [ ] Roughly at 20-day avg = **2**

**Pullback Duration** _(days since 20-bar high)_

- [ ] 3–8 trading days = **5**
- [ ] 9–15 trading days = **3**
- [ ] 1–2 or 16–20 trading days = **1**

---

### 3) Support Confluence (Max 15)

**Confluence Count** _(factors within 0.5× ATR of close: EMA 20, EMA 50, prior swing high, round number)_

- [ ] 3+ factors converging = **15**
- [ ] 2 factors converging = **10**
- [ ] 1 factor only = **5**

---

### 4) RSI & Momentum (Max 10)

**RSI(14) Reading** _(daily)_

- [ ] RSI 40–50 (ideal pullback zone) = **6**
- [ ] RSI 50–55 (mild pullback) = **4**
- [ ] RSI 35–40 (deeper, watch carefully) = **2**

**RSI Behavior**

- [ ] RSI turning upward from its low = **4**
- [ ] RSI flat but holding above 40 = **2**

---

### 5) 1-Hour Trigger Signal (Max 25)

> **Graduated unlock:** Section 5 score is multiplied by `min(1, upstream_score / 35)`.
> No hard cliff — weak upstream just dampens the trigger value.

**Trigger Type** _(best one wins, Max 15)_

- [ ] 1H structure break — close > most recent 1H swing high (last 6 bars) = **15**
- [ ] Bullish engulfing / hammer / pin bar at daily support on 1H = **12**
- [ ] EMA 9 crossed above EMA 21 on 1H = **9**

**Trigger Volume** _(vs 20-bar 1H avg, Max 6)_

- [ ] 50%+ above avg = **6**
- [ ] 20–50% above avg = **4**
- [ ] At or near avg = **2**

**Trigger Timing** _(Max 4)_

- [ ] Within 1–2 trading days of daily pullback signal **AND** during 10:00 AM – 2:00 PM ET = **4**
- [ ] Within 1–2 days **OR** in optimal session (not both) = **2**
- [ ] Day 3+ or outside optimal session = **1**

**Discretionary Bonus** _(manual review, not in auto-score, Max +5)_

- [ ] 1H descending trendline break confirmed visually = **+3**
- [ ] 1H bullish RSI divergence + mid-point high break = **+3**
      _(Cap total Section 5 at 25 even with bonus.)_

---

### 6) Sector & Market Context (Max 5)

**Sector ETF Strength** _(30-day return rank vs 11 sectors)_

- [ ] Top 3 sectors = **3**
- [ ] Top 7 sectors = **1**

**Volatility Regime**

- [ ] VIX < 20 = **2**
- [ ] VIX 20–30 = **1**

---

## 📋 SCORING SUMMARY

| Section                                   | Max     | Score      |
| ----------------------------------------- | ------- | ---------- |
| 1. Trend Strength                         | 20      | \_\_\_     |
| 2. Pullback Quality                       | 25      | \_\_\_     |
| 3. Support Confluence                     | 15      | \_\_\_     |
| 4. RSI & Momentum                         | 10      | \_\_\_     |
| 5. 1-Hour Trigger (× upstream multiplier) | 25      | \_\_\_     |
| 6. Sector & Market                        | 5       | \_\_\_     |
| **TOTAL**                                 | **100** | **\_\_\_** |

Upstream score = Sections 1+2+3+4 (max 70). Section 5 multiplier = `min(1, upstream / 35)`.

---

## 🎯 ENTRY DECISION

| Score  | Decision                    | Risk per Trade |
| ------ | --------------------------- | -------------- |
| 80–100 | Excellent setup             | 1.5–2.0%       |
| 70–79  | Strong setup                | 1.0%           |
| 60–69  | Acceptable setup            | 0.5–0.75%      |
| 50–59  | Marginal — **DO NOT ENTER** | —              |
| < 50   | Weak — **DO NOT ENTER**     | —              |

---

## ⚙️ EXECUTION RULES

- **Entry** — On the 1H trigger bar close
- **Stop** — Below the pullback low or nearest key support
- **Failure rule** — Exit if daily close < EMA 20
- **Profit target** — Prior swing high; partial exit at 1:1 R/R, trail the rest
- **Stall rule** — Exit or reduce if price stalls 3–5 days after entry

---

## 📖 DEFINITIONS

- **ATR(14)** — 14-day Average True Range
- **EMA N** — N-period Exponential Moving Average
- **Pullback** — Decline from the most recent 20-bar swing high to current close
- **Fib retracement** — Measured from most recent swing low to 20-bar swing high
- **Support confluence** — Count of support factors (EMA 20, EMA 50, prior swing high, round number) within 0.5× ATR of close
- **RS ratio** — (stock 63d return + 1) / (SPY 63d return + 1); >1.0 = outperforming
- **1H trigger bar** — Most recent completed hourly candle matching a Trigger Type

---

## 🔑 KEY CHANGES FROM v2.0

1. **No hard gate on Section 5** — replaced with a graduated multiplier (no more 0/20 cliff)
2. **Weekly trend** — uses "weeks above EMA 50" instead of unrealistic "12 consecutive rising bars"
3. **Pullback depth** — pick Fib OR ATR, no longer scored twice for the same factor
4. **Mandatory gates aligned** with scoring ranges (no silent point leaks)
5. **EMA convergence penalty removed** (no longer conflicts with Support Confluence)
6. **Section 5 rebalanced** — trigger itself is now worth 15/25 instead of 8/20
7. **Manual-review triggers moved** to a discretionary bonus, not buried in auto-score
8. **Combined Trigger Timing + Time of Day** — fewer micro-buckets, less noise
