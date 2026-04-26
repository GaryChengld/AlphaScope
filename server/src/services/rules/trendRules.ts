import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import { last, slope, paramNum, paramStr, paramArr, paramNumOpt } from './helpers';

// ─── Rules ───────────────────────────────────────────────────────────────────

export function priceAboveEma(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const period    = paramNum(params, 'period');
  const timeframe = paramStr(params, 'timeframe');
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const close  = last(tf.candles)?.close;
  const emaVal = last(tf.ema[period]);
  if (close == null || emaVal == null)
    return { pass: false, detail: `Insufficient ${timeframe} data for EMA${period}` };

  const pass = close > emaVal;
  return {
    pass,
    detail: `$${close.toFixed(2)} ${pass ? '>' : '<'} EMA${period} $${emaVal.toFixed(2)} on ${timeframe}`,
  };
}

export function emaAlignment(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const periods   = paramArr(params, 'periods');
  const timeframe = paramStr(params, 'timeframe');
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const values = periods.map(p => ({ period: p, val: last(tf.ema[p]) }));
  if (values.some(v => v.val == null))
    return { pass: false, detail: `Missing EMA data for periods ${periods.join(', ')} on ${timeframe}` };

  // Each EMA must be greater than the next (periods assumed ascending: [20, 50, 200])
  const pass = values.every((v, i) => i === 0 || values[i - 1].val! > v.val!);
  const detail = values.map(v => `EMA${v.period} $${v.val!.toFixed(2)}`).join(' / ');
  return { pass, detail };
}

export function emaAlignmentSlope(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const periods   = paramArr(params, 'periods');
  const timeframe = paramStr(params, 'timeframe');
  const quality   = paramStr(params, 'quality');
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const series = periods.map(p => tf.ema[p]).filter(Boolean);
  if (series.length !== periods.length)
    return { pass: false, detail: `Missing EMA series for slope check on ${timeframe}` };

  const slopes   = series.map(s => slope(s));
  // Normalize each slope by the latest EMA value — keeps slope thresholds
  // comparable across price ranges (a $5 raw slope on a $30 stock means much
  // more than the same on a $300 stock).
  const normSlopes = series.map((s, i) => slopes[i] / (last(s) || 1));
  const shortest = series[0];
  const second   = series[1];

  let pass = false;
  let detail = '';

  // 0.05% normalized slope threshold — small but unambiguously positive.
  const SLOPE_THRESHOLD = 0.0005;

  if (quality === 'all_sloping') {
    pass   = normSlopes.every(s => s > SLOPE_THRESHOLD);
    detail = periods.map((p, i) =>
      `EMA${p} ${normSlopes[i] > SLOPE_THRESHOLD ? '↑' : '↓'} (${(normSlopes[i] * 100).toFixed(2)}%)`,
    ).join(' ');
  } else if (quality === 'ema200_flat') {
    const flat = Math.abs(normSlopes[normSlopes.length - 1]) < 0.005;
    pass   = normSlopes[0] > SLOPE_THRESHOLD && normSlopes[1] > SLOPE_THRESHOLD && flat;
    detail = `Longest EMA slope ${(normSlopes[normSlopes.length - 1] * 100).toFixed(2)}% (flat threshold 0.5%)`;
  } else if (quality === 'converging') {
    const gap      = shortest.slice(-5).map((v, i) => v - second.slice(-5)[i]);
    const shrinking = gap[gap.length - 1] < gap[0];
    pass   = shrinking && normSlopes[0] > SLOPE_THRESHOLD;
    detail = `EMA${periods[0]}/EMA${periods[1]} gap ${shrinking ? 'shrinking' : 'widening'}`;
  }

  return { pass, detail };
}

export function weeklyTrend(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe');
  const emaPeriod = paramNum(params, 'emaPeriod');
  const minWeeks  = paramNum(params, 'minWeeks');
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < 3)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const ema50val  = last(tf.ema[emaPeriod]);
  const lastClose = last(tf.candles)?.close;
  if (ema50val == null || lastClose == null)
    return { pass: false, detail: `No ${timeframe} EMA${emaPeriod}` };

  const aboveEma = lastClose > ema50val;

  // Skip the last bar — it is the current incomplete week (partially closed).
  // Count consecutive completed weeks going backward where close > prior close
  // (proxy for HH/HL uptrend structure; strict bar-by-bar HH+HL is too brittle).
  let hhhlCount = 0;
  const candles = tf.candles;
  for (let i = candles.length - 2; i >= 1; i--) {
    if (candles[i].close > candles[i - 1].close) hhhlCount++;
    else break;
  }

  const pass = aboveEma && hhhlCount >= minWeeks;
  return {
    pass,
    detail: `$${lastClose.toFixed(2)} ${aboveEma ? 'above' : 'below'} ${timeframe} EMA${emaPeriod} $${ema50val.toFixed(2)}, ${hhhlCount} consecutive rising weeks`,
  };
}

export function uptrendDuration(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe');
  const minWeeks  = paramNum(params, 'minWeeks');
  const maxWeeks  = paramNumOpt(params, 'maxWeeks');
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < 3)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  // Skip the last bar (current incomplete week); count completed rising weeks.
  let count = 0;
  const candles = tf.candles;
  for (let i = candles.length - 2; i >= 1; i--) {
    if (candles[i].close > candles[i - 1].close) count++;
    else break;
  }

  const pass = count >= minWeeks && (maxWeeks == null || count < maxWeeks);
  return { pass, detail: `${count} consecutive rising ${timeframe} bars` };
}

export function rsVsSpy(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const minRatio  = paramNum(params, 'minRatio');
  const maxRatio  = paramNumOpt(params, 'maxRatio');
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback', 63);
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback + 1)
    return { pass: false, detail: `Insufficient ${timeframe} data for RS (need ${lookback + 1} bars)` };

  const spy = ctx.spy.candles;
  if (spy.length < lookback + 1)
    return { pass: false, detail: 'Insufficient SPY data' };

  const stockNow = tf.candles[tf.candles.length - 1].close;
  const stockPrev = tf.candles[tf.candles.length - 1 - lookback].close;
  const spyNow   = spy[spy.length - 1].close;
  const spyPrev  = spy[spy.length - 1 - lookback].close;
  const rs       = (stockNow / stockPrev) / (spyNow / spyPrev);

  const pass = rs >= minRatio && (maxRatio == null || rs < maxRatio);
  return { pass, detail: `RS ratio ${rs.toFixed(3)} vs SPY over ${lookback} days` };
}

export function spyAboveEma(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const period   = paramNum(params, 'period');
  const spyClose = last(ctx.spy.candles)?.close;
  const spyEma   = last(ctx.spy.ema[period]);
  if (spyClose == null || spyEma == null)
    return { pass: false, detail: `No SPY data or EMA${period}` };

  const pass = spyClose > spyEma;
  return {
    pass,
    detail: `SPY $${spyClose.toFixed(2)} ${pass ? '>' : '<'} SPY EMA${period} $${spyEma.toFixed(2)}`,
  };
}
