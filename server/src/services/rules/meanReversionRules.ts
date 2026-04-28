import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import { last, lastN, paramNum, paramStr, paramNumOpt } from './helpers';

// ─── ADX ─────────────────────────────────────────────────────────────────────

export function adxLevel(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const period    = paramNum(params, 'period', 14);
  const max       = paramNum(params, 'max');
  const min       = paramNumOpt(params, 'min');

  const tf  = ctx.timeframes[timeframe];
  const adx = last(tf?.adx[period]);
  if (adx == null || !Number.isFinite(adx))
    return { pass: false, detail: `No ADX${period} data on ${timeframe}` };

  const pass = adx < max && (min == null || adx >= min);
  return {
    pass,
    detail: `ADX(${period}) = ${adx.toFixed(1)} on ${timeframe} (need ${min != null ? `${min}–` : '<'}${max})`,
  };
}

// ─── Weekly trend gate ────────────────────────────────────────────────────────

// Passes if weekly close > weekly EMA(emaPeriod) OR the EMA slope over the last
// flatLookback bars is flat (within ±flatThresholdPct). Rejects only stocks in a
// clear weekly downtrend where the EMA is also declining — catching falling knives.
export function weeklyTrendNotDown(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe       = paramStr(params, 'timeframe', '1W');
  const emaPeriod       = paramNum(params, 'emaPeriod', 50);
  const flatLookback    = paramNum(params, 'flatLookback', 8);
  const flatThreshold   = paramNum(params, 'flatThresholdPct', 0.5);

  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < 2)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const emaSeries = tf.ema[emaPeriod];
  const close     = last(tf.candles)?.close;
  const emaLast   = last(emaSeries);

  if (emaSeries == null || emaSeries.length < flatLookback || close == null || emaLast == null)
    return { pass: false, detail: `No ${timeframe} EMA${emaPeriod} data` };

  const aboveEma = close > emaLast;

  const recentEma = lastN(emaSeries, flatLookback);
  const slopePct  = recentEma[0] > 0
    ? (recentEma[recentEma.length - 1] - recentEma[0]) / recentEma[0] * 100
    : 0;
  const flat = Math.abs(slopePct) <= flatThreshold;

  const pass = aboveEma || flat;
  return {
    pass,
    detail: `${timeframe} close $${close.toFixed(2)} ${aboveEma ? '>' : '<'} EMA${emaPeriod} $${emaLast.toFixed(2)}, ${flatLookback}-bar slope ${slopePct.toFixed(2)}% (flat ≤±${flatThreshold}%)`,
  };
}

// ─── RSI OR-gate ─────────────────────────────────────────────────────────────

// Passes if RSI(2) < rsi2Max OR RSI(14) < rsi14Max. The engine's mandatory array
// ANDs all conditions — a single rule is required to express OR semantics.
export function rsiOversoldEither(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const rsi2Max   = paramNum(params, 'rsi2Max', 10);
  const rsi14Max  = paramNum(params, 'rsi14Max', 30);

  const tf    = ctx.timeframes[timeframe];
  const rsi2  = last(tf?.rsi[2]);
  const rsi14 = last(tf?.rsi[14]);

  if (rsi2 == null && rsi14 == null)
    return { pass: false, detail: `No RSI(2) or RSI(14) data on ${timeframe}` };

  const pass = (rsi2 != null && rsi2 < rsi2Max) || (rsi14 != null && rsi14 < rsi14Max);
  const parts: string[] = [];
  if (rsi2  != null) parts.push(`RSI(2)=${rsi2.toFixed(1)} (threshold <${rsi2Max})`);
  if (rsi14 != null) parts.push(`RSI(14)=${rsi14.toFixed(1)} (threshold <${rsi14Max})`);
  return { pass, detail: parts.join(', ') };
}

// ─── Lower BB tag ─────────────────────────────────────────────────────────────

// Passes if today's low touched or pierced the lower Bollinger Band.
export function lowerBbTag(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const period    = paramNum(params, 'period', 20);
  const stdDev    = paramNum(params, 'stdDev', 2);

  const tf     = ctx.timeframes[timeframe];
  const bar    = last(tf?.candles);
  const series = tf?.bb.find(b => b.period === period && b.stdDev === stdDev);
  const lower  = last(series?.lower);

  if (!bar || lower == null)
    return { pass: false, detail: `No ${timeframe} BB(${period},${stdDev}) data` };

  const pass = bar.low <= lower;
  return {
    pass,
    detail: `${timeframe} bar low $${bar.low.toFixed(2)} ${pass ? '≤' : '>'} lower BB $${lower.toFixed(2)}`,
  };
}

// ─── BB lower position (scoring) ─────────────────────────────────────────────

// quality: 'pierced' — low < lower AND close >= lower (wick through, body closes back)
//          'tagged'  — low <= lower AND close < lower (body still below band)
//          'within_atr' — close within 0.5×ATR above lower band
export function bbLowerPosition(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const period    = paramNum(params, 'period', 20);
  const stdDev    = paramNum(params, 'stdDev', 2);
  const atrPeriod = paramNum(params, 'atrPeriod', 14);
  const quality   = paramStr(params, 'quality');

  const tf     = ctx.timeframes[timeframe];
  const bar    = last(tf?.candles);
  const series = tf?.bb.find(b => b.period === period && b.stdDev === stdDev);
  const lower  = last(series?.lower);
  const atr    = last(tf?.atr[atrPeriod]);

  if (!bar || lower == null)
    return { pass: false, detail: `No ${timeframe} BB(${period},${stdDev}) data` };

  let pass = false;
  let detail = '';

  if (quality === 'pierced') {
    pass   = bar.low < lower && bar.close >= lower;
    detail = `Low $${bar.low.toFixed(2)} pierced lower BB $${lower.toFixed(2)}, closed back at $${bar.close.toFixed(2)}`;
  } else if (quality === 'tagged') {
    pass   = bar.low <= lower && bar.close < lower;
    detail = `Low $${bar.low.toFixed(2)} tagged lower BB $${lower.toFixed(2)}, close $${bar.close.toFixed(2)} still below band`;
  } else if (quality === 'within_atr') {
    if (atr == null) return { pass: false, detail: `No ATR${atrPeriod} data` };
    const dist = bar.close - lower;
    pass   = dist >= 0 && dist <= 0.5 * atr;
    detail = `Close $${bar.close.toFixed(2)} is ${dist.toFixed(2)} above lower BB $${lower.toFixed(2)} (0.5×ATR = ${(0.5 * atr).toFixed(2)})`;
  } else {
    return { pass: false, detail: `Unknown bbLowerPosition quality: ${quality}` };
  }

  return { pass, detail };
}

// ─── Consecutive red bars ─────────────────────────────────────────────────────

// Counts the number of consecutive red bars (close < open) immediately preceding
// the current bar. The current bar itself is not counted (it's the reversal candle).
export function consecutiveRedBars(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const min       = paramNum(params, 'min');
  const max       = paramNumOpt(params, 'max');

  const tf      = ctx.timeframes[timeframe];
  const candles = tf?.candles ?? [];
  if (candles.length < 2)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  let count = 0;
  for (let i = candles.length - 2; i >= 0; i--) {
    if (candles[i].close < candles[i].open) count++;
    else break;
  }

  const pass = count >= min && (max == null || count <= max);
  return {
    pass,
    detail: `${count} consecutive red bar(s) before current ${timeframe} bar (need ${min}${max != null ? `–${max}` : '+'})`,
  };
}

// ─── Market not in panic ──────────────────────────────────────────────────────

// Passes only when both: VIX < maxVix AND SPY 1-day return >= minSpyDailyChangePct.
// Distinct from marketRegime which also requires SPY to be above its EMA.
export function marketNotPanic(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const maxVix               = paramNum(params, 'maxVix', 25);
  const minSpyDailyChangePct = paramNum(params, 'minSpyDailyChangePct', -3);

  const vix = ctx.vix;
  if (vix == null) return { pass: false, detail: 'VIX data unavailable' };

  const spy = ctx.spy.candles;
  if (spy.length < 2) return { pass: false, detail: 'Insufficient SPY data' };

  const spyToday = spy[spy.length - 1].close;
  const spyPrev  = spy[spy.length - 2].close;
  const spyChg   = spyPrev > 0 ? (spyToday / spyPrev - 1) * 100 : 0;

  const vixOk = vix < maxVix;
  const spyOk = spyChg >= minSpyDailyChangePct;
  const pass  = vixOk && spyOk;

  return {
    pass,
    detail: `VIX ${vix.toFixed(1)} (max ${maxVix}), SPY 1d ${spyChg.toFixed(2)}% (min ${minSpyDailyChangePct}%)`,
  };
}
