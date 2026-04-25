import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './trendRules';

function last<T>(arr: T[]): T | undefined { return arr[arr.length - 1]; }

// ─── Rules ───────────────────────────────────────────────────────────────────

export function hourlyEmaCrossover(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = (params.timeframe as string | undefined) ?? '1H';
  const fast      = params.fast as number;
  const slow      = params.slow as number;
  const tf        = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const emaFast = tf.ema[fast];
  const emaSlow = tf.ema[slow];
  if (!emaFast?.length || !emaSlow?.length || emaFast.length < 4)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} EMA${fast}/EMA${slow} data` };

  let crossFound = false;
  for (let i = emaFast.length - 1; i >= Math.max(1, emaFast.length - 3); i--) {
    if (emaFast[i - 1] <= emaSlow[i - 1] && emaFast[i] > emaSlow[i]) { crossFound = true; break; }
  }

  const fastNow = last(emaFast)!;
  const slowNow = last(emaSlow)!;
  return {
    pass: crossFound,
    points: 0,
    detail: `${timeframe} EMA${fast} $${fastNow.toFixed(2)} vs EMA${slow} $${slowNow.toFixed(2)} — cross ${crossFound ? 'detected' : 'not detected'} in last 3 bars`,
  };
}

export function hourlyStructureBreak(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = (params.timeframe as string | undefined) ?? '1H';
  const lookback  = params.lookback as number;
  const tf        = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback + 1)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data` };

  const candles   = tf.candles;
  const lastClose = last(candles)!.close;
  const swingHigh = Math.max(...candles.slice(-lookback - 1, -1).map(c => c.high));
  const pass      = lastClose > swingHigh;
  return {
    pass,
    points: 0,
    detail: `${timeframe} close $${lastClose.toFixed(2)} vs ${lookback}-bar swing high $${swingHigh.toFixed(2)}`,
  };
}

export function hourlyEngulfing(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = (params.timeframe as string | undefined) ?? '1H';
  const tf        = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < 2)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data` };

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
    points: 0,
    detail: isBullishEngulfing
      ? `${timeframe} bullish engulfing: prev O$${prev.open.toFixed(2)} C$${prev.close.toFixed(2)}, curr O$${curr.open.toFixed(2)} C$${curr.close.toFixed(2)}`
      : isHammer
        ? `${timeframe} hammer/pin bar: lower wick ${lowerWick.toFixed(2)} vs body ${body.toFixed(2)}`
        : `No engulfing or hammer on ${timeframe}`,
  };
}

export function triggerVolume(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe      = (params.timeframe      as string | undefined) ?? '1H';
  const avgWindow      = (params.avgWindow      as number | undefined) ?? 20;
  const minPctAboveAvg = params.minPctAboveAvg as number;
  const tf             = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < avgWindow + 1)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data` };

  const candles = tf.candles;
  const lastVol = last(candles)!.volume;
  const avgVol  = candles.slice(-avgWindow - 1, -1).reduce((s, c) => s + c.volume, 0) / avgWindow;
  if (avgVol === 0) return { pass: false, points: 0, detail: 'Zero average volume' };

  const pctAbove = (lastVol / avgVol - 1) * 100;
  const pass     = pctAbove >= minPctAboveAvg;
  return {
    pass,
    points: 0,
    detail: `${timeframe} trigger bar volume ${pctAbove >= 0 ? '+' : ''}${pctAbove.toFixed(0)}% vs ${avgWindow}-bar avg`,
  };
}

export function triggerTiming(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const dailyTimeframe  = (params.dailyTimeframe  as string | undefined) ?? '1D';
  const atrPeriod       = (params.atrPeriod       as number | undefined) ?? 14;
  const maxDaysAfterSignal = params.maxDaysAfterSignal as number;
  const tf = ctx.timeframes[dailyTimeframe];
  if (!tf || tf.candles.length < 5)
    return { pass: false, points: 0, detail: `Insufficient ${dailyTimeframe} data` };

  const candles = tf.candles;
  const atr     = last(tf.atr[atrPeriod]);
  const ema20   = last(tf.ema[20]);
  const ema50   = last(tf.ema[50]);
  if (atr == null) return { pass: false, points: 0, detail: `No ATR${atrPeriod} data` };

  let setupDays = 0;
  for (let i = candles.length - 1; i >= 0; i--) {
    const c = candles[i];
    const nearEma20 = ema20 != null && Math.abs(c.close - ema20) <= atr;
    const nearEma50 = ema50 != null && Math.abs(c.close - ema50) <= atr;
    if (nearEma20 || nearEma50) setupDays++;
    else break;
  }

  const pass = setupDays > 0 && setupDays <= maxDaysAfterSignal;
  return {
    pass,
    points: 0,
    detail: `${setupDays} ${dailyTimeframe} bar(s) since pullback reached support`,
  };
}

export function triggerTimeOfDay(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = (params.timeframe as string | undefined) ?? '1H';
  const minHour   = params.minHour as number;
  const maxHour   = params.maxHour as number;
  const tf        = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length === 0)
    return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const timestamp = last(tf.candles)!.time;
  if (typeof timestamp !== 'number')
    return { pass: false, points: 0, detail: 'Cannot determine time of day from non-numeric timestamp' };

  const date    = new Date(timestamp * 1000);
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const estHour = ((utcHour - 5) % 24 + 24) % 24; // EST = UTC-5 (approx)

  const pass = estHour >= minHour && estHour < maxHour;
  return {
    pass,
    points: 0,
    detail: `${timeframe} trigger candle at ${estHour.toFixed(1)}h EST (window: ${minHour}–${maxHour}h)`,
  };
}
