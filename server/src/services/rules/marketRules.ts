import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './trendRules';

function last<T>(arr: T[]): T | undefined { return arr[arr.length - 1]; }

function businessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur < end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export function noNearEarnings(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const tradingDays = params.tradingDays as number;

  if (!ctx.earningsDate)
    return { pass: true, points: 0, detail: 'No upcoming earnings date found' };

  const today    = new Date();
  const earnings = new Date(ctx.earningsDate);
  const days     = businessDaysBetween(today, earnings);

  if (days < 0)
    return { pass: true, points: 0, detail: `Earnings date ${ctx.earningsDate} is in the past` };

  const pass = days > tradingDays;
  return {
    pass,
    points: 0,
    detail: `Next earnings: ${ctx.earningsDate} (${days} trading days away)`,
  };
}

export function sectorStrength(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const topN = params.topN as number;

  if (!ctx.sectorEtf)
    return { pass: false, points: 0, detail: 'Sector ETF not identified for this stock' };

  const returns = ctx.sectorReturns;
  if (Object.keys(returns).length === 0)
    return { pass: false, points: 0, detail: 'No sector return data available' };

  const ranked = Object.entries(returns)
    .sort(([, a], [, b]) => b - a)
    .map(([etf]) => etf);

  const rank = ranked.indexOf(ctx.sectorEtf) + 1;
  if (rank === 0)
    return { pass: false, points: 0, detail: `${ctx.sectorEtf} not in sector return data` };

  const ret  = (returns[ctx.sectorEtf] * 100).toFixed(1);
  const pass = rank <= topN;
  return {
    pass,
    points: 0,
    detail: `${ctx.sectorEtf} ranked #${rank} of ${ranked.length} sectors (30d return: ${ret}%)`,
  };
}

export function marketRegime(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const maxVix      = params.maxVix      as number;
  const spyEmaPeriod = (params.spyEmaPeriod as number | undefined) ?? 200;

  const spyClose = last(ctx.spy.candles)?.close;
  const spyEma   = last(ctx.spy.ema[spyEmaPeriod]);
  const vix      = ctx.vix;

  if (spyClose == null || spyEma == null)
    return { pass: false, points: 0, detail: `No SPY data or EMA${spyEmaPeriod}` };

  const spyUp = spyClose > spyEma;
  const vixOk = vix != null ? vix <= maxVix : false;
  const pass  = spyUp && vixOk;

  const vixStr = vix != null ? vix.toFixed(1) : 'N/A';
  return {
    pass,
    points: 0,
    detail: `SPY $${spyClose.toFixed(2)} ${spyUp ? '>' : '<'} SPY EMA${spyEmaPeriod} $${spyEma.toFixed(2)}, VIX ${vixStr} (max ${maxVix})`,
  };
}

export function manualReview(_ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const label = params.label as string;
  return {
    pass:    false,
    points:  0,
    detail:  label,
    warning: 'Manual review required',
  };
}
