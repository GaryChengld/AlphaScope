import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './trendRules';

function last<T>(arr: T[]): T | undefined { return arr[arr.length - 1]; }

function findSwingHigh(
  ctx: StrategyContext,
  timeframe: string,
  lookback: number,
): { price: number; idx: number } | null {
  const candles = ctx.timeframes[timeframe]?.candles ?? [];
  if (candles.length < lookback) return null;
  const slice = candles.slice(-lookback);
  let maxHigh = -Infinity, maxIdx = 0;
  slice.forEach((c, i) => { if (c.high > maxHigh) { maxHigh = c.high; maxIdx = i; } });
  return { price: maxHigh, idx: lookback - 1 - maxIdx }; // idx = bars ago
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export function validPullback(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = (params.timeframe as string | undefined) ?? '1D';
  const atrPeriod = (params.atrPeriod as number | undefined) ?? 14;
  const lookback  = (params.lookback  as number | undefined) ?? 20;
  const minAtr    = params.minAtr as number;
  const maxAtr    = params.maxAtr as number;
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  const sh    = findSwingHigh(ctx, timeframe, lookback);
  if (close == null || atr == null || sh == null)
    return { pass: false, points: 0, detail: 'Insufficient data for pullback check' };

  const depth = (sh.price - close) / atr;
  const pass  = depth >= minAtr && depth <= maxAtr;
  return {
    pass,
    points: 0,
    detail: `Pullback depth ${depth.toFixed(2)}× ATR${atrPeriod} from ${lookback}-bar high $${sh.price.toFixed(2)}`,
  };
}

export function pullbackToSupport(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe  = (params.timeframe  as string   | undefined) ?? '1D';
  const emaPeriods = (params.emaPeriods as number[]  | undefined) ?? [20, 50];
  const atrPeriod  = (params.atrPeriod  as number   | undefined) ?? 14;
  const threshold  = params.atrThreshold as number;
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  if (close == null || atr == null)
    return { pass: false, points: 0, detail: 'Insufficient data' };

  for (const p of emaPeriods) {
    const emaVal = last(tf.ema[p]);
    if (emaVal != null && Math.abs(close - emaVal) <= threshold * atr) {
      return { pass: true, points: 0, detail: `$${close.toFixed(2)} within ${threshold}× ATR${atrPeriod} of EMA${p} $${emaVal.toFixed(2)}` };
    }
  }

  const checked = emaPeriods.map(p => `EMA${p}`).join(', ');
  return { pass: false, points: 0, detail: `$${close.toFixed(2)} not within ${threshold}× ATR of ${checked}` };
}

export function pullbackAtrDepth(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = (params.timeframe as string | undefined) ?? '1D';
  const atrPeriod = (params.atrPeriod as number | undefined) ?? 14;
  const lookback  = (params.lookback  as number | undefined) ?? 20;
  const min       = params.min as number;
  const max       = params.max as number;
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  const sh    = findSwingHigh(ctx, timeframe, lookback);
  if (close == null || atr == null || sh == null)
    return { pass: false, points: 0, detail: 'Insufficient data' };

  const depth = (sh.price - close) / atr;
  const pass  = depth >= min && depth < max;
  return { pass, points: 0, detail: `Pullback depth ${depth.toFixed(2)}× ATR${atrPeriod}` };
}

export function fibRetracement(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = (params.timeframe as string | undefined) ?? '1D';
  const lookback  = (params.lookback  as number | undefined) ?? 20;
  const min       = params.min as number;
  const max       = params.max as number;
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data` };

  const sh = findSwingHigh(ctx, timeframe, lookback);
  if (!sh) return { pass: false, points: 0, detail: 'No swing high found' };

  const pullbackSlice = tf.candles.slice(-(sh.idx + 1));
  const swingLow      = Math.min(...pullbackSlice.map(c => c.low));
  const close         = last(tf.candles)!.close;
  if (sh.price === swingLow) return { pass: false, points: 0, detail: 'Swing high equals swing low' };

  const pct  = (sh.price - close) / (sh.price - swingLow) * 100;
  const pass = pct >= min && pct <= max;
  return {
    pass,
    points: 0,
    detail: `Fib retracement ${pct.toFixed(1)}% (high $${sh.price.toFixed(2)}, low $${swingLow.toFixed(2)})`,
  };
}

export function pullbackVolume(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe      = (params.timeframe      as string | undefined) ?? '1D';
  const avgWindow      = (params.avgWindow      as number | undefined) ?? 20;
  const pullbackWindow = (params.pullbackWindow as number | undefined) ?? 5;
  const quality        = params.quality as string;
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < avgWindow + pullbackWindow)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data` };

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
    pass   = recentAvg < avgVol && !declining;
    detail = `Recent avg volume ${(recentAvg / avgVol * 100).toFixed(0)}% of ${avgWindow}-bar avg (not consistently declining)`;
  } else if (quality === 'flat') {
    pass   = recentAvg >= avgVol * 0.8 && recentAvg <= avgVol * 1.2;
    detail = `Volume at ${(recentAvg / avgVol * 100).toFixed(0)}% of ${avgWindow}-bar avg`;
  }

  return { pass, points: 0, detail };
}

export function pullbackDuration(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = (params.timeframe as string | undefined) ?? '1D';
  const lookback  = (params.lookback  as number | undefined) ?? 20;
  const minDays   = params.minDays as number;
  const maxDays   = params.maxDays as number | undefined;
  const sh = findSwingHigh(ctx, timeframe, lookback);
  if (!sh) return { pass: false, points: 0, detail: `No swing high found in last ${lookback} ${timeframe} bars` };

  const days = sh.idx;
  const pass = days >= minDays && (maxDays == null || days <= maxDays);
  return { pass, points: 0, detail: `${days} ${timeframe} bars since swing high` };
}

export function supportProximity(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe  = (params.timeframe as string | undefined) ?? '1D';
  const atrPeriod  = (params.atrPeriod as number | undefined) ?? 14;
  const emaParam   = params.ema as number | undefined;
  const roundNum   = params.roundNumber as boolean | undefined;
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  if (close == null || atr == null)
    return { pass: false, points: 0, detail: 'Insufficient data' };

  if (emaParam != null) {
    const emaVal = last(tf.ema[emaParam]);
    if (emaVal == null) return { pass: false, points: 0, detail: `No EMA${emaParam} data` };
    const pass = Math.abs(close - emaVal) <= 0.5 * atr;
    return {
      pass,
      points: 0,
      detail: `Distance to EMA${emaParam} $${emaVal.toFixed(2)}: ${Math.abs(close - emaVal).toFixed(2)} (0.5×ATR${atrPeriod} = ${(0.5 * atr).toFixed(2)})`,
    };
  }

  if (roundNum) {
    const round50  = Math.round(close / 50)  * 50;
    const round100 = Math.round(close / 100) * 100;
    const nearest  = Math.abs(close - round50) < Math.abs(close - round100) ? round50 : round100;
    const pass     = Math.abs(close - nearest) / close < 0.01;
    return {
      pass,
      points: 0,
      detail: `Nearest round number $${nearest}, distance ${(Math.abs(close - nearest) / close * 100).toFixed(1)}%`,
    };
  }

  return { pass: false, points: 0, detail: 'Invalid supportProximity params' };
}

export function swingHighPolarity(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = (params.timeframe as string | undefined) ?? '1D';
  const atrPeriod = (params.atrPeriod as number | undefined) ?? 14;
  const lookback  = (params.lookback  as number | undefined) ?? 20;
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback * 2)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data` };

  const candles   = tf.candles;
  const atr       = last(tf.atr[atrPeriod]);
  const close     = last(candles)?.close;
  if (atr == null || close == null)
    return { pass: false, points: 0, detail: 'No ATR/close data' };

  const priorHigh = Math.max(...candles.slice(-lookback * 2, -lookback).map(c => c.high));
  const pass      = Math.abs(close - priorHigh) <= 0.5 * atr;
  return {
    pass,
    points: 0,
    detail: `Prior swing high $${priorHigh.toFixed(2)}, distance ${Math.abs(close - priorHigh).toFixed(2)} (0.5×ATR${atrPeriod} = ${(0.5 * atr).toFixed(2)})`,
  };
}

export function supportConfluence(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe  = (params.timeframe  as string   | undefined) ?? '1D';
  const emaPeriods = (params.emaPeriods as number[]  | undefined) ?? [20, 50];
  const atrPeriod  = (params.atrPeriod  as number   | undefined) ?? 14;
  const lookback   = (params.lookback   as number   | undefined) ?? 20;
  const minFactors = params.minFactors as number;
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const close = last(tf.candles)?.close;
  const atr   = last(tf.atr[atrPeriod]);
  if (close == null || atr == null)
    return { pass: false, points: 0, detail: 'Insufficient data' };

  const factors: string[] = [];

  for (const p of emaPeriods) {
    const emaVal = last(tf.ema[p]);
    if (emaVal != null && Math.abs(close - emaVal) <= 0.5 * atr) factors.push(`EMA${p}`);
  }

  // Fibonacci 23.6–61.8% zone
  const sh = findSwingHigh(ctx, timeframe, lookback);
  if (sh) {
    const slice    = tf.candles.slice(-(sh.idx + 1));
    const swingLow = Math.min(...slice.map(c => c.low));
    if (sh.price !== swingLow) {
      const fibPct = (sh.price - close) / (sh.price - swingLow) * 100;
      if (fibPct >= 23.6 && fibPct <= 61.8) factors.push('Fibonacci');
    }
  }

  // Polarity flip (prior swing high)
  if (tf.candles.length >= lookback * 2) {
    const priorHigh = Math.max(...tf.candles.slice(-lookback * 2, -lookback).map(c => c.high));
    if (Math.abs(close - priorHigh) <= 0.5 * atr) factors.push('SwingHighPolarity');
  }

  // Round number
  const round50  = Math.round(close / 50)  * 50;
  const round100 = Math.round(close / 100) * 100;
  const nearest  = Math.abs(close - round50) < Math.abs(close - round100) ? round50 : round100;
  if (Math.abs(close - nearest) / close < 0.01) factors.push(`Round $${nearest}`);

  const pass = factors.length >= minFactors;
  return {
    pass,
    points: 0,
    detail: `${factors.length} support factor(s): ${factors.join(', ') || 'none'}`,
  };
}

export function rsiLevel(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const period    = (params.period    as number | undefined) ?? 14;
  const timeframe = (params.timeframe as string | undefined) ?? '1D';
  const min       = params.min as number;
  const max       = params.max as number;
  const tf  = ctx.timeframes[timeframe];
  const rsi = last(tf?.rsi[period] ?? []);
  if (rsi == null) return { pass: false, points: 0, detail: `No RSI${period} data on ${timeframe}` };

  const pass = rsi >= min && rsi <= max;
  return { pass, points: 0, detail: `RSI(${period}) = ${rsi.toFixed(1)} on ${timeframe}` };
}

export function rsiStructure(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const period    = (params.period    as number | undefined) ?? 14;
  const timeframe = (params.timeframe as string | undefined) ?? '1D';
  const type      = params.type as string;
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const rsiSeries = tf.rsi[period] ?? [];
  const closes    = tf.candles.map(c => c.close);
  if (rsiSeries.length < 20)
    return { pass: false, points: 0, detail: `Insufficient RSI${period} data on ${timeframe}` };

  if (type === 'turning_up') {
    const rsiNow  = rsiSeries[rsiSeries.length - 1];
    const rsi3ago = rsiSeries[rsiSeries.length - 4];
    const pass    = rsiNow > 40 && rsiNow > rsi3ago;
    return { pass, points: 0, detail: `RSI${period} ${rsiNow.toFixed(1)} (3 bars ago: ${rsi3ago.toFixed(1)}) on ${timeframe}` };
  }

  if (type === 'divergence') {
    const n      = 30;
    const rslice = rsiSeries.slice(-n);
    const cslice = closes.slice(-n);
    const lows: number[] = [];
    for (let i = 1; i < cslice.length - 1; i++) {
      if (cslice[i] < cslice[i - 1] && cslice[i] < cslice[i + 1]) lows.push(i);
    }
    if (lows.length >= 2) {
      const i1 = lows[lows.length - 2];
      const i2 = lows[lows.length - 1];
      const pass = cslice[i2] < cslice[i1] && rslice[i2] > rslice[i1];
      return {
        pass,
        points: 0,
        detail: `Price lows $${cslice[i1].toFixed(2)} → $${cslice[i2].toFixed(2)}, RSI lows ${rslice[i1].toFixed(1)} → ${rslice[i2].toFixed(1)} on ${timeframe}`,
      };
    }
  }

  return { pass: false, points: 0, detail: `No RSI${period} structure detected on ${timeframe}` };
}
