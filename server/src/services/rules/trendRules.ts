import { StrategyContext } from '../strategy/strategyContext';

export interface RuleResult {
  pass: boolean;
  points: number;
  detail: string;
  warning?: string;
}

function last<T>(arr: T[]): T | undefined { return arr[arr.length - 1]; }
function lastN<T>(arr: T[], n: number): T[] { return arr.slice(-n); }

function slope(arr: number[], lookback = 5): number {
  const s = lastN(arr, lookback);
  return s.length < 2 ? 0 : s[s.length - 1] - s[0];
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export function priceAboveEma(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const period    = params.period    as number;
  const timeframe = params.timeframe as string;
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const close  = last(tf.candles)?.close;
  const emaVal = last(tf.ema[period]);
  if (close == null || emaVal == null)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data for EMA${period}` };

  const pass = close > emaVal;
  return {
    pass,
    points: 0,
    detail: `$${close.toFixed(2)} ${pass ? '>' : '<'} EMA${period} $${emaVal.toFixed(2)} on ${timeframe}`,
  };
}

export function emaAlignment(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const periods   = params.periods   as number[];
  const timeframe = params.timeframe as string;
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const values = periods.map(p => ({ period: p, val: last(tf.ema[p]) }));
  if (values.some(v => v.val == null))
    return { pass: false, points: 0, detail: `Missing EMA data for periods ${periods.join(', ')} on ${timeframe}` };

  // Each EMA must be greater than the next (periods assumed ascending: [20, 50, 200])
  const pass = values.every((v, i) => i === 0 || values[i - 1].val! > v.val!);
  const detail = values.map(v => `EMA${v.period} $${v.val!.toFixed(2)}`).join(' / ');
  return { pass, points: 0, detail };
}

export function emaAlignmentSlope(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const periods   = params.periods   as number[];
  const timeframe = params.timeframe as string;
  const quality   = params.quality   as string;
  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, points: 0, detail: `No ${timeframe} data` };

  const series = periods.map(p => tf.ema[p]).filter(Boolean);
  if (series.length !== periods.length)
    return { pass: false, points: 0, detail: `Missing EMA series for slope check on ${timeframe}` };

  const slopes   = series.map(s => slope(s));
  const shortest = series[0];
  const second   = series[1];

  let pass = false;
  let detail = '';

  if (quality === 'all_sloping') {
    pass   = slopes.every(s => s > 0);
    detail = periods.map((p, i) => `EMA${p} ${slopes[i] > 0 ? '↑' : '↓'}`).join(' ');
  } else if (quality === 'ema200_flat') {
    const lastPeriod = series[series.length - 1];
    const refVal     = last(lastPeriod) ?? 1;
    const flat       = Math.abs(slopes[slopes.length - 1]) / refVal < 0.005;
    pass   = slopes[0] > 0 && slopes[1] > 0 && flat;
    detail = `Longest EMA slope ${(slopes[slopes.length - 1] / refVal * 100).toFixed(2)}% (flat threshold 0.5%)`;
  } else if (quality === 'converging') {
    const gap      = shortest.slice(-5).map((v, i) => v - second.slice(-5)[i]);
    const shrinking = gap[gap.length - 1] < gap[0];
    pass   = shrinking && slopes[0] > 0;
    detail = `EMA${periods[0]}/EMA${periods[1]} gap ${shrinking ? 'shrinking' : 'widening'}`;
  }

  return { pass, points: 0, detail };
}

export function weeklyTrend(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = params.timeframe as string;
  const emaPeriod = params.emaPeriod as number;
  const minWeeks  = params.minWeeks  as number;
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < 3)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data` };

  const ema50val  = last(tf.ema[emaPeriod]);
  const lastClose = last(tf.candles)?.close;
  if (ema50val == null || lastClose == null)
    return { pass: false, points: 0, detail: `No ${timeframe} EMA${emaPeriod}` };

  const aboveEma = lastClose > ema50val;
  let hhhlCount  = 0;
  const candles  = tf.candles;
  for (let i = candles.length - 1; i >= 1; i--) {
    if (candles[i].high > candles[i - 1].high && candles[i].low > candles[i - 1].low) hhhlCount++;
    else break;
  }

  const pass = aboveEma && hhhlCount >= minWeeks;
  return {
    pass,
    points: 0,
    detail: `$${lastClose.toFixed(2)} ${aboveEma ? 'above' : 'below'} ${timeframe} EMA${emaPeriod} $${ema50val.toFixed(2)}, ${hhhlCount} consecutive HH/HL bars`,
  };
}

export function uptrendDuration(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = params.timeframe as string;
  const minWeeks  = params.minWeeks  as number;
  const maxWeeks  = params.maxWeeks  as number | undefined;
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < 3)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data` };

  let count = 0;
  const candles = tf.candles;
  for (let i = candles.length - 1; i >= 1; i--) {
    if (candles[i].high > candles[i - 1].high || candles[i].low > candles[i - 1].low) count++;
    else if (candles[i].close < candles[i - 1].close) break;
  }

  const pass = count >= minWeeks && (maxWeeks == null || count < maxWeeks);
  return { pass, points: 0, detail: `${count} ${timeframe} bars of uptrend structure` };
}

export function rsVsSpy(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const minRatio  = params.minRatio  as number;
  const maxRatio  = params.maxRatio  as number | undefined;
  const timeframe = (params.timeframe as string | undefined) ?? '1D';
  const lookback  = (params.lookback  as number | undefined) ?? 63;
  const tf = ctx.timeframes[timeframe];
  if (!tf || tf.candles.length < lookback + 1)
    return { pass: false, points: 0, detail: `Insufficient ${timeframe} data for RS (need ${lookback + 1} bars)` };

  const spy = ctx.spy.candles;
  if (spy.length < lookback + 1)
    return { pass: false, points: 0, detail: 'Insufficient SPY data' };

  const stockNow = tf.candles[tf.candles.length - 1].close;
  const stockPrev = tf.candles[tf.candles.length - 1 - lookback].close;
  const spyNow   = spy[spy.length - 1].close;
  const spyPrev  = spy[spy.length - 1 - lookback].close;
  const rs       = (stockNow / stockPrev) / (spyNow / spyPrev);

  const pass = rs >= minRatio && (maxRatio == null || rs < maxRatio);
  return { pass, points: 0, detail: `RS ratio ${rs.toFixed(3)} vs SPY over ${lookback} days` };
}

export function spyAboveEma(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const period   = params.period as number;
  const spyClose = last(ctx.spy.candles)?.close;
  const spyEma   = last(ctx.spy.ema[period]);
  if (spyClose == null || spyEma == null)
    return { pass: false, points: 0, detail: `No SPY data or EMA${period}` };

  const pass = spyClose > spyEma;
  return {
    pass,
    points: 0,
    detail: `SPY $${spyClose.toFixed(2)} ${pass ? '>' : '<'} SPY EMA${period} $${spyEma.toFixed(2)}`,
  };
}
