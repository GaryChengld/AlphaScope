# Multi-Timeframe Pullback Swing Trading v4.0 — Simplified Checklist

## Strategy Anchor

Evaluates whether the current daily bar is a valid pullback entry within a confirmed uptrend. Designed to fail on most bars and pass only when price is near key support after a healthy retracement.

---

## 🚦 MANDATORY GATES (all must be true — else no trade)

- [ ] **Daily trend up** — Close > Daily EMA 200, and EMA 20 > EMA 50 > EMA 200
- [ ] **Weekly trend up** — Close > Weekly EMA 50
- [ ] **Valid pullback** — Price has pulled back 1.0–4.0× ATR(14) from the 20-bar high
- [ ] **No significant bounce** — Post-low bounce < 2× ATR(14) since the swing high (filters V-bottom re-tests)
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
>
> **Recent-window detection (new in v4):** a periodic scanner cannot catch the exact bar a
> trigger prints, so the event rules scan the **last 3 completed hourly bars**, not just the
> most recent one. Two lower **fallback tiers** then reward a hourly chart that has *already*
> turned up near daily support, so the group is no longer 15-or-0.

**Trigger Type** _(best one wins, Max 15)_

- [ ] 1H structure break in last 3 bars — close broke and **holds** above the prior 6-bar swing high = **15**
- [ ] Bullish reversal candle (engulfing / hammer / pin / green-after-red) on 1H within the last 3 bars = **12**
- [ ] EMA 9 crossed above EMA 21 on 1H within the last 3 bars = **9**
- [ ] _(fallback)_ 1H short-term trend already up — EMA 9 > EMA 21 = **6**
- [ ] _(fallback)_ 1H price reclaimed short-term MA — close > 1H EMA 9 = **4**

**Trigger Volume** _(vs 20-bar 1H avg, Max 6)_

- [ ] 50%+ above avg = **6**
- [ ] 20–50% above avg = **4**
- [ ] At or near avg = **2**

**Trigger Timing** _(days since daily pullback signal, Max 4)_

- [ ] Within 1–3 trading days of the daily pullback signal = **4**
- [ ] Within 4–6 trading days = **2**

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
- **Recent window** — The last 3 completed hourly candles, scanned for a trigger event
- **1H trend-up fallback** — 1H EMA 9 > EMA 21 (or close > 1H EMA 9) with no fresh trigger this window

---

## 🔑 KEY CHANGES FROM v3.0

1. **Recent-window trigger detection** — the three Trigger-Type event rules (structure break, reversal candle, EMA 9/21 cross) now scan the **last 3 hourly bars** instead of only the most recent one, so a periodic scanner (10/12/14/16 ET) actually catches triggers that fired between runs. The structure-break rule also requires price to be **still holding** above the broken level.
2. **Graduated 1H fallback tiers** — added two lower Trigger-Type tiers ("1H EMA 9 > EMA 21" = 6, "close > 1H EMA 9" = 4) so a hourly chart that has already turned up near daily support earns partial credit. This removes the v3 **15-or-0 cliff** that made Section 5 score ~0 for nearly every stock and kept totals stuck in the 50s–60s.
3. **Widened Trigger Timing** — replaced the single "within 1–2 days" bucket with two tiers ("1–3 days" = 4, "4–6 days" = 2); a pullback sitting at support for a few days is still valid.
4. **Section 5 weighting unchanged** (still 25 pts, still scaled by `min(1, upstream/35)`) — the fix is making the section *achievable*, not louder. Sections 1–4 and 6 are identical to v3.
