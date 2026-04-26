import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import {
  last,
  findSwingHigh,
  priorSwingHigh,
  nearestRoundNumber,
  paramNum,
  paramStr,
  paramArr,
  paramBool,
  paramNumOpt,
} from './helpers';

// ─── Rules ───────────────────────────────────────────────────────────────────

export function validPullback(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const atrPeriod = paramNum(params, 'atrPeriod', 14);
  const lookback  = paramNum(params, 'lookback',  20);
  const minAtr    = paramNum(params, 'minAtr');
  const maxAtr    = paramNum(params, 'maxAtr');
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  const sh    = findSwingHigh(ctx, timeframe, lookback);
  if (close == null || atr == null || sh == null)
    return { pass: false, detail: 'Insufficient data for pullback check' };

  const depth = (sh.price - close) / atr;
  const pass  = depth >= minAtr && depth <= maxAtr;
  return {
    pass,
    detail: `Pullback depth ${depth.toFixed(2)}× ATR${atrPeriod} from ${lookback}-bar high $${sh.price.toFixed(2)}`,
  };
}

export function pullbackToSupport(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe  = paramStr(params, 'timeframe', '1D');
  const emaPeriods = paramArr(params, 'emaPeriods', [20, 50]);
  const atrPeriod  = paramNum(params, 'atrPeriod', 14);
  const threshold  = paramNum(params, 'atrThreshold');
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  if (close == null || atr == null)
    return { pass: false, detail: 'Insufficient data' };

  for (const p of emaPeriods) {
    const emaVal = last(tf.ema[p]);
    if (emaVal != null && Math.abs(close - emaVal) <= threshold * atr) {
      return { pass: true, detail: `$${close.toFixed(2)} within ${threshold}× ATR${atrPeriod} of EMA${p} $${emaVal.toFixed(2)}` };
    }
  }

  const checked = emaPeriods.map(p => `EMA${p}`).join(', ');
  return { pass: false, detail: `$${close.toFixed(2)} not within ${threshold}× ATR of ${checked}` };
}

export function pullbackAtrDepth(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const atrPeriod = paramNum(params, 'atrPeriod', 14);
  const lookback  = paramNum(params, 'lookback',  20);
  const min       = paramNum(params, 'min');
  const max       = paramNum(params, 'max');
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  const sh    = findSwingHigh(ctx, timeframe, lookback);
  if (close == null || atr == null || sh == null)
    return { pass: false, detail: 'Insufficient data' };

  const depth = (sh.price - close) / atr;
  const pass  = depth >= min && depth < max;
  return { pass, detail: `Pullback depth ${depth.toFixed(2)}× ATR${atrPeriod}` };
}

export function fibRetracement(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback', 20);
  const min       = paramNum(params, 'min');
  const max       = paramNum(params, 'max');
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const sh = findSwingHigh(ctx, timeframe, lookback);
  if (!sh) return { pass: false, detail: 'No swing high found' };

  const pullbackSlice = tf.candles.slice(-(sh.barsAgo + 1));
  const swingLow      = Math.min(...pullbackSlice.map(c => c.low));
  const close         = last(tf.candles)!.close;
  if (sh.price === swingLow) return { pass: false, detail: 'Swing high equals swing low' };

  const pct  = (sh.price - close) / (sh.price - swingLow) * 100;
  const pass = pct >= min && pct <= max;
  return {
    pass,
    detail: `Fib retracement ${pct.toFixed(1)}% (high $${sh.price.toFixed(2)}, low $${swingLow.toFixed(2)})`,
  };
}

export function pullbackVolume(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe      = paramStr(params, 'timeframe', '1D');
  const avgWindow      = paramNum(params, 'avgWindow', 20);
  const pullbackWindow = paramNum(params, 'pullbackWindow', 5);
  const quality        = paramStr(params, 'quality');
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < avgWindow + pullbackWindow)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const candles   = tf.candles;
  const avgVol    = candles.slice(-avgWindow).reduce((s, c) => s + c.volume, 0) / avgWindow;
  const recent    = candles.slice(-pullbackWindow);
  const lastVol   = last(recent)!.volume;
  const declining = recent.every((c, i) => i === 0 || c.volume <= recent[i - 1].volume);
  const recentAvg = recent.reduce((s, c) => s + c.volume, 0) / recent.length;

  let pass = false;
  let detail = '';

  if (quality === 'ideal') {
    pass   = declining && lastVol < avgVol * 0.8;
    detail = `Volume ${declining ? '' : 'not '}progressively declining, last bar ${(lastVol / avgVol * 100).toFixed(0)}% of ${avgWindow}-bar avg`;
  } else if (quality === 'below_avg') {
    // The `!declining` clause makes this mutually exclusive with `ideal` — when
    // the group uses `pick: tiered`, a strictly declining series scores `ideal`
    // and falls through here so we don't double-count the same setup.
    pass   = recentAvg < avgVol && !declining;
    detail = `Recent avg volume ${(recentAvg / avgVol * 100).toFixed(0)}% of ${avgWindow}-bar avg (not consistently declining)`;
  } else if (quality === 'flat') {
    pass   = recentAvg >= avgVol * 0.8 && recentAvg <= avgVol * 1.2;
    detail = `Volume at ${(recentAvg / avgVol * 100).toFixed(0)}% of ${avgWindow}-bar avg`;
  }

  return { pass, detail };
}

export function pullbackDuration(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback',  20);
  const minDays   = paramNum(params, 'minDays');
  const maxDays   = paramNumOpt(params, 'maxDays');
  const sh = findSwingHigh(ctx, timeframe, lookback);
  if (!sh) return { pass: false, detail: `No swing high found in last ${lookback} ${timeframe} bars` };

  const days = sh.barsAgo;
  const pass = days >= minDays && (maxDays == null || days <= maxDays);
  return { pass, detail: `${days} ${timeframe} bars since swing high` };
}

export function supportProximity(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe  = paramStr(params, 'timeframe', '1D');
  const atrPeriod  = paramNum(params, 'atrPeriod', 14);
  const emaParam   = paramNumOpt(params, 'ema');
  const roundNum   = params.roundNumber == null ? false : paramBool(params, 'roundNumber');
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  if (close == null || atr == null)
    return { pass: false, detail: 'Insufficient data' };

  if (emaParam != null) {
    const emaVal = last(tf.ema[emaParam]);
    if (emaVal == null) return { pass: false, detail: `No EMA${emaParam} data` };
    const pass = Math.abs(close - emaVal) <= 0.5 * atr;
    return {
      pass,
      detail: `Distance to EMA${emaParam} $${emaVal.toFixed(2)}: ${Math.abs(close - emaVal).toFixed(2)} (0.5×ATR${atrPeriod} = ${(0.5 * atr).toFixed(2)})`,
    };
  }

  if (roundNum) {
    const { value, distance } = nearestRoundNumber(close);
    const pass = distance / close < 0.01;
    return {
      pass,
      detail: `Nearest round number $${value}, distance ${(distance / close * 100).toFixed(1)}%`,
    };
  }

  return { pass: false, detail: 'Invalid supportProximity params' };
}

export function swingHighPolarity(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const atrPeriod = paramNum(params, 'atrPeriod', 14);
  const lookback  = paramNum(params, 'lookback',  20);
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback * 2)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const candles = tf.candles;
  const atr     = last(tf.atr[atrPeriod]);
  const close   = last(candles)?.close;
  const ph      = priorSwingHigh(candles, lookback);
  if (atr == null || close == null || ph == null)
    return { pass: false, detail: 'No ATR/close/swing-high data' };

  const pass = Math.abs(close - ph) <= 0.5 * atr;
  return {
    pass,
    detail: `Prior swing high $${ph.toFixed(2)}, distance ${Math.abs(close - ph).toFixed(2)} (0.5×ATR${atrPeriod} = ${(0.5 * atr).toFixed(2)})`,
  };
}

export function supportConfluence(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe  = paramStr(params, 'timeframe', '1D');
  const emaPeriods = paramArr(params, 'emaPeriods', [20, 50]);
  const atrPeriod  = paramNum(params, 'atrPeriod', 14);
  const lookback   = paramNum(params, 'lookback',  20);
  const minFactors = paramNum(params, 'minFactors');
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  if (close == null || atr == null)
    return { pass: false, detail: 'Insufficient data' };

  const factors: string[] = [];

  for (const p of emaPeriods) {
    const emaVal = last(tf.ema[p]);
    if (emaVal != null && Math.abs(close - emaVal) <= 0.5 * atr) factors.push(`EMA${p}`);
  }

  // Fibonacci 23.6–61.8% zone
  const sh = findSwingHigh(ctx, timeframe, lookback);
  if (sh) {
    const slice    = tf.candles.slice(-(sh.barsAgo + 1));
    const swingLow = Math.min(...slice.map(c => c.low));
    if (sh.price !== swingLow) {
      const fibPct = (sh.price - close) / (sh.price - swingLow) * 100;
      if (fibPct >= 23.6 && fibPct <= 61.8) factors.push('Fibonacci');
    }
  }

  // Polarity flip (prior swing high)
  const ph = priorSwingHigh(tf.candles, lookback);
  if (ph != null && Math.abs(close - ph) <= 0.5 * atr) factors.push('SwingHighPolarity');

  // Round number
  const { value, distance } = nearestRoundNumber(close);
  if (distance / close < 0.01) factors.push(`Round $${value}`);

  const pass = factors.length >= minFactors;
  return {
    pass,
    detail: `${factors.length} support factor(s): ${factors.join(', ') || 'none'}`,
  };
}

export function rsiLevel(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const period    = paramNum(params, 'period',    14);
  const timeframe = paramStr(params, 'timeframe', '1D');
  const min       = paramNum(params, 'min');
  const max       = paramNum(params, 'max');
  const tf  = ctx.timeframes[timeframe];
  const rsi = last(tf?.rsi[period] ?? []);
  if (rsi == null) return { pass: false, detail: `No RSI${period} data on ${timeframe}` };

  const pass = rsi >= min && rsi <= max;
  return { pass, detail: `RSI(${period}) = ${rsi.toFixed(1)} on ${timeframe}` };
}

export function rsiStructure(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const period    = paramNum(params, 'period',    14);
  const timeframe = paramStr(params, 'timeframe', '1D');
  const type      = paramStr(params, 'type');
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const rsiSeries = tf.rsi[period] ?? [];
  const closes    = tf.candles.map(c => c.close);
  if (rsiSeries.length < 20)
    return { pass: false, detail: `Insufficient RSI${period} data on ${timeframe}` };

  if (type === 'turning_up') {
    const rsiNow  = rsiSeries[rsiSeries.length - 1];
    const rsi3ago = rsiSeries[rsiSeries.length - 4];
    const pass    = rsiNow > 40 && rsiNow > rsi3ago;
    return { pass, detail: `RSI${period} ${rsiNow.toFixed(1)} (3 bars ago: ${rsi3ago.toFixed(1)}) on ${timeframe}` };
  }

  if (type === 'divergence') {
    const n      = 30;
    const rslice = rsiSeries.slice(-n);
    const cslice = closes.slice(-n);
    // Find local lows in price AND require RSI to also be near a local minimum
    // at those bars — otherwise a noisy RSI series satisfies the comparison
    // trivially even when there's no real momentum divergence.
    const lows: number[] = [];
    for (let i = 1; i < cslice.length - 1; i++) {
      const priceLow = cslice[i] < cslice[i - 1] && cslice[i] < cslice[i + 1];
      const rsiLow   = rslice[i] <= rslice[i - 1] && rslice[i] <= rslice[i + 1];
      if (priceLow && rsiLow) lows.push(i);
    }
    if (lows.length >= 2) {
      const i1 = lows[lows.length - 2];
      const i2 = lows[lows.length - 1];
      const pass = cslice[i2] < cslice[i1] && rslice[i2] > rslice[i1];
      return {
        pass,
        detail: `Price lows $${cslice[i1].toFixed(2)} → $${cslice[i2].toFixed(2)}, RSI lows ${rslice[i1].toFixed(1)} → ${rslice[i2].toFixed(1)} on ${timeframe}`,
      };
    }
  }

  return { pass: false, detail: `No RSI${period} structure detected on ${timeframe}` };
}
