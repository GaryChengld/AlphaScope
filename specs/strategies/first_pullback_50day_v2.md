# First Pullback to 50-Day — v2.0

## Strategy Anchor

Evaluates whether the current daily bar is the **first pullback to the 50-day EMA** after a sustained Stage 2 uptrend. Designed to fail on stocks that have repeatedly tested the 50-day and pass only when price returns to this level cleanly — for the first or second time in 60 bars — after an extended run above it.

---

## 🚦 MANDATORY GATES (all must be true — else no trade)

- [ ] **Price above daily EMA 200**
- [ ] **Daily EMA 20 > EMA 50 > EMA 200** — full uptrend alignment
- [ ] **Weekly close above EMA 50** — higher-timeframe trend intact
- [ ] **First or second touch of EMA 50 in 60 bars** — at most 1 prior close at or below EMA 50 in the last 60 trading days
- [ ] **Valid pullback** — 0.5–4× ATR(14) from the 20-bar swing high
- [ ] **Within 1× ATR of EMA 50** — currently near the 50-day level
- [ ] **SPY above its 50-day EMA** — bullish market regime
- [ ] **No earnings within 5 trading days**

---

## 📊 SCORING (0–100)

> **Enter only if total score ≥ 60.**

---

### 1) Trend Strength (Max 25)

**EMA Slope Quality** _(daily)_

- [ ] All three EMAs (20/50/200) sloping upward = **8**
- [ ] EMA 20 & 50 up, EMA 200 flat = **5**
- [ ] EMA 20 up, EMA 50 flat = **2**

**Weekly Trend Consistency** _(last 12 weeks)_

- [ ] ≥10 of last 12 weekly closes above Weekly EMA 50 = **7**
- [ ] 7–9 = **5**
- [ ] 5–6 = **3**

**Relative Strength vs SPY** _(63-day return ratio)_

- [ ] RS ratio > 1.15 = **10**
- [ ] RS ratio 1.05–1.15 = **7**
- [ ] RS ratio 1.00–1.05 = **3**

---

### 2) Prior Run Strength (Max 15)

**Peak Extension above EMA 50** _(20-bar swing high vs current EMA 50, in ATR units)_

- [ ] Swing high > 5× ATR above EMA 50 = **10** (powerful run — deeply extended)
- [ ] 3–5× ATR above EMA 50 = **7**
- [ ] 1.5–3× ATR above EMA 50 = **4**

**Run Purity** _(how clean the first touch is)_

- [ ] Zero prior touches of EMA 50 in 60 bars = **5** (pristine first test)
- [ ] At most one touch in 40 bars = **3** (very early second test)

---

### 3) Pullback Character (Max 20)

**Pullback Depth** _(best of Fib or ATR — not both)_

- [ ] Fib 23.6–38.2% **OR** ATR 1.0–2.0× = **10** (healthy, shallow)
- [ ] Fib 38.2–50% **OR** ATR 2.0–3.0× = **7** (moderate)
- [ ] Fib 50–61.8% **OR** ATR 0.5–1.0× = **4** (deep or very shallow)

**Volume During Pullback** _(last 5 bars vs 20-day avg)_

- [ ] Declining, final day < 80% of avg = **6**
- [ ] Below avg, not consistently declining = **4**
- [ ] Roughly at avg = **2**

**Pullback Duration** _(days since 20-bar high)_

- [ ] 3–8 trading days = **4**
- [ ] 9–12 trading days = **2**
- [ ] 1–2 trading days = **1**

---

### 4) Support at the 50-Day (Max 15)

**Price and Alignment** _(additive — both can score)_

- [ ] Price above EMA 50 (touching from above, not broken) = **6**
- [ ] EMA 20 > EMA 50 > EMA 200 still intact = **4**

**Confluence at EMA 50 Level** _(factors within 0.5× ATR: EMA 20, prior swing high, round number)_

- [ ] 2+ confluence factors at EMA 50 = **5**
- [ ] 1 confluence factor = **3**

---

### 5) RSI & Momentum (Max 10)

**RSI(14) Reading** _(daily)_

- [ ] RSI 40–55 (pulled back to healthy zone) = **6**
- [ ] RSI 55–65 (mild pullback, still elevated) = **4**
- [ ] RSI 35–40 (deeper — watch for weakness) = **2**

**RSI Behavior**

- [ ] RSI turning upward from its low = **4**
- [ ] RSI flat but holding above 40 = **2**

---

### 6) 1-Hour Trigger Signal (Max 10)

> **Recent-window detection (new in v2):** a periodic scanner cannot catch the exact bar a
> trigger prints, so the event rules scan the **last 3 completed hourly bars**, not just the
> most recent one. Two lower **fallback tiers** then reward a hourly chart that has *already*
> turned up at the 50-day, so the group is no longer 6-or-0.

**Trigger Type** _(best one wins, Max 6)_

- [ ] 1H structure break in last 3 bars — close broke and **holds** above the prior 6-bar swing high = **6**
- [ ] Bullish engulfing / hammer / pin bar on 1H within the last 3 bars = **5**
- [ ] EMA 9 crossed above EMA 21 on 1H within the last 3 bars = **4**
- [ ] _(fallback)_ 1H short-term trend already up — EMA 9 > EMA 21 = **3**
- [ ] _(fallback)_ 1H price reclaimed short-term MA — close > 1H EMA 9 = **2**

**Trigger Volume** _(vs 20-bar 1H avg, Max 2)_

- [ ] 50%+ above avg = **2**
- [ ] 20–50% above avg = **1**

**Trigger Timing** _(days since daily pullback signal, Max 2)_

- [ ] Within 1–3 trading days of the daily pullback signal = **2**
- [ ] Within 4–6 trading days = **1**

---

### 7) Market Context (Max 5)

**Sector ETF Strength** _(30-day return rank vs 11 sectors)_

- [ ] Top 3 sectors = **3**
- [ ] Top 7 sectors = **1**

**Volatility Regime**

- [ ] VIX < 20 = **2**
- [ ] VIX 20–30 = **1**

---

## 📋 SCORING SUMMARY

| Section | Max | Score |
|---------|-----|-------|
| 1. Trend Strength | 25 | ___ |
| 2. Prior Run Strength | 15 | ___ |
| 3. Pullback Character | 20 | ___ |
| 4. Support at the 50-Day | 15 | ___ |
| 5. RSI & Momentum | 10 | ___ |
| 6. 1-Hour Trigger | 10 | ___ |
| 7. Market Context | 5 | ___ |
| **TOTAL** | **100** | **___** |

---

## 🎯 ENTRY DECISION

| Score | Decision | Risk per Trade |
|-------|----------|---------------|
| 80–100 | Excellent — first touch, strong trend | 1.5–2.0% |
| 70–79 | Strong setup | 1.0% |
| 60–69 | Acceptable | 0.5–0.75% |
| < 60 | **DO NOT ENTER** | — |

---

## ⚙️ EXECUTION RULES

- **Entry** — On the 1H trigger bar close at the 50-day level
- **Stop** — Below the pullback low or below the 50-day MA (whichever is lower)
- **Failure rule** — Exit immediately if daily close < EMA 50 by more than 1× ATR
- **Profit target** — Prior swing high; partial exit at 1:1 R/R, trail the rest
- **Stall rule** — Exit or reduce if price stalls 3–5 days after entry without follow-through

---

## 📖 DEFINITIONS

- **First pullback to EMA 50** — Stock has had at most 1 daily close at or below EMA 50 in the last 60 bars
- **Prior run strength** — Distance from recent swing high to current EMA 50, measured in ATR units
- **RS ratio** — (stock 63d return + 1) / (SPY 63d return + 1); > 1.0 = outperforming SPY
- **Confluence** — Count of support factors (EMA 20, prior swing high, round number) within 0.5× ATR of close
- **Recent window** — The last 3 completed hourly candles, scanned for a trigger event
- **1H trend-up fallback** — 1H EMA 9 > EMA 21 (or close > 1H EMA 9) with no fresh trigger this window

---

## 🔑 KEY CHANGES FROM v1.0

1. **Recent-window trigger detection** — the three Trigger-Type event rules (structure break, reversal candle, EMA 9/21 cross) now scan the **last 3 hourly bars** instead of only the most recent one, so a periodic scanner catches triggers that fired between runs. The structure-break rule also requires price to be **still holding** above the broken level.
2. **Graduated 1H fallback tiers** — added two lower Trigger-Type tiers ("1H EMA 9 > EMA 21" = 3, "close > 1H EMA 9" = 2) so a hourly chart that has already turned up at the 50-day earns partial credit. This removes the v1 **6-or-0 cliff** that kept Section 6 at ~0 for nearly every stock.
3. **Widened Trigger Timing** — replaced the single "within 1–2 days" bucket with two tiers ("1–3 days" = 2, "4–6 days" = 1).
4. **Off-hours volume** — the shared `triggerVolume` rule now skips a trailing zero-volume bar, so the 1H volume tiers score correctly when the strategy is evaluated while the market is closed. Section weighting is otherwise unchanged from v1.
