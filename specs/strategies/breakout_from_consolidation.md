# Strategy: Breakout from Consolidation — Entry Checklist

## Evaluation Anchor

The strategy is anchored to the **most recent bar**: it returns a signal only when that bar qualifies as the breakout day. On any bar that doesn't close above the consolidation high, the mandatory "Breakout confirmed" gate fails and the strategy returns no trade. This is by design — breakouts are discrete events, not continuous states.

---

## MANDATORY CONDITIONS

_All must be true or no trade._ The list was deliberately tightened during the v1.0 calibration pass: gates that the breakout bar itself routinely violates (BB squeeze, prior-trend rally) were demoted to scoring tiers, and several thresholds were relaxed so the strategy actually fires on real-world setups.

- [ ] **Consolidation is clear** — Price moved sideways for **10–40 trading days** before the current bar, with a range width of **2–10%** (both bounds enforced by a single detection rule)
- [ ] **Not in a sustained downtrend** — Stock returned **≥ −5%** over the **60 trading days before the consolidation began** (i.e. the base did not form during a real decline; mild pullbacks are fine)
- [ ] **Breakout confirmed** — Price **closed above the consolidation high**
- [ ] **Not extended** — Close is **within 5%** of the consolidation high (no chasing the move)
- [ ] **Volume confirmed** — Breakout day volume was **at least 1.3×** the **20-day average**
- [ ] **Consolidation volume sane** — During the consolidation window, **no single bar's volume exceeded 3×** the 20-day average (filters out erratic / news-spike bases)
- [ ] **Market supports longs** — **SPY is above its 50-day SMA**
- [ ] **Broad market not under pressure** — **VIX below 30** (additional layer beyond the SPY filter)
- [ ] **No earnings soon** — No earnings report within **5 trading days**
- [ ] **Liquid enough** — **20-day average dollar volume ≥ \$5M**

If all mandatory conditions are met, go to scoring.

> Note: the BB(20,2) squeeze check and the "strong prior trend" check live in the scoring sections rather than as mandatory gates. The breakout bar itself widens BB by definition, so a mandatory squeeze-on-the-current-bar gate would reject nearly every confirmed breakout. Both items still influence the final score (Section 1 BB Squeeze and Section 3 Prior Uptrend).

---

## SCORING (0–100)

\*Enter only if score is **60 or higher\***
_Choose one item per group unless noted otherwise._

### 1) Consolidation Quality (Max 25)

**Range Width**

- [ ] **2–5%** = 12
- [ ] **>5–7%** = 8
- [ ] **>7–12%** = 4

**Duration**

- [ ] **25–40 days** = 8
- [ ] **15–24 days** = 5
- [ ] **10–14 days** = 3

**BB Squeeze Strength**

- [ ] **At 90-day low** = 5
- [ ] **In lowest 10% of 90 days** = 3
- [ ] **In lowest 25% of 90 days** = 1

---

### 2) Breakout Quality (Max 30)

**Volume**

- [ ] **>2.5× average** = 15
- [ ] **2.0–2.5×** = 12
- [ ] **1.5–2.0×** = 8

**Close Strength**

- [ ] **Closed in top 10% of day's range** = 10
- [ ] **Closed in top 25%** = 6
- [ ] **Closed above breakout but mid-range (top 50%)** = 3

**Candle Size** _(breakout candle range vs ATR(14))_

- [ ] **> 1.5× ATR(14)** = 5
- [ ] **Normal-size candle (0.8×–1.5× ATR)** = 3
- [ ] **Small / weak candle (< 0.8× ATR)** = 0

---

### 3) Prior Trend Context (Max 15)

**Strength of Prior Uptrend** _(measured from the 4–8 weeks before consolidation began)_

- [ ] **Gain ≥ 15% over 4+ weeks** = 8
- [ ] **Gain 8–15% over 2–4 weeks** = 5
- [ ] **Gain < 8% or non-monotonic / choppy advance** = 2

**Larger Structure**

- [ ] **At a 52-week high or breaking a base 6+ months long** = 7
- [ ] **Breaking an intermediate base (8–12 weeks long)** = 4
- [ ] **Below a 6-month high (still under major resistance)** = 1

---

### 4) Relative Strength vs SPY (Max 10)

_Computed as the percentage-point difference between the stock's 60-day return and SPY's 60-day return._

- [ ] **Outperformed SPY by ≥ 5% over last 60 days** = 10
- [ ] **Outperformed SPY by 0–5%** = 6
- [ ] **Roughly matched SPY (−2% to 0%)** = 3
- [ ] **Underperformed SPY (worse than −2%)** = 0

---

### 5) Momentum Confirmation (Max 10) — _additive, both can score_

- [ ] **MACD bullish cross above zero within the last 5 bars** _(MACD line crosses signal line while both are above zero)_ = 5
- [ ] **RSI(14) above 60 on the breakout bar** = 5

---

### 6) Sector & Market Support (Max 10)

**Sector**

- [ ] **Sector ETF also breaking out** _(closed above its own 20-day high)_ **OR sector 30-day return > +5%** = 5
- [ ] **Sector ETF in mild uptrend** _(above its 50-day EMA but not breaking out)_ = 3
- [ ] **Sector ETF weak** _(at or below its 50-day EMA)_ = 0

**Volatility Regime**

- [ ] **VIX below 18 AND falling** _(today's VIX < VIX from 5 trading days ago)_ = 5
- [ ] **VIX 18–22 (any direction)** = 3
- [ ] **VIX above 22** = 0

---

## MANUAL-REVIEW WARNINGS

_These can't be detected reliably by automated rules. Inspect each manually before entering._

- [ ] Stock is breaking out **directly into major resistance** — prior multi-year highs, well-known ceiling, etc.
- [ ] Setup is based mainly on a **news spike** — earnings beat, M&A, FDA approval, analyst upgrade, etc.
- [ ] Breakout volume looks **erratic** rather than steadily rising _(e.g., one anomalous bar carrying the average)_

> Note: the original disqualifiers "extension > 5% above base high", "thin breakout volume", and "broad market under pressure" have been promoted to mandatory gates above. Only the three discretionary items remain in this section. The BB squeeze and "strong prior trend" checks were demoted from mandatory to scoring during the v1.0 calibration pass — see the note at the top of "Mandatory Conditions".

---

## SCORING SUMMARY

| Section                    |     Max |      Score |
| -------------------------- | ------: | ---------: |
| 1. Consolidation Quality   |      25 |     \_\_\_ |
| 2. Breakout Quality        |      30 |     \_\_\_ |
| 3. Prior Trend Context     |      15 |     \_\_\_ |
| 4. Relative Strength       |      10 |     \_\_\_ |
| 5. Momentum Confirmation   |      10 |     \_\_\_ |
| 6. Sector & Market Support |      10 |     \_\_\_ |
| **TOTAL**                  | **100** | **\_\_\_** |

---

## ENTRY DECISION

- **80–100** = Excellent — Risk **1.0%**
- **70–79** = Strong — Risk **0.75%**
- **60–69** = Acceptable — Risk **0.5%**
- **Below 60** = **No trade**

---

## BASIC EXECUTION RULES

- [ ] **Entry** — Enter on the breakout close, or the next day if price holds above the breakout level
- [ ] **Stop** — Place stop below the breakout-day low or below the consolidation low (whichever is closer)
- [ ] **Failure rule** — Exit if price closes back inside the base
- [ ] **No follow-through** — Exit or reduce if no progress within 3–5 trading days

---

## SIMPLE DEFINITIONS

- **Consolidation window** = the most recent 10–40-day stretch where price moved sideways before the current bar
- **Consolidation start** = first bar of the consolidation window (used as the reference point for "trend before base")
- **Consolidation width** = `(highest high − lowest low) / breakout level`
- **Breakout level** = highest close (or high) inside the consolidation window
- **Average dollar volume** = `average daily volume over 20 days × current price`
- **Top X% of day's range** = `(close − low) / (high − low) ≥ (1 − X%)`
- **ATR(14)** = 14-day Average True Range
- **BB(20,2) width** = `(upper band − lower band) / middle band`, expressed as a percentage of the middle band
- **MACD bullish cross above zero** = MACD line crosses above the signal line **while both lines are above zero**
- **RS vs SPY (60d)** = stock's 60-day return minus SPY's 60-day return, in percentage points
