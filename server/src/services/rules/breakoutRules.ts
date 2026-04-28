import { StrategyContext } from '../strategy/strategyContext';
import { OhlcvRow } from '../stockService';
import { RuleResult } from './types';
import {
  last,
  detectConsolidation,
  Consolidation,
  paramNum,
  paramStr,
  paramNumOpt,
} from './helpers';

// All consolidation-anchored rules share a single detection helper. Default
// window (10..40 days, ≤10% width) matches the strategy mandatory gate; rules
// can override via params if needed.
function getConsolidation(
  ctx: StrategyContext,
  timeframe: string,
  minDays   = 10,
  maxDays   = 40,
  maxWidthPct = 10,
): { tfCandles: OhlcvRow[] | null; cons: Consolidation | null } {
  const tfCandles = tfFromCtx(ctx, timeframe);
  if (!tfCandles) return { tfCandles: null, cons: null };
  return { tfCandles, cons: detectConsolidation(tfCandles, minDays, maxDays, maxWidthPct) };
}

function tfFromCtx(ctx: StrategyContext, timeframe: string): OhlcvRow[] | null {
  return ctx.timeframes[timeframe]?.candles ?? null;
}

// ─── Mandatory anchor + width / duration ─────────────────────────────────────

export function consolidationDetected(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe   = paramStr(params, 'timeframe', '1D');
  const minDays     = paramNum(params, 'minDays', 10);
  const maxDays     = paramNum(params, 'maxDays', 40);
  const minWidthPct = paramNum(params, 'minWidthPct', 0);
  const maxWidthPct = paramNum(params, 'maxWidthPct', 10);

  const { tfCandles, cons } = getConsolidation(ctx, timeframe, minDays, maxDays, maxWidthPct);
  if (!tfCandles) return { pass: false, detail: `No ${timeframe} data` };
  if (!cons) return { pass: false, detail: `No qualifying ${minDays}–${maxDays}-bar consolidation (≤${maxWidthPct}% width) found` };
  if (cons.widthPct < minWidthPct) return { pass: false, detail: `Width ${cons.widthPct.toFixed(1)}% is below minimum ${minWidthPct}%` };

  return {
    pass:   true,
    detail: `${cons.durationDays}-bar consolidation: high $${cons.high.toFixed(2)}, low $${cons.low.toFixed(2)}, width ${cons.widthPct.toFixed(1)}%`,
  };
}

export function consolidationWidth(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const min       = paramNum(params, 'min');
  const max       = paramNum(params, 'max');

  const { cons } = getConsolidation(ctx, timeframe);
  if (!cons) return { pass: false, detail: 'No consolidation detected' };

  const pass = cons.widthPct >= min && cons.widthPct <= max;
  return { pass, detail: `Width ${cons.widthPct.toFixed(1)}% (need ${min}–${max}%)` };
}

export function consolidationDuration(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const minDays   = paramNum(params, 'minDays');
  const maxDays   = paramNum(params, 'maxDays');

  const { cons } = getConsolidation(ctx, timeframe);
  if (!cons) return { pass: false, detail: 'No consolidation detected' };

  const pass = cons.durationDays >= minDays && cons.durationDays <= maxDays;
  return { pass, detail: `Duration ${cons.durationDays} bars (need ${minDays}–${maxDays})` };
}

// ─── BB squeeze ──────────────────────────────────────────────────────────────

// Latest BB(period, stdDev) width must fall within the lowest `maxPercentile`
// of widths over the last `lookback` bars. `maxPercentile: 0` means "at the
// 90-day low" exactly.
export function bbSqueeze(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe     = paramStr(params, 'timeframe', '1D');
  const lookback      = paramNum(params, 'lookback', 90);
  const maxPercentile = paramNum(params, 'maxPercentile');
  const period        = paramNum(params, 'period', 20);
  const stdDev        = paramNum(params, 'stdDev', 2);

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const series = tf.bb.find(b => b.period === period && b.stdDev === stdDev);
  if (!series || series.middle.length < lookback)
    return { pass: false, detail: `Insufficient BB(${period},${stdDev}) data` };

  const widths = series.upper.map((u, i) => {
    const m = series.middle[i];
    return m === 0 ? 0 : (u - series.lower[i]) / m;
  });
  const window  = widths.slice(-lookback);
  const current = window[window.length - 1];

  // Percentile of `current` within `window` (0 = lowest, 100 = highest).
  const lowerCount = window.filter(w => w < current).length;
  const percentile = (lowerCount / window.length) * 100;

  // Special case: maxPercentile === 0 means we want exactly the minimum.
  const pass = maxPercentile === 0
    ? current === Math.min(...window)
    : percentile <= maxPercentile;

  return {
    pass,
    detail: `BB(${period},${stdDev}) width at ${percentile.toFixed(0)}th percentile of last ${lookback} bars`,
  };
}

// ─── Prior trend before base ─────────────────────────────────────────────────

export function priorTrendBeforeBase(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe    = paramStr(params, 'timeframe', '1D');
  const lookbackDays = paramNum(params, 'lookbackDays', 30);
  const minGainPct   = paramNum(params, 'minGainPct');

  const tfCandles = tfFromCtx(ctx, timeframe);
  if (!tfCandles) return { pass: false, detail: `No ${timeframe} data` };
  const { cons } = getConsolidation(ctx, timeframe);
  if (!cons) return { pass: false, detail: 'No consolidation detected' };

  // Measure gain over `lookbackDays` ending at the bar before the consolidation
  // started. This captures the run-up that built the base.
  const endIdx   = cons.startIdx - 1;
  const startIdx = endIdx - lookbackDays;
  if (startIdx < 0) return { pass: false, detail: `Insufficient ${timeframe} history before consolidation` };

  const startClose = tfCandles[startIdx].close;
  const endClose   = tfCandles[endIdx].close;
  if (startClose <= 0) return { pass: false, detail: 'Invalid start close' };

  const gainPct = ((endClose - startClose) / startClose) * 100;
  const pass    = gainPct >= minGainPct;
  return {
    pass,
    detail: `${lookbackDays}-bar gain before base: ${gainPct.toFixed(1)}% (need ≥${minGainPct}%)`,
  };
}

// ─── Breakout confirmation / extension ───────────────────────────────────────

export function breakoutConfirmed(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');

  const tfCandles = tfFromCtx(ctx, timeframe);
  if (!tfCandles) return { pass: false, detail: `No ${timeframe} data` };
  const { cons } = getConsolidation(ctx, timeframe);
  if (!cons) return { pass: false, detail: 'No consolidation detected' };

  const close = last(tfCandles)?.close;
  if (close == null) return { pass: false, detail: 'No latest close' };

  const pass = close > cons.high;
  return {
    pass,
    detail: `Close $${close.toFixed(2)} ${pass ? '>' : '≤'} consolidation high $${cons.high.toFixed(2)}`,
  };
}

export function breakoutNotExtended(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe       = paramStr(params, 'timeframe', '1D');
  const maxExtensionPct = paramNum(params, 'maxExtensionPct');

  const tfCandles = tfFromCtx(ctx, timeframe);
  if (!tfCandles) return { pass: false, detail: `No ${timeframe} data` };
  const { cons } = getConsolidation(ctx, timeframe);
  if (!cons) return { pass: false, detail: 'No consolidation detected' };

  const close = last(tfCandles)?.close;
  if (close == null) return { pass: false, detail: 'No latest close' };

  const extPct = ((close - cons.high) / cons.high) * 100;
  const pass   = extPct <= maxExtensionPct;
  return {
    pass,
    detail: `Close $${close.toFixed(2)} is ${extPct.toFixed(1)}% above breakout level (max ${maxExtensionPct}%)`,
  };
}

// ─── Consolidation volume sanity ─────────────────────────────────────────────

export function consolidationVolumeSane(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const avgWindow = paramNum(params, 'avgWindow', 20);
  const maxRatio  = paramNum(params, 'maxRatio', 3);

  const tfCandles = tfFromCtx(ctx, timeframe);
  if (!tfCandles) return { pass: false, detail: `No ${timeframe} data` };
  const { cons } = getConsolidation(ctx, timeframe);
  if (!cons) return { pass: false, detail: 'No consolidation detected' };

  const baselineEnd   = cons.startIdx;
  const baselineStart = baselineEnd - avgWindow;
  if (baselineStart < 0)
    return { pass: false, detail: 'Insufficient pre-consolidation history for volume baseline' };

  const baseline = tfCandles.slice(baselineStart, baselineEnd);
  const avgVol   = baseline.reduce((s, c) => s + c.volume, 0) / baseline.length;
  if (avgVol === 0) return { pass: false, detail: 'Zero baseline volume' };

  const consSlice = tfCandles.slice(cons.startIdx, cons.endIdx + 1);
  let maxBarRatio = 0;
  for (const c of consSlice) {
    const r = c.volume / avgVol;
    if (r > maxBarRatio) maxBarRatio = r;
  }

  const pass = maxBarRatio < maxRatio;
  return {
    pass,
    detail: `Max consolidation bar volume: ${maxBarRatio.toFixed(2)}× ${avgWindow}-bar pre-base avg (limit ${maxRatio}×)`,
  };
}

// ─── Liquidity ──────────────────────────────────────────────────────────────

export function liquidityFloor(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const avgWindow = paramNum(params, 'avgWindow', 20);
  const minDollar = paramNum(params, 'minDollar');

  const tfCandles = tfFromCtx(ctx, timeframe);
  if (!tfCandles || tfCandles.length < avgWindow + 1)
    return { pass: false, detail: `Insufficient ${timeframe} data` };

  const window = tfCandles.slice(-avgWindow);
  const avgDollar = window.reduce((s, c) => s + c.close * c.volume, 0) / window.length;
  const pass      = avgDollar >= minDollar;
  return {
    pass,
    detail: `${avgWindow}-bar avg dollar volume: $${(avgDollar / 1e6).toFixed(1)}M (need ≥$${(minDollar / 1e6).toFixed(0)}M)`,
  };
}

// ─── Breakout candle quality ─────────────────────────────────────────────────

export function breakoutCloseStrength(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe   = paramStr(params, 'timeframe', '1D');
  const minRangePct = paramNum(params, 'minRangePct');

  const tfCandles = tfFromCtx(ctx, timeframe);
  if (!tfCandles) return { pass: false, detail: `No ${timeframe} data` };
  const bar = last(tfCandles);
  if (!bar) return { pass: false, detail: 'No latest bar' };

  const range = bar.high - bar.low;
  if (range <= 0) return { pass: false, detail: 'Zero-range bar' };

  const closePct = (bar.close - bar.low) / range;
  const pass     = closePct >= minRangePct;
  return {
    pass,
    detail: `Close at ${(closePct * 100).toFixed(0)}% of bar range (need ≥${(minRangePct * 100).toFixed(0)}%)`,
  };
}

export function breakoutCandleSize(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const atrPeriod = paramNum(params, 'atrPeriod', 14);
  const min       = paramNum(params, 'min');
  const max       = paramNumOpt(params, 'max');

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };
  const bar = last(tf.candles);
  const atr = last(tf.atr[atrPeriod]);
  if (!bar || atr == null) return { pass: false, detail: 'Insufficient candle/ATR data' };
  if (atr === 0) return { pass: false, detail: 'Zero ATR' };

  const ratio = (bar.high - bar.low) / atr;
  const pass  = ratio >= min && (max == null || ratio < max);
  return {
    pass,
    detail: `Breakout candle range ${ratio.toFixed(2)}× ATR${atrPeriod}`,
  };
}

// ─── Larger structure ────────────────────────────────────────────────────────

export function largerStructurePosition(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe = paramStr(params, 'timeframe', '1D');
  const quality   = paramStr(params, 'quality');

  const tfCandles = tfFromCtx(ctx, timeframe);
  if (!tfCandles || tfCandles.length < 252)
    return { pass: false, detail: `Need ≥252 ${timeframe} bars for 52w structure check` };

  const close = last(tfCandles)!.close;

  const high52w   = Math.max(...tfCandles.slice(-252).map(c => c.high));
  const high6mo   = Math.max(...tfCandles.slice(-126).map(c => c.high));
  const high3mo   = Math.max(...tfCandles.slice(-63).map(c => c.high));

  // For "intermediate base", measure how many bars the consolidation was —
  // 8–12 weeks ≈ 40–60 trading days. A consolidation in that range qualifies.
  const cons = detectConsolidation(tfCandles, 10, 80, 15);

  if (quality === 'new_high') {
    const pass = close >= high52w * 0.99 || (cons != null && cons.durationDays >= 126);
    return { pass, detail: `Close $${close.toFixed(2)} vs 52w high $${high52w.toFixed(2)}` };
  }
  if (quality === 'intermediate_base') {
    const pass = cons != null && cons.durationDays >= 40 && cons.durationDays <= 60;
    return {
      pass,
      detail: cons
        ? `Consolidation duration ${cons.durationDays} bars (intermediate = 40–60)`
        : 'No consolidation detected',
    };
  }
  if (quality === 'below_resistance') {
    const pass = close < high6mo * 0.95 || close < high3mo * 0.97;
    return { pass, detail: `Close $${close.toFixed(2)} below 6mo high $${high6mo.toFixed(2)} / 3mo high $${high3mo.toFixed(2)}` };
  }

  return { pass: false, detail: `Unknown quality: ${quality}` };
}

// ─── MACD ───────────────────────────────────────────────────────────────────

export function macdBullishCrossAboveZero(ctx: StrategyContext, params: Record<string, unknown>): RuleResult {
  const timeframe    = paramStr(params, 'timeframe', '1D');
  const lookbackBars = paramNum(params, 'lookbackBars', 5);
  const fast         = paramNum(params, 'fast', 12);
  const slow         = paramNum(params, 'slow', 26);
  const signal       = paramNum(params, 'signal', 9);

  const tf = ctx.timeframes[timeframe];
  if (!tf) return { pass: false, detail: `No ${timeframe} data` };

  const series = tf.macd.find(m => m.fast === fast && m.slow === slow && m.signal === signal);
  if (!series || series.macd.length < lookbackBars + 1)
    return { pass: false, detail: `Insufficient MACD(${fast},${slow},${signal}) data` };

  // Look for a bullish cross (MACD crossing above signal line) within the
  // last `lookbackBars` bars where both MACD and signal were ≥ 0 at the cross.
  const macdArr  = series.macd;
  const sigArr   = series.signalLine;
  const startIdx = Math.max(1, macdArr.length - lookbackBars);

  for (let i = macdArr.length - 1; i >= startIdx; i--) {
    const macdNow  = macdArr[i];
    const macdPrev = macdArr[i - 1];
    const sigNow   = sigArr[i];
    const sigPrev  = sigArr[i - 1];
    if (![macdNow, macdPrev, sigNow, sigPrev].every(Number.isFinite)) continue;
    if (macdPrev <= sigPrev && macdNow > sigNow && macdNow >= 0 && sigNow >= 0) {
      return {
        pass: true,
        detail: `MACD bullish cross above zero ${macdArr.length - 1 - i} bar(s) ago (MACD ${macdNow.toFixed(3)}, signal ${sigNow.toFixed(3)})`,
      };
    }
  }
  return { pass: false, detail: `No bullish MACD cross above zero in last ${lookbackBars} bars` };
}
