import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import {
  last,
  lastN,
  computeAbcPoints,
  paramNum,
  paramStr,
  paramArr,
  paramNumOpt,
} from './helpers';

// ─── Fib retracement (ABC-specific) ─────────────────────────────────────────
// The generic fibRetracement rule uses findSwingHigh (highest HIGH) as B and
// measures retracement relative to the post-B pullback low. For ABC we need:
//   pct = (B_close − current_close) / (B_close − A_low) × 100
// where B_close = highest CLOSE in lookback and A_low = lowest LOW before B.

export function abcFibRetracement(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback',  20);
  const min       = paramNum(params, 'min');
  const max       = paramNum(params, 'max');

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const abc   = computeAbcPoints(tf.candles, lookback);
  if (!abc) return { pass: false, detail: 'Cannot identify A→B points' };

  const close = last(tf.candles)?.close;
  if (close == null) return { pass: false, detail: 'No close data' };

  const range = abc.bPoint - abc.aPoint;
  if (range <= 0) return { pass: false, detail: 'B_close ≤ A_low — no valid impulse' };

  const pct  = (abc.bPoint - close) / range * 100;
  const pass = pct >= min && pct <= max;
  return {
    pass,
    detail: `A→B fib retracement ${pct.toFixed(1)}% (B $${abc.bPoint.toFixed(2)}, A $${abc.aPoint.toFixed(2)})`,
  };
}

// ─── Mandatory rules ──────────────────────────────────────────────────────────

export function abcHHHL(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback',  20);
  const minHH     = paramNum(params, 'minHH',     2);
  const minHL     = paramNum(params, 'minHL',     0);

  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback + 1)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const slice = lastN(tf.candles, lookback);
  let hhCount = 0, hlCount = 0;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].high > slice[i - 1].high) hhCount++;
    if (slice[i].low  > slice[i - 1].low)  hlCount++;
  }

  const pass = hhCount >= minHH && (minHL === 0 || hlCount >= minHL);
  return {
    pass,
    detail: `${hhCount} HH and ${hlCount} HL in last ${lookback} bars`,
  };
}

export function abcImpulse(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe        = paramStr(params, 'timeframe',        '1D');
  const atrPeriod        = paramNum(params, 'atrPeriod',        14);
  const lookback         = paramNum(params, 'lookback',         20);
  const minAtrSize       = paramNum(params, 'minAtrSize',       1.5);
  const minBullishRatio  = paramNum(params, 'minBullishRatio',  0.6);
  const maxConsecBearish = paramNum(params, 'maxConsecBearish', 3);
  const maxOverextAtr    = paramNum(params, 'maxOverextAtr',    2);

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const atr = last(tf.atr[atrPeriod]);
  if (!atr) return { pass: false, detail: `No ATR${atrPeriod} data` };

  const abc = computeAbcPoints(tf.candles, lookback);
  if (!abc) return { pass: false, detail: 'Cannot identify A→B points' };

  // Build impulse slice from A to B using absolute indices (A may be outside lookback)
  const n       = tf.candles.length;
  const bAbsIdx = n - 1 - abc.barsAgo;
  const aAbsIdx = bAbsIdx - abc.aBarsBefore;
  const impSlice = tf.candles.slice(aAbsIdx, bAbsIdx + 1);
  if (impSlice.length < 2) return { pass: false, detail: 'Impulse segment too short' };

  // Impulse size
  const impulseSize = abc.bPoint - abc.aPoint;
  if (impulseSize < minAtrSize * atr)
    return { pass: false, detail: `A→B ${(impulseSize / atr).toFixed(2)}× ATR < ${minAtrSize}× required` };

  // Bullish candle ratio
  const bullish = impSlice.filter(c => c.close >= c.open).length;
  const ratio   = bullish / impSlice.length;
  if (ratio < minBullishRatio)
    return { pass: false, detail: `A→B bullish ratio ${(ratio * 100).toFixed(0)}% < ${(minBullishRatio * 100).toFixed(0)}%` };

  // Max consecutive bearish candles
  let maxRun = 0, curRun = 0;
  for (const c of impSlice) {
    curRun = c.close < c.open ? curRun + 1 : 0;
    if (curRun > maxRun) maxRun = curRun;
  }
  if (maxRun > maxConsecBearish)
    return { pass: false, detail: `A→B max consecutive bearish ${maxRun} > ${maxConsecBearish} allowed` };

  // B_point > prior 20-bar high (window before the lookback)
  const priorCandles = tf.candles.slice(-lookback - 20, -lookback);
  if (priorCandles.length > 0) {
    const priorHigh = Math.max(...priorCandles.map(c => c.high));
    if (abc.bPoint <= priorHigh)
      return { pass: false, detail: `B $${abc.bPoint.toFixed(2)} ≤ prior 20-bar high $${priorHigh.toFixed(2)}` };
  }

  // Overextension: (B − EMA20_at_B) ≤ maxOverextAtr × ATR
  const ema20 = tf.ema[20];
  if (ema20 && ema20.length > abc.barsAgo) {
    const ema20AtB = ema20[ema20.length - 1 - abc.barsAgo];
    if (ema20AtB != null && (abc.bPoint - ema20AtB) > maxOverextAtr * atr)
      return {
        pass: false,
        detail: `B overextension ${((abc.bPoint - ema20AtB) / atr).toFixed(2)}× ATR > ${maxOverextAtr}× limit`,
      };
  }

  return {
    pass: true,
    detail: `A→B ${(impulseSize / atr).toFixed(2)}× ATR, ${(ratio * 100).toFixed(0)}% bullish, max ${maxRun} consec bearish`,
  };
}

// abcStructure checks the close (mandatory) or current bar's low (scoring) vs HL.
// checkField: 'close' | 'low' | 'low_near'
export function abcStructure(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe    = paramStr(params, 'timeframe',  '1D');
  const lookback     = paramNum(params, 'lookback',   20);
  const atrPeriod    = paramNum(params, 'atrPeriod',  14);
  const checkField   = paramStr(params, 'checkField', 'close');
  const maxAtrFrac   = paramNumOpt(params, 'maxAtrFraction'); // for 'low_near'

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const candle = last(tf.candles);
  const atr    = last(tf.atr[atrPeriod]);
  const abc    = computeAbcPoints(tf.candles, lookback);

  if (!candle || !abc) return { pass: false, detail: 'Insufficient data' };

  if (checkField === 'low') {
    const pass = candle.low > abc.hl;
    return { pass, detail: `Bar low $${candle.low.toFixed(2)} ${pass ? '>' : '≤'} HL $${abc.hl.toFixed(2)}` };
  }

  if (checkField === 'low_near') {
    const frac = maxAtrFrac ?? 0.3;
    if (!atr) return { pass: false, detail: `No ATR${atrPeriod} data` };
    const gap  = abc.hl - candle.low;
    const pass = gap >= 0 && gap <= frac * atr;
    return { pass, detail: `HL gap ${gap.toFixed(2)} vs ${frac}× ATR${atrPeriod} ${(frac * atr).toFixed(2)}` };
  }

  // default: 'close'
  const pass = candle.close > abc.hl;
  return { pass, detail: `Close $${candle.close.toFixed(2)} ${pass ? '>' : '≤'} HL $${abc.hl.toFixed(2)}` };
}

export function abcNearSupport(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe   = paramStr(params, 'timeframe',  '1D');
  const emaPeriods  = paramArr(params, 'emaPeriods', [20, 50]);
  const fibLevels   = paramArr(params, 'fibLevels',  [0.382, 0.5, 0.618]);
  const atrMultiple = paramNum(params, 'atrMultiple', 1.5);
  const atrPeriod   = paramNum(params, 'atrPeriod',  14);
  const lookback    = paramNum(params, 'lookback',   20);

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  if (close == null || atr == null) return { pass: false, detail: 'Insufficient data' };

  const threshold = atrMultiple * atr;

  for (const p of emaPeriods) {
    const emaVal = last(tf.ema[p]);
    if (emaVal != null && Math.abs(close - emaVal) <= threshold)
      return { pass: true, detail: `$${close.toFixed(2)} within ${atrMultiple}× ATR of EMA${p} $${emaVal.toFixed(2)}` };
  }

  const abc = computeAbcPoints(tf.candles, lookback);
  if (abc) {
    const swing = abc.bPoint - abc.aPoint;
    for (const fib of fibLevels) {
      const fibPrice = abc.bPoint - fib * swing;
      if (Math.abs(close - fibPrice) <= threshold)
        return { pass: true, detail: `$${close.toFixed(2)} within ${atrMultiple}× ATR of Fib ${(fib * 100).toFixed(1)}% $${fibPrice.toFixed(2)}` };
    }
  }

  return {
    pass: false,
    detail: `$${close.toFixed(2)} not within ${atrMultiple}× ATR of EMA${emaPeriods.join('/')} or fib levels`,
  };
}

export function abcNoDivergence(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const rsiPeriod = paramNum(params, 'rsiPeriod', 14);
  const maxRsi    = paramNum(params, 'maxRsi',    70);
  const lookback  = paramNum(params, 'lookback',  10);

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const rsiSeries = tf.rsi[rsiPeriod] ?? [];
  const rsiNow    = last(rsiSeries);
  if (rsiNow == null) return { pass: false, detail: `No RSI${rsiPeriod} data` };

  if (rsiNow >= maxRsi)
    return { pass: false, detail: `RSI(${rsiPeriod}) ${rsiNow.toFixed(1)} ≥ ${maxRsi} (overbought)` };

  if (rsiSeries.length < lookback + 5) {
    return { pass: true, detail: `RSI(${rsiPeriod}) ${rsiNow.toFixed(1)}, too few bars for divergence check` };
  }

  const closes = tf.candles.map(c => c.close);
  const rslice = rsiSeries.slice(-lookback);
  const cslice = closes.slice(-lookback);

  // Bearish divergence: price makes higher high while RSI makes lower high
  const highs: number[] = [];
  for (let i = 1; i < cslice.length - 1; i++) {
    if (cslice[i] > cslice[i - 1] && cslice[i] > cslice[i + 1] &&
        rslice[i] > rslice[i - 1] && rslice[i] > rslice[i + 1]) {
      highs.push(i);
    }
  }

  if (highs.length >= 2) {
    const i1 = highs[highs.length - 2];
    const i2 = highs[highs.length - 1];
    if (cslice[i2] > cslice[i1] && rslice[i2] < rslice[i1]) {
      return {
        pass: false,
        detail: `Bearish divergence: price $${cslice[i1].toFixed(2)}→$${cslice[i2].toFixed(2)}, RSI ${rslice[i1].toFixed(1)}→${rslice[i2].toFixed(1)}`,
      };
    }
  }

  return { pass: true, detail: `RSI(${rsiPeriod}) ${rsiNow.toFixed(1)}, no bearish divergence` };
}

// ─── Scoring rules ────────────────────────────────────────────────────────────

export function abcImpulseQuality(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe       = paramStr(params, 'timeframe',       '1D');
  const lookback        = paramNum(params, 'lookback',        20);
  const minBullishRatio = paramNum(params, 'minBullishRatio', 0.6);

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const abc = computeAbcPoints(tf.candles, lookback);
  if (!abc) return { pass: false, detail: 'Cannot identify A→B points' };

  const n        = tf.candles.length;
  const bAbsIdx  = n - 1 - abc.barsAgo;
  const aAbsIdx  = bAbsIdx - abc.aBarsBefore;
  const impSlice = tf.candles.slice(aAbsIdx, bAbsIdx + 1);
  if (impSlice.length < 2) return { pass: false, detail: 'Impulse segment too short' };

  const bullish = impSlice.filter(c => c.close >= c.open).length;
  const ratio   = bullish / impSlice.length;
  const pass    = ratio >= minBullishRatio;
  return {
    pass,
    detail: `A→B bullish ratio ${(ratio * 100).toFixed(0)}% (${bullish}/${impSlice.length} bars)`,
  };
}

export function abcCPointWick(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe    = paramStr(params, 'timeframe',    '1D');
  const minWickRatio = paramNum(params, 'minWickRatio', 1);
  const minClosePos  = paramNum(params, 'minClosePos',  0);

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const c = last(tf.candles);
  if (!c) return { pass: false, detail: 'No candle data' };

  const body      = Math.abs(c.close - c.open);
  const lowerWick = Math.min(c.close, c.open) - c.low;
  const barRange  = c.high - c.low;

  if (body <= 0 || barRange <= 0)
    return { pass: false, detail: 'Doji or zero-range candle' };

  const wickRatio = lowerWick / body;
  const closePos  = (c.close - c.low) / barRange;
  const pass      = wickRatio >= minWickRatio && (minClosePos === 0 || closePos >= minClosePos);

  return {
    pass,
    detail: `Lower wick ${wickRatio.toFixed(2)}× body, close at ${(closePos * 100).toFixed(0)}% of bar range`,
  };
}

export function abcPullbackBodyRatio(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback',  20);
  const max       = paramNum(params, 'max');

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const abc = computeAbcPoints(tf.candles, lookback);
  if (!abc) return { pass: false, detail: 'Cannot identify A→B points' };

  const n        = tf.candles.length;
  const bAbsIdx  = n - 1 - abc.barsAgo;
  const aAbsIdx  = bAbsIdx - abc.aBarsBefore;
  const impSlice  = tf.candles.slice(aAbsIdx, bAbsIdx + 1);
  const pullSlice = tf.candles.slice(bAbsIdx + 1);   // all bars after B to current

  if (impSlice.length < 2 || pullSlice.length < 1)
    return { pass: false, detail: 'Insufficient impulse or pullback bars' };

  const avgImpBody  = impSlice.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / impSlice.length;
  const avgPullBody = pullSlice.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / pullSlice.length;

  if (avgImpBody <= 0) return { pass: false, detail: 'Zero impulse body size' };

  const ratio = avgPullBody / avgImpBody;
  const pass  = ratio <= max;
  return {
    pass,
    detail: `Pullback avg body ${(ratio * 100).toFixed(0)}% of impulse avg body (max ${(max * 100).toFixed(0)}%)`,
  };
}

export function abcDaysSinceC(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback',  20);
  const max       = paramNum(params, 'max',       3);

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const abc = computeAbcPoints(tf.candles, lookback);
  if (!abc) return { pass: false, detail: 'Cannot identify ABC points' };

  const slice = tf.candles.slice(-lookback);
  let cIdx = abc.bIdx, cLow = abc.bPoint;
  for (let i = abc.bIdx + 1; i < slice.length; i++) {
    if (slice[i].low < cLow) { cLow = slice[i].low; cIdx = i; }
  }

  const daysSinceC = lookback - 1 - cIdx;
  const pass = daysSinceC <= max;
  return {
    pass,
    detail: `C_point $${cLow.toFixed(2)} was ${daysSinceC} bar(s) ago (max ${max})`,
  };
}

// check: 'above_lower_high' | 'top_third'
export function abcMomentum(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback',  10);
  const check     = paramStr(params, 'check',     'above_lower_high');

  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback + 2)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const slice = lastN(tf.candles, lookback);
  const close = last(slice)!.close;

  if (check === 'above_lower_high') {
    let lastLowerHigh: number | null = null;
    for (let i = 1; i < slice.length - 1; i++) {
      if (slice[i].high < slice[i - 1].high) lastLowerHigh = slice[i].high;
    }
    const pass = lastLowerHigh != null && close > lastLowerHigh;
    return {
      pass,
      detail: lastLowerHigh != null
        ? `Close $${close.toFixed(2)} ${pass ? '>' : '≤'} last lower high $${lastLowerHigh.toFixed(2)}`
        : 'No lower high found',
    };
  }

  // 'top_third': 2 consecutive closes in top 33% of lookback range
  const rangeHigh = Math.max(...slice.map(c => c.high));
  const rangeLow  = Math.min(...slice.map(c => c.low));
  const range     = rangeHigh - rangeLow;
  const n         = slice.length;
  const pass      = range > 0 && n >= 2 &&
    (slice[n - 1].close - rangeLow) / range >= 0.67 &&
    (slice[n - 2].close - rangeLow) / range >= 0.67;
  return {
    pass,
    detail: `2 consecutive closes in top 33%: ${pass ? 'yes' : 'no'} (range $${rangeLow.toFixed(2)}–$${rangeHigh.toFixed(2)})`,
  };
}
