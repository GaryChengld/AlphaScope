import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import { last, paramNum, paramStr } from './helpers';

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
  const tradingDays = paramNum(params, 'tradingDays');

  if (!ctx.earningsDate)
    return { pass: true, detail: 'No upcoming earnings date found' };

  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  const earnings = new Date(ctx.earningsDate);
  earnings.setHours(0, 0, 0, 0);

  // Past earnings dates pass intentionally: a stock that just reported is no
  // longer at risk of an earnings surprise during the trade window — the gate
  // is "no earnings event coming up," not "had an earnings event recently."
  // Note: businessDaysBetween returns 0 (not negative) when from > to, so we
  // must compare dates directly before calling it.
  if (earnings < today)
    return { pass: true, detail: `Earnings date ${ctx.earningsDate} is in the past` };

  const days = businessDaysBetween(today, earnings);
  const pass = days > tradingDays;
  return {
    pass,
    detail: `Next earnings: ${ctx.earningsDate} (${days} trading days away)`,
  };
}

export function sectorStrength(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const topN = paramNum(params, 'topN');

  if (!ctx.sectorEtf)
    return { pass: false, detail: 'Sector ETF not identified for this stock' };

  const returns = ctx.sectorReturns;
  if (Object.keys(returns).length === 0)
    return { pass: false, detail: 'No sector return data available' };

  const ranked = Object.entries(returns)
    .sort(([, a], [, b]) => b - a)
    .map(([etf]) => etf);

  const rank = ranked.indexOf(ctx.sectorEtf) + 1;
  if (rank === 0)
    return { pass: false, detail: `${ctx.sectorEtf} not in sector return data` };

  const ret  = (returns[ctx.sectorEtf] * 100).toFixed(1);
  const pass = rank <= topN;
  return {
    pass,
    detail: `${ctx.sectorEtf} ranked #${rank} of ${ranked.length} sectors (30d return: ${ret}%)`,
  };
}

export function marketRegime(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const maxVix       = paramNum(params, 'maxVix');
  const spyEmaPeriod = paramNum(params, 'spyEmaPeriod', 200);

  const spyClose = last(ctx.spy.candles)?.close;
  const spyEma   = last(ctx.spy.ema[spyEmaPeriod]);
  const vix      = ctx.vix;

  if (spyClose == null || spyEma == null)
    return { pass: false, detail: `No SPY data or EMA${spyEmaPeriod}` };

  const spyUp = spyClose > spyEma;
  const vixOk = vix != null ? vix <= maxVix : false;
  const pass  = spyUp && vixOk;

  const vixStr = vix != null ? vix.toFixed(1) : 'N/A';
  return {
    pass,
    detail: `SPY $${spyClose.toFixed(2)} ${spyUp ? '>' : '<'} SPY EMA${spyEmaPeriod} $${spyEma.toFixed(2)}, VIX ${vixStr} (max ${maxVix})`,
  };
}

export function manualReview(_ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const label = paramStr(params, 'label');
  return {
    pass:    false,
    detail:  label,
    warning: 'Manual review required',
  };
}
