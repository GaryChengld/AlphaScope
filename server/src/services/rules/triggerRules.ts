import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import { last, paramNum, paramNumOpt, paramStr, paramArr } from './helpers';

// ─── Rules ───────────────────────────────────────────────────────────────────

export function hourlyEmaCrossover(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe  = paramStr(params, 'timeframe', '1H');
  const fast       = paramNum(params, 'fast');
  const slow       = paramNum(params, 'slow');
  const withinBars = paramNum(params, 'withinBars', 3);
  const tf         = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const emaFast = tf.ema[fast];
  const emaSlow = tf.ema[slow];
  if (!emaFast?.length || !emaSlow?.length || emaFast.length < 4)
    return { pass: false, detail: `Insufficient ${timeframe} EMA${fast}/EMA${slow} data` };

  // Look for a fast-over-slow cross within the last `withinBars` completed bars.
  let crossFound = false;
  for (let i = emaFast.length - 1; i >= Math.max(1, emaFast.length - withinBars); i--) {
    if (emaFast[i - 1] <= emaSlow[i - 1] && emaFast[i] > emaSlow[i]) { crossFound = true; break; }
  }

  const fastNow = last(emaFast)!;
  const slowNow = last(emaSlow)!;
  return {
    pass: crossFound,
    detail: `${timeframe} EMA${fast} $${fastNow.toFixed(2)} vs EMA${slow} $${slowNow.toFixed(2)} — cross ${crossFound ? 'detected' : 'not detected'} in last ${withinBars} bars`,
  };
}

export function hourlyStructureBreak(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe  = paramStr(params, 'timeframe', '1H');
  const lookback   = paramNum(params, 'lookback');
  const withinBars = paramNum(params, 'withinBars', 1);
  const tf         = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback + 1)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const candles   = tf.candles;
  const lastClose = last(candles)!.close;

  // Consider the last `withinBars` bars as candidate break bars. A bar counts as
  // a structure break if its close cleared the swing high of the `lookback` bars
  // immediately before it — and the break is still valid only if the current
  // close is still holding at/above that broken level. withinBars=1 reduces to
  // "the last bar just broke a new high".
  let pass = false;
  let brokenLevel = NaN;
  for (let k = 0; k < withinBars; k++) {
    const idx = candles.length - 1 - k;
    if (idx - lookback < 0) break;
    const swingHigh = Math.max(...candles.slice(idx - lookback, idx).map(c => c.high));
    if (candles[idx].close > swingHigh && lastClose >= swingHigh) {
      pass = true;
      brokenLevel = swingHigh;
      break;
    }
  }

  const detailLevel = Number.isNaN(brokenLevel)
    ? Math.max(...candles.slice(-lookback - 1, -1).map(c => c.high))
    : brokenLevel;
  return {
    pass,
    detail: `${timeframe} close $${lastClose.toFixed(2)} vs ${lookback}-bar swing high $${detailLevel.toFixed(2)} — break ${pass ? 'confirmed' : 'not found'} in last ${withinBars} bar(s)`,
  };
}

type ReversalPattern = 'any' | 'engulfing_2plus' | 'hammer' | 'pin_doji' | 'green_after_red';

interface CandleShape { open: number; high: number; low: number; close: number; }

// Evaluates the bullish reversal patterns for the candle at index `ci`, using
// the bars before it to count the preceding red run.
function evalReversalAt(candles: CandleShape[], ci: number, pattern: ReversalPattern) {
  const curr = candles[ci];
  const prev = candles[ci - 1];

  const body      = Math.abs(curr.close - curr.open);
  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const barRange  = curr.high - curr.low;

  const isBullishEngulfing = curr.close > curr.open &&
    prev.close < prev.open &&
    curr.open  <= prev.close &&
    curr.close >= prev.open;

  // Count consecutive red bars immediately preceding the candidate bar
  let redCount = 0;
  for (let i = ci - 1; i >= 0; i--) {
    if (candles[i].close < candles[i].open) redCount++;
    else break;
  }

  const isEngulfing2Plus = isBullishEngulfing && redCount >= 2;
  const isHammer         = body > 0 && lowerWick >= 2 * body &&
    (curr.close - curr.low) / (barRange || 1) >= 0.75;
  const isPinOrDoji      = barRange > 0 &&
    Math.abs(curr.close - curr.open) <= 0.3 * barRange &&
    lowerWick >= 0.6 * barRange;
  const isGreenAfterRed  = curr.close > curr.open && redCount >= 2 &&
    !isBullishEngulfing && !isHammer;

  let pass = false;
  let detail = '';

  if (pattern === 'any') {
    pass = isBullishEngulfing || isHammer || isPinOrDoji || (curr.close > curr.open && redCount >= 2);
    detail = pass
      ? `reversal: engulfing=${isBullishEngulfing} hammer=${isHammer} pin=${isPinOrDoji} redCount=${redCount}`
      : 'no reversal pattern';
  } else if (pattern === 'engulfing_2plus') {
    pass   = isEngulfing2Plus;
    detail = `engulfing of ${redCount} red bar(s): O$${curr.open.toFixed(2)} C$${curr.close.toFixed(2)}`;
  } else if (pattern === 'hammer') {
    pass   = isHammer;
    detail = `hammer: lower wick ${lowerWick.toFixed(2)} vs body ${body.toFixed(2)}`;
  } else if (pattern === 'pin_doji') {
    pass   = isPinOrDoji;
    detail = `pin/doji: body ${body.toFixed(2)} vs range ${barRange.toFixed(2)}, lower wick ${lowerWick.toFixed(2)}`;
  } else if (pattern === 'green_after_red') {
    pass   = isGreenAfterRed;
    detail = `green close after ${redCount} red bar(s)`;
  }

  return { pass, detail };
}

// Detects bullish reversal patterns on the given timeframe. Scans the last
// `withinBars` candles (default 1 = most recent bar only) and passes if any of
// them matches. When `pattern` is omitted or 'any', all four patterns are
// accepted (broadest gate); named patterns score individual types.
export function bullishReversalCandle(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe  = paramStr(params, 'timeframe', '1H');
  const pattern    = (params.pattern as ReversalPattern | undefined) ?? 'any';
  const withinBars = paramNum(params, 'withinBars', 1);
  const tf         = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < 2)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const candles = tf.candles;
  // Need index >= 1 (a prev bar) for each candidate; cap the scan accordingly.
  const oldest  = Math.max(1, candles.length - withinBars);

  for (let ci = candles.length - 1; ci >= oldest; ci--) {
    const r = evalReversalAt(candles, ci, pattern);
    if (r.pass) {
      const barsAgo = candles.length - 1 - ci;
      return { pass: true, detail: `${timeframe} ${r.detail}${barsAgo > 0 ? ` (${barsAgo} bar(s) ago)` : ''}` };
    }
  }

  return { pass: false, detail: `No reversal pattern on ${timeframe} in last ${withinBars} bar(s)` };
}

export function triggerVolume(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe      = paramStr(params, 'timeframe', '1H');
  const avgWindow      = paramNum(params, 'avgWindow', 20);
  const minPctAboveAvg = paramNum(params, 'minPctAboveAvg');
  const maxPctAboveAvg = paramNumOpt(params, 'maxPctAboveAvg');
  const tf             = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < avgWindow + 1)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const candles = tf.candles;
  // The most recent bar can carry zero volume when evaluated off-hours (the
  // current, not-yet-traded bar). Use the most recent bar that actually traded
  // as the trigger bar, and average the `avgWindow` bars immediately before it,
  // so off-hours evaluations aren't penalized. When the last bar has volume this
  // is identical to averaging the prior window.
  let triggerIdx = candles.length - 1;
  while (triggerIdx >= 0 && candles[triggerIdx].volume <= 0) triggerIdx--;
  if (triggerIdx < avgWindow)
    return { pass: false, detail: `Insufficient ${timeframe} volume data` };

  const lastVol = candles[triggerIdx].volume;
  const avgVol  = candles.slice(triggerIdx - avgWindow, triggerIdx).reduce((s, c) => s + c.volume, 0) / avgWindow;
  if (avgVol === 0) return { pass: false, detail: 'Zero average volume' };

  const skipped  = candles.length - 1 - triggerIdx;
  const pctAbove = (lastVol / avgVol - 1) * 100;
  const pass     = pctAbove >= minPctAboveAvg && (maxPctAboveAvg == null || pctAbove < maxPctAboveAvg);
  return {
    pass,
    detail: `${timeframe} trigger bar volume ${pctAbove >= 0 ? '+' : ''}${pctAbove.toFixed(0)}% vs ${avgWindow}-bar avg${skipped > 0 ? ` (skipped ${skipped} zero-vol bar${skipped > 1 ? 's' : ''})` : ''}`,
  };
}

export function triggerTiming(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const dailyTimeframe     = paramStr(params, 'dailyTimeframe', '1D');
  const atrPeriod          = paramNum(params, 'atrPeriod',      14);
  const emaPeriods         = paramArr(params, 'emaPeriods',     [20, 50]);
  const minDaysAfterSignal = paramNum(params, 'minDaysAfterSignal', 1);
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

  const pass = setupDays >= minDaysAfterSignal && setupDays <= maxDaysAfterSignal;
  const checked = emaPeriods.map(p => `EMA${p}`).join('/');
  return {
    pass,
    detail: `${setupDays} completed ${dailyTimeframe} bar(s) within 1×ATR${atrPeriod} of ${checked} (window ${minDaysAfterSignal}–${maxDaysAfterSignal})`,
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
