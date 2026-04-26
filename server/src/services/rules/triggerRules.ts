import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import { last, paramNum, paramStr, paramArr } from './helpers';

// ─── Rules ───────────────────────────────────────────────────────────────────

export function hourlyEmaCrossover(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1H');
  const fast      = paramNum(params, 'fast');
  const slow      = paramNum(params, 'slow');
  const tf        = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const emaFast = tf.ema[fast];
  const emaSlow = tf.ema[slow];
  if (!emaFast?.length || !emaSlow?.length || emaFast.length < 4)
    return { pass: false, detail: `Insufficient ${timeframe} EMA${fast}/EMA${slow} data` };

  let crossFound = false;
  for (let i = emaFast.length - 1; i >= Math.max(1, emaFast.length - 3); i--) {
    if (emaFast[i - 1] <= emaSlow[i - 1] && emaFast[i] > emaSlow[i]) { crossFound = true; break; }
  }

  const fastNow = last(emaFast)!;
  const slowNow = last(emaSlow)!;
  return {
    pass: crossFound,
    detail: `${timeframe} EMA${fast} $${fastNow.toFixed(2)} vs EMA${slow} $${slowNow.toFixed(2)} — cross ${crossFound ? 'detected' : 'not detected'} in last 3 bars`,
  };
}

export function hourlyStructureBreak(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1H');
  const lookback  = paramNum(params, 'lookback');
  const tf        = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback + 1)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const candles   = tf.candles;
  const lastClose = last(candles)!.close;
  const swingHigh = Math.max(...candles.slice(-lookback - 1, -1).map(c => c.high));
  const pass      = lastClose > swingHigh;
  return {
    pass,
    detail: `${timeframe} close $${lastClose.toFixed(2)} vs ${lookback}-bar swing high $${swingHigh.toFixed(2)}`,
  };
}

// Detects a bullish engulfing OR a hammer/pin bar on the most recent candle of
// the given timeframe. Name reflects that it covers multiple reversal patterns,
// not just engulfing.
export function bullishReversalCandle(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1H');
  const tf        = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < 2)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const candles = tf.candles;
  const curr    = candles[candles.length - 1];
  const prev    = candles[candles.length - 2];

  const isBullishEngulfing = curr.close > curr.open &&
    prev.close < prev.open &&
    curr.open  <= prev.close &&
    curr.close >= prev.open;

  const body      = Math.abs(curr.close - curr.open);
  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const barRange  = curr.high - curr.low;
  const isHammer  = body > 0 && lowerWick >= 2 * body &&
    (curr.close - curr.low) / (barRange || 1) >= 0.75;

  const pass = isBullishEngulfing || isHammer;
  return {
    pass,
    detail: isBullishEngulfing
      ? `${timeframe} bullish engulfing: prev O$${prev.open.toFixed(2)} C$${prev.close.toFixed(2)}, curr O$${curr.open.toFixed(2)} C$${curr.close.toFixed(2)}`
      : isHammer
        ? `${timeframe} hammer/pin bar: lower wick ${lowerWick.toFixed(2)} vs body ${body.toFixed(2)}`
        : `No engulfing or hammer on ${timeframe}`,
  };
}

export function triggerVolume(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe      = paramStr(params, 'timeframe', '1H');
  const avgWindow      = paramNum(params, 'avgWindow', 20);
  const minPctAboveAvg = paramNum(params, 'minPctAboveAvg');
  const tf             = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < avgWindow + 1)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const candles = tf.candles;
  const lastVol = last(candles)!.volume;
  const avgVol  = candles.slice(-avgWindow - 1, -1).reduce((s, c) => s + c.volume, 0) / avgWindow;
  if (avgVol === 0) return { pass: false, detail: 'Zero average volume' };

  const pctAbove = (lastVol / avgVol - 1) * 100;
  const pass     = pctAbove >= minPctAboveAvg;
  return {
    pass,
    detail: `${timeframe} trigger bar volume ${pctAbove >= 0 ? '+' : ''}${pctAbove.toFixed(0)}% vs ${avgWindow}-bar avg`,
  };
}

export function triggerTiming(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const dailyTimeframe     = paramStr(params, 'dailyTimeframe', '1D');
  const atrPeriod          = paramNum(params, 'atrPeriod',      14);
  const emaPeriods         = paramArr(params, 'emaPeriods',     [20, 50]);
  const maxDaysAfterSignal = paramNum(params, 'maxDaysAfterSignal');
  const tf = ctx.timeframes[dailyTimeframe];
  if (!tf || tf.candles.length < 5)
    return { pass: false, detail: `Insufficient ${dailyTimeframe} data` };

  const candles = tf.candles;
  const atr     = last(tf.atr[atrPeriod]);
  if (atr == null) return { pass: false, detail: `No ATR${atrPeriod} data` };

  const emaVals: { period: number; val: number }[] = [];
  for (const p of emaPeriods) {
    const v = last(tf.ema[p]);
    if (v != null) emaVals.push({ period: p, val: v });
  }

  // Skip the last bar — it is today's incomplete daily bar.
  let setupDays = 0;
  for (let i = candles.length - 2; i >= 0; i--) {
    const c = candles[i];
    const nearAny = emaVals.some(e => Math.abs(c.close - e.val) <= atr);
    if (nearAny) setupDays++;
    else break;
  }

  const pass = setupDays > 0 && setupDays <= maxDaysAfterSignal;
  const checked = emaPeriods.map(p => `EMA${p}`).join('/');
  return {
    pass,
    detail: `${setupDays} completed ${dailyTimeframe} bar(s) within 1×ATR${atrPeriod} of ${checked}`,
  };
}

export function triggerTimeOfDay(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1H');
  const minHour   = paramNum(params, 'minHour');
  const maxHour   = paramNum(params, 'maxHour');
  const tf        = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length === 0)
    return { pass: false, detail: `No ${timeframe} data` };

  const timestamp = last(tf.candles)!.time;
  if (typeof timestamp !== 'number')
    return { pass: false, detail: 'Cannot determine time of day from non-numeric timestamp' };

  const date = new Date(timestamp * 1000);

  // Use Intl to get NY local hour/minute — handles EST/EDT (DST) automatically
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(date);
  const hh = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  const nyHour = (hh % 24) + mm / 60;

  const pass = nyHour >= minHour && nyHour < maxHour;
  return {
    pass,
    detail: `${timeframe} trigger candle at ${nyHour.toFixed(1)}h NY time (window: ${minHour}–${maxHour}h)`,
  };
}
