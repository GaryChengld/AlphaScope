import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import { last, compute60dRangeStats, RangeStats, paramNum, paramStr, paramNumOpt } from './helpers';

interface RangeBundle {
  stats:   RangeStats | null;
  atrLast: number | undefined;
  close:   number | undefined;
}

function getRangeStats(
  ctx: StrategyContext,
  timeframe: string,
  lookback: number,
  atrPeriod: number,
  tolerance: number,
): RangeBundle {
  const tf      = ctx.timeframes[timeframe];
  const candles = tf?.candles ?? [];
  const atrLast = last(tf?.atr[atrPeriod]);
  const close   = last(candles)?.close;
  const stats   = compute60dRangeStats(candles, atrLast, lookback, tolerance);
  return { stats, atrLast, close };
}

// ─── Anchor rule ─────────────────────────────────────────────────────────────

export function rangeBound(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe   = paramStr(params, 'timeframe', '1D');
  const lookback    = paramNum(params, 'lookback', 60);
  const atrPeriod   = paramNum(params, 'atrPeriod', 14);
  const maxWidthAtr = paramNum(params, 'maxWidthAtr', 5);
  const minTouches  = paramNum(params, 'minTouches', 2);
  const tolerance   = paramNum(params, 'tolerance', 0.02);

  const { stats } = getRangeStats(ctx, timeframe, lookback, atrPeriod, tolerance);
  if (!stats) return { pass: false, detail: `Insufficient ${timeframe} data (need ≥${lookback} bars with valid ATR${atrPeriod})` };

  if (stats.widthAtr > maxWidthAtr)
    return { pass: false, detail: `Range width ${stats.widthAtr.toFixed(2)}× ATR exceeds max ${maxWidthAtr}× (high $${stats.high.toFixed(2)}, low $${stats.low.toFixed(2)})` };

  const minBound = Math.min(stats.upperTouches, stats.lowerTouches);
  if (minBound < minTouches)
    return { pass: false, detail: `Insufficient touches: upper ${stats.upperTouches}, lower ${stats.lowerTouches} (need ≥${minTouches} each)` };

  return {
    pass:   true,
    detail: `${lookback}-day range $${stats.low.toFixed(2)}–$${stats.high.toFixed(2)} (${stats.widthAtr.toFixed(1)}× ATR), upper touches ${stats.upperTouches}, lower touches ${stats.lowerTouches}`,
  };
}

// ─── Scoring rules ────────────────────────────────────────────────────────────

export function rangeTouchCount(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe    = paramStr(params, 'timeframe', '1D');
  const lookback     = paramNum(params, 'lookback', 60);
  const atrPeriod    = paramNum(params, 'atrPeriod', 14);
  const tolerance    = paramNum(params, 'tolerance', 0.02);
  const minPerBound  = paramNum(params, 'minPerBound');

  const { stats } = getRangeStats(ctx, timeframe, lookback, atrPeriod, tolerance);
  if (!stats) return { pass: false, detail: 'No range stats' };

  const minBound = Math.min(stats.upperTouches, stats.lowerTouches);
  const pass = minBound >= minPerBound;
  return {
    pass,
    detail: `Min touches per bound: ${minBound} (upper ${stats.upperTouches}, lower ${stats.lowerTouches}, need ≥${minPerBound})`,
  };
}

export function rangeDuration(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback', 60);
  const atrPeriod = paramNum(params, 'atrPeriod', 14);
  const tolerance = paramNum(params, 'tolerance', 0.02);
  const minWeeks  = paramNum(params, 'minWeeks');
  const maxWeeks  = paramNumOpt(params, 'maxWeeks');

  const { stats } = getRangeStats(ctx, timeframe, lookback, atrPeriod, tolerance);
  if (!stats) return { pass: false, detail: 'No range stats' };

  const weeks = stats.weeksSinceFirstTouch;
  const pass  = weeks >= minWeeks && (maxWeeks == null || weeks < maxWeeks);
  return {
    pass,
    detail: `Range duration since first qualifying touch: ${weeks.toFixed(1)} weeks (need ${minWeeks}${maxWeeks != null ? `–${maxWeeks}` : '+'}w)`,
  };
}

export function rangeWidth(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback', 60);
  const atrPeriod = paramNum(params, 'atrPeriod', 14);
  const max       = paramNum(params, 'max');
  const min       = paramNumOpt(params, 'min') ?? 0;

  const { stats } = getRangeStats(ctx, timeframe, lookback, atrPeriod, 0.02);
  if (!stats) return { pass: false, detail: 'No range stats' };

  const pass = stats.widthAtr >= min && stats.widthAtr < max;
  return {
    pass,
    detail: `Range width ${stats.widthAtr.toFixed(2)}× ATR${atrPeriod} (need ${min}–${max}×)`,
  };
}

export function nearRangeLow(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe      = paramStr(params, 'timeframe', '1D');
  const lookback       = paramNum(params, 'lookback', 60);
  const atrPeriod      = paramNum(params, 'atrPeriod', 14);
  const maxAtrMultiple = paramNum(params, 'maxAtrMultiple', 1.0);

  const { stats, atrLast, close } = getRangeStats(ctx, timeframe, lookback, atrPeriod, 0.02);
  if (!stats || atrLast == null || close == null)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const dist = (close - stats.low) / atrLast;
  const pass = dist <= maxAtrMultiple;
  return {
    pass,
    detail: `Close $${close.toFixed(2)} is ${dist.toFixed(2)}× ATR above 60d low $${stats.low.toFixed(2)} (max ${maxAtrMultiple}×)`,
  };
}

export function rangeFloorProximity(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe      = paramStr(params, 'timeframe', '1D');
  const lookback       = paramNum(params, 'lookback', 60);
  const atrPeriod      = paramNum(params, 'atrPeriod', 14);
  const maxAtrMultiple = paramNum(params, 'maxAtrMultiple');

  const { stats, atrLast, close } = getRangeStats(ctx, timeframe, lookback, atrPeriod, 0.02);
  if (!stats || atrLast == null || close == null)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const dist = (close - stats.low) / atrLast;
  const pass = dist <= maxAtrMultiple;
  return {
    pass,
    detail: `Distance from range floor: ${dist.toFixed(2)}× ATR${atrPeriod} (threshold ${maxAtrMultiple}×)`,
  };
}

export function rangeMidpointDistance(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const lookback  = paramNum(params, 'lookback', 60);
  const atrPeriod = paramNum(params, 'atrPeriod', 14);
  const minPct    = paramNum(params, 'minPct');
  const maxPct    = paramNumOpt(params, 'maxPct');

  const { stats, close } = getRangeStats(ctx, timeframe, lookback, atrPeriod, 0.02);
  if (!stats || close == null)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  if (stats.midpoint <= 0) return { pass: false, detail: 'Zero midpoint' };
  const pctBelow = (stats.midpoint - close) / stats.midpoint * 100;
  const pass = pctBelow >= minPct && (maxPct == null || pctBelow < maxPct);
  return {
    pass,
    detail: `Close $${close.toFixed(2)} is ${pctBelow.toFixed(1)}% below 60d midpoint $${stats.midpoint.toFixed(2)} (need ≥${minPct}%${maxPct != null ? ` <${maxPct}%` : ''})`,
  };
}
