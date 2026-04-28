# Strategy: RSI Mean Reversion (Range-Bound) — Entry Checklist

## Evaluation Anchor

The strategy is anchored to the **most recent daily bar**: it returns a signal only when *today's* close is oversold near the lower edge of a confirmed horizontal range, and the bar itself shows a bullish reversal on capitulation volume. On any bar that doesn't satisfy this combination inside a non-trending stock, the mandatory gates fail and the strategy returns no trade. Mean reversion is a discrete-event entry, not a continuous state.

The strategic edge is the **opposite** of the trend-following strategies in this library: oversold readings *persist* in trends but *revert* in ranges. This strategy fires only after gating out trending stocks first, then fading extremes within the confirmed range.

> **Daily-bar evaluation only.** This strategy uses only daily bars; intraday session-time filters do not apply at the engine level. If a trader chooses to enter intraday on the day the daily bar prints, restrict execution to **10:00 AM – 3:00 PM exchange time** to avoid open/close noise.

---

## MANDATORY CONDITIONS

_All must be true or no trade._ Any failure halts scoring.

- [ ] **Range-bound regime** — Daily **ADX(14) < 20** (no directional trend in force)
- [ ] **Defined horizontal range** — Over the last **60 trading days**, the range width is **≤ 7× ATR(14)**, and price has touched both the upper and lower bound at least **2× each** (touch tolerance = within 2% of the bound)
- [ ] **Oversold trigger** — **RSI(2) < 10** OR **RSI(14) < 30** on the daily chart (current bar)
- [ ] **Lower BB tag** — Today's bar **touched or pierced the lower Bollinger Band(20, 2)**
- [ ] **Bullish reversal candle** — Current bar is a hammer, bullish engulfing, piercing line, or simply a green close after a sequence of 2+ red bars
- [ ] **Reversal volume confirmed** — Today's volume is **above the 20-day average**
- [ ] **Liquidity floor** — 20-day average dollar volume **≥ \$5M**
- [ ] **No earnings within 5 trading days** — Avoids event risk on a counter-trend trade
- [ ] **Market not in panic** — **VIX < 25** AND **SPY not down 3% or more on the day**

If all mandatory conditions are met, go to scoring.

> Note: this strategy deliberately fades weakness, so the gates above are stricter than trend-following strategies. The ADX gate and the range-definition gate together ensure we're only trading reversion inside a confirmed sideways structure — a stock in a real downtrend will show ADX >> 20, which the ADX gate catches directly. Promoting the reversal candle and volume from scoring to mandatory rejects "still falling at support" setups, which are the highest-failure mean-reversion entries.

---

## SCORING (0–100)

_Enter only if score is **60 or higher**._
_Choose one item per group unless noted otherwise._

### 1) Range Quality (Max 30)

**Range Definition** _(touches at upper/lower bound within 2% tolerance)_

- [ ] **3+ touches at each bound (crisp range)** = 12
- [ ] **2 touches at each bound (acceptable)** = 8
- [ ] **Loosely defined (mixed touches)** = 4

**Range Duration** _(weeks since the first qualifying touch)_

- [ ] **6+ weeks (mature range)** = 8
- [ ] **4–6 weeks (developed)** = 5
- [ ] **3–4 weeks (young)** = 3

**ADX Reading** _(daily, lower = stronger range regime)_

- [ ] **ADX < 15 (strong range regime)** = 5
- [ ] **ADX 15–20 (acceptable)** = 3

**Range Width** _(ATR-normalized: 60-day high − 60-day low, in ATR(14) units)_

- [ ] **≤ 3× ATR (narrow, predictable)** = 5
- [ ] **3–5× ATR (moderate)** = 3
- [ ] **5–7× ATR (wide but contained)** = 1

---

### 2) Oversold Quality (Max 25) — _additive across all four groups_

**RSI(2) Reading** _(daily, current bar — Connors short-period oscillator)_

- [ ] **RSI(2) < 5 (extreme)** = 10
- [ ] **RSI(2) 5–10 (deep)** = 6
- [ ] **RSI(2) 10–15 (moderate)** = 3

**RSI(14) Reading** _(daily, current bar)_

- [ ] **RSI(14) < 25 (extreme oversold)** = 7
- [ ] **RSI(14) 25–30 (deep)** = 4
- [ ] **RSI(14) 30–35 (mild)** = 1

**Consecutive Red Days into Support** _(red bars immediately preceding the current bar)_

- [ ] **4+ consecutive red bars (capitulation)** = 5
- [ ] **2–3 consecutive red bars** = 3
- [ ] **1 red bar** = 1

**Bullish RSI Divergence** _(additive bonus)_

- [ ] **Price made a lower low vs the prior swing low while RSI(14) made a higher low** = +3

---

### 3) Support Confluence (Max 20)

**Confluence Count at the Bounce Level**

- [ ] **3+ factors confluent (range floor + 200 SMA + Fibonacci 78.6% retrace + prior swing low, etc.)** = 12
- [ ] **2 factors confluent** = 8
- [ ] **Range floor only** = 4

**Distance from Range Floor** _(closeness to the literal 60-day low)_

- [ ] **Within 0.25× ATR(14) of the range floor** = 8
- [ ] **Within 0.5× ATR** = 5
- [ ] **Within 1× ATR** = 2

---

### 4) Reversal Candle Quality (Max 15)

**Candle Type** _(best-scoring pattern wins)_

- [ ] **Bullish engulfing fully engulfing the prior 2+ red candles** = 10
- [ ] **Hammer with lower wick > 2× the body** = 8
- [ ] **Pin bar / doji at support** = 5
- [ ] **Simple green close after a red sequence (no specific pattern)** = 3

**Volume on the Reversal Bar** _(vs 20-day average)_

- [ ] **> 2.0× average (strong capitulation/absorption)** = 5
- [ ] **1.5–2.0× average** = 4
- [ ] **1.0–1.5× average** = 3

---

### 5) Bollinger Band Position & Mean Distance (Max 10)

**BB Position** _(how cleanly the bar interacts with the lower BB)_

- [ ] **Pierced lower BB and closed back inside** = 6
- [ ] **Tagged lower BB exactly** = 4
- [ ] **Within 0.5× ATR of lower BB** = 2

**Distance from 60-Day Midpoint** _(reward better risk/reward to mean target)_

- [ ] **≥ 10% below midpoint** = 4
- [ ] **5–10% below midpoint** = 2

---

## MANUAL-REVIEW WARNINGS

_These can't be detected reliably by automated rules. Inspect each manually before entering._

- [ ] **Major news event** — earnings miss, guidance cut, downgrade, FDA reject, lawsuit, etc. Oversold may be justified, not noise.
- [ ] **Range breakdown in progress** — the most recent close is below the prior 60-day range low; this could be a regime change rather than a dip to fade.
- [ ] **Sector in clear breakdown** — fading sector-wide weakness has a low edge regardless of the individual stock setup.

> If any of these apply, downgrade the trade — reduce size or skip entirely. The automated score will not penalize for these; they require human judgment.

---

## SCORING SUMMARY

| Section                            |     Max |      Score |
| ---------------------------------- | ------: | ---------: |
| 1. Range Quality                   |      30 |     \_\_\_ |
| 2. Oversold Quality                |      25 |     \_\_\_ |
| 3. Support Confluence              |      20 |     \_\_\_ |
| 4. Reversal Candle Quality         |      15 |     \_\_\_ |
| 5. BB Position & Mean Distance     |      10 |     \_\_\_ |
| **TOTAL**                          | **100** | **\_\_\_** |

---

## ENTRY DECISION

- **80–100** = Excellent setup — Risk **0.75%** of account
- **70–79** = Strong setup — Risk **0.5%** of account
- **60–69** = Acceptable setup — Risk **0.4%** of account
- **Below 60** = **DO NOT ENTER**

> Counter-trend strategies should size smaller than trend strategies at equivalent scores. The decision ladder caps top risk at 0.75% (vs 1.5–2% for the v2 pullback strategy) because mean-reversion failures (range breakdowns) tend to be sharp and fast.

---

## BASIC EXECUTION RULES

- [ ] **Entry** — Enter on the close of the qualifying daily bar, OR the next-day open if RSI(14) is still below 35
- [ ] **Stop** — Place stop **below the 60-day range low minus 0.5× ATR(14)** (gives room for one false break of support)
- [ ] **Target 1** — **Mid-range** (60-day midpoint price) — exit half the position
- [ ] **Target 2** — **Upper band** of the range — trail the rest, or exit at the upper bound minus 0.5× ATR
- [ ] **Failure rule** — Exit if **RSI(14) doesn't recover above 40 within 5 trading days**, or if a daily close prints **more than 1× ATR below the 60-day range low** (range breakdown)
- [ ] **Hard kill switch** — If **ADX(14) rises above 25 while in trade**, exit immediately. The regime is changing from range-bound to trending, and the mean-reversion edge is gone.
- [ ] **Time stop** — Close any remaining position after **15 trading days** if neither target has been hit; the mean-reversion edge decays quickly

---

## SIMPLE DEFINITIONS

- **ADX(14)** = 14-period Average Directional Index — measures trend strength regardless of direction; values below 20 indicate non-trending behavior
- **ATR(14)** = 14-day Average True Range
- **RSI(14)** = 14-day Relative Strength Index
- **RSI(2)** = 2-day Relative Strength Index — the Connors short-period oscillator, the canonical mean-reversion signal; oscillates much faster than RSI(14)
- **EMA N** = N-period Exponential Moving Average
- **60-day range** = the high-to-low band over the most recent 60 trading days, ending at the current bar
- **Range width (ATR units)** = `(60-day high − 60-day low) / ATR(14)` — ATR-normalized so it compares apples-to-apples across stocks of different volatility; mandatory gate allows up to 7× ATR, scoring rewards narrower ranges
- **60-day midpoint** = `(60-day high + 60-day low) / 2`
- **Touch** = a daily high (for upper bound) or low (for lower bound) within 2% of the bound price
- **Bollinger Bands(20, 2)** = 20-period SMA ± 2 standard deviations
- **Consecutive red days** = count of bars where close < open, immediately preceding the current bar (chain breaks at the first non-red bar)
- **Bullish RSI divergence** = price prints a lower low vs the prior swing low, while RSI prints a higher low
- **Confluence factor** = any of: range floor, 200-period SMA, Fibonacci retracement (61.8% / 78.6%), prior swing low, round-number support, polarity flip from prior resistance

---

## NOTES ON STRATEGY EDGE

This strategy has a **fundamentally different statistical profile** from the trend-following strategies in the library:

1. **Win rate is higher, average winner is smaller.** Mean reversion typically wins 55–65% of the time but earns 1:1 to 1.5:1 R per win, vs trend strategies that win 35–45% but earn 2:1+ per win.
2. **Failure mode is fast.** When a range breaks, the loss happens quickly — that's why the failure rule exits on a single decisive close below the range low rather than waiting for confirmation, and why the hard kill switch fires the moment ADX climbs above 25.
3. **It is a regime-dependent strategy.** It works in sideways markets and fails badly in trends or panics. The ADX gate and the VIX (< 25) / SPY gate together filter out trending and stressed regimes — but no filter is perfect, so position sizing is capped at 0.75% even on excellent setups.
4. **Pair carefully with trend strategies.** Running this alongside the v2 pullback or v1 breakout strategy gives portfolio diversification across regimes — when one is firing, the other typically isn't.
