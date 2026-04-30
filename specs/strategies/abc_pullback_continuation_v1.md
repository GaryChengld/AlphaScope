# Strategy: ABC Pullback Continuation (Bullish Only) v1.0 — — Entry Checklist

## GLOBAL DEFINITIONS

- ATR = ATR(14) on daily timeframe
- EMA20 = 20-period EMA (daily)
- EMA50 = 50-period EMA (daily)
- RSI = RSI(14) (daily)
- B_point = highest close in last 20 bars
- A_point = lowest low within 20 bars before B_point
- Pullback_low = lowest low after B_point until current bar
- HL = most recent swing low before B_point (pivot low using 3-bar rule)

---

## MANDATORY CONDITIONS (Boolean)

All must be TRUE

### 1. Higher timeframe uptrend

close > EMA50  
AND EMA20 > EMA50  
AND count(HH over last 20 bars) ≥ 2  
AND count(HL over last 20 bars) ≥ 2

(HH = high[i] > high[i-1], HL = low[i] > low[i-1])

---

### 2. A→B impulse leg

(B_point - A_point) ≥ 1.5 \* ATR  
AND bullish_candle_ratio(A→B) ≥ 0.6  
AND max_consecutive_bearish_candles(A→B) ≤ 3  
AND B_point > previous 20-bar high

---

### 3. Valid pullback (B→C)

pullback_size = B_point - close

pullback_size ≥ 0.5 _ ATR  
AND pullback_size ≤ 4 _ ATR  
AND fib_retracement(A→B, current_close) BETWEEN 0.236 AND 0.786

---

### 4. Structure intact

close > HL

---

### 5. Near support zone

distance_to_EMA20 ≤ 1.5 _ ATR  
OR distance_to_EMA50 ≤ 1.5 _ ATR  
OR distance_to_fib_level(0.382, 0.5, 0.618) ≤ 1.5 \* ATR

---

### 6. No trend exhaustion

RSI < 70  
AND NOT bearish_divergence(last 10 bars)  
AND (B_point - EMA20_at_B) ≤ 2 \* ATR

---

## SCORING SYSTEM

---

### 1) Trend Structure (Max 25)

score_trend = 0

IF HH_count ≥ 3 AND HL_count ≥ 3 → +10  
ELSE IF HH_count ≥ 2 → +7  
ELSE → +4

IF bullish_ratio(A→B) ≥ 0.7 → +8  
ELSE IF ≥ 0.6 → +5  
ELSE → +2

IF EMA alignment (EMA20 > EMA50) AND 4H EMA9 > EMA21 > EMA50 → +7  
ELSE IF only daily aligned → +4  
ELSE → +0

---

### 2) Pullback Quality (Max 25)

fib = fib_retracement(A→B, current_close)

IF 0.382 ≤ fib ≤ 0.5 → +10  
ELSE IF 0.5 < fib ≤ 0.618 → +7  
ELSE IF 0.236 ≤ fib < 0.382 → +5  
ELSE → +2

avg_body_pullback ≤ 0.5 \* avg_body_impulse → +7  
ELSE IF ≤ 0.8 → +4  
ELSE → +1

volume_ratio = avg_volume_last5 / avg_volume_20

IF volume_ratio < 0.8 AND monotonic_decreasing(volume_last3) → +5  
ELSE IF volume_ratio < 1 → +3  
ELSE → +1

IF pullback_days BETWEEN 3 AND 10 → +3  
ELSE IF ≤ 20 → +2  
ELSE → +1

---

### 3) C-Point Quality (Max 20)

confluence_count = count(  
 near(EMA20, 0.5*ATR),  
 near(EMA50, 0.5*ATR),  
 near(Fib levels, 0.5*ATR),  
 near(previous swing high, 0.5*ATR),  
 near(round_number, 0.5\*ATR)  
)

IF confluence_count ≥ 3 → +10  
ELSE IF ≥ 2 → +7  
ELSE → +3

lower_wick_ratio = lower_wick / body

IF lower_wick_ratio ≥ 2 AND close_position ≥ 0.67 → +6  
ELSE IF lower_wick_ratio ≥ 1 → +3  
ELSE → +0

IF low > HL → +4  
ELSE IF (HL - low) ≤ 0.3 \* ATR → +2  
ELSE → +0

---

### 4) Momentum (Max 10)

IF close > last_lower_high → +5  
ELSE IF 2 consecutive closes in top 33% of range → +3  
ELSE → +0

IF RSI BETWEEN 40 AND 50 AND RSI increasing → +5  
ELSE IF RSI BETWEEN 50 AND 55 → +3  
ELSE → +1

---

### 5) Lower Timeframe Trigger (Max 15)

(Only if score 1–4 ≥ 40)

IF 1H close > last 1H swing high → +8  
ELSE IF bullish_reversal_candle_1H → +6  
ELSE IF EMA9 crosses EMA21 → +5

volume_ratio_1H = trigger_volume / avg_1H_volume

IF ≥ 1.5 → +4  
ELSE IF ≥ 1.2 → +2  
ELSE → +1

IF days_since_C ≤ 3 → +3  
ELSE → +1

---

### 6) Market Context (Max 5)

IF SPY > SPY_EMA50 AND VIX < 20 → +3  
ELSE IF SPY > SPY_EMA50 → +1  
ELSE → +0

IF VIX_5EMA < VIX_20EMA → +2  
ELSE → +1

---

## ENTRY RULE

IF total_score ≥ 60 → ENTER LONG  
ELSE → NO TRADE

---

## RISK MANAGEMENT

STOP = C_low - 0.5 \* ATR  
TARGET = B_point OR measured_move(A→B)

IF no follow-through in 5 bars → EXIT
