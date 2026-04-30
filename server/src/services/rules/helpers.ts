import { StrategyContext } from '../strategy/strategyContext';
import { OhlcvRow } from '../stockService';

// ─── Series helpers ──────────────────────────────────────────────────────────

export function last<T>(arr: T[] | undefined | null): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr[arr.length - 1];
}

export function lastN<T>(arr: T[] | undefined | null, n: number): T[] {
  if (!arr) return [];
  return arr.slice(-n);
}

export function slope(arr: number[], lookback = 5): number {
  const s = lastN(arr, lookback);
  return s.length < 2 ? 0 : s[s.length - 1] - s[0];
}

// ─── Swing high / round-number helpers ──────────────────────────────────────

export interface SwingHigh {
  price:    number;
  barsAgo:  number;
}

export function findSwingHigh(
  ctx: StrategyContext,
  timeframe: string,
  lookback: number,
): SwingHigh | null {
  const candles = ctx.timeframes[timeframe]?.candles ?? [];
  if (candles.length < lookback) return null;
  const slice = candles.slice(-lookback);
  let maxHigh = -Infinity, maxIdx = 0;
  slice.forEach((c, i) => { if (c.high > maxHigh) { maxHigh = c.high; maxIdx = i; } });
  return { price: maxHigh, barsAgo: lookback - 1 - maxIdx };
}

export function priorSwingHigh(candles: OhlcvRow[], lookback: number): number | null {
  if (candles.length < lookback * 2) return null;
  return Math.max(...candles.slice(-lookback * 2, -lookback).map(c => c.high));
}

// ─── Consolidation detection ────────────────────────────────────────────────
// Searches the most recent N bars (excluding the current bar) for a sideways
// window of length minDays..maxDays whose width = (high − low) / breakoutLevel
// is ≤ maxWidthPct. Returns the longest qualifying window, anchored to end at
// the bar just before the current one. Used by all consolidation-aware rules.

export interface Consolidation {
  startIdx:    number;   // index in candles[] where the window starts (inclusive)
  endIdx:      number;   // index where it ends (inclusive — bar before current)
  high:        number;
  low:         number;
  widthPct:    number;
  durationDays: number;
}

export function detectConsolidation(
  candles: OhlcvRow[],
  minDays: number,
  maxDays: number,
  maxWidthPct: number,
): Consolidation | null {
  if (candles.length < minDays + 1) return null;

  // The "current bar" is the last candle (the potential breakout bar). The
  // consolidation window ends one bar before that.
  const endIdx = candles.length - 2;
  if (endIdx < minDays - 1) return null;

  // Try the longest window first (favours rich bases over barely-sideways ones).
  const limit = Math.min(maxDays, endIdx + 1);
  for (let len = limit; len >= minDays; len--) {
    const startIdx = endIdx - len + 1;
    const slice    = candles.slice(startIdx, endIdx + 1);
    const high     = Math.max(...slice.map(c => c.high));
    const low      = Math.min(...slice.map(c => c.low));
    if (high <= 0) continue;
    const widthPct = ((high - low) / high) * 100;
    if (widthPct <= maxWidthPct) {
      return { startIdx, endIdx, high, low, widthPct, durationDays: len };
    }
  }
  return null;
}

// Price-scaled "round number" — for a $30 stock, $5 increments are psychologically
// significant; for a $300 stock, $25 increments are. Returns the nearest round
// price using the appropriate grid for the price band.
export function nearestRoundNumber(close: number): { value: number; distance: number } {
  const grid = close < 50 ? 5 : close <= 200 ? 10 : 25;
  const value = Math.round(close / grid) * grid;
  return { value, distance: Math.abs(close - value) };
}

// ─── 60-day range stats ──────────────────────────────────────────────────────
// Fixed-window range helper for mean-reversion strategies. Unlike detectConsolidation
// (which auto-sizes the window), this always uses the last `lookback` bars.

export interface RangeStats {
  high:                 number;
  low:                  number;
  midpoint:             number;
  widthAtr:             number;
  upperTouches:         number;
  lowerTouches:         number;
  durationDays:         number;
  weeksSinceFirstTouch: number;
}

export function compute60dRangeStats(
  candles: OhlcvRow[],
  atrLast: number | undefined,
  lookback = 60,
  tolerance = 0.02,
): RangeStats | null {
  if (candles.length < lookback || atrLast == null || atrLast <= 0) return null;
  const slice = candles.slice(-lookback);
  const high  = Math.max(...slice.map(c => c.high));
  const low   = Math.min(...slice.map(c => c.low));
  if (high <= 0) return null;

  const upperBand = high * (1 - tolerance);
  const lowerBand = low  * (1 + tolerance);
  let upperTouches = 0, lowerTouches = 0, firstTouchIdx = -1;
  slice.forEach((c, i) => {
    const upperHit = c.high >= upperBand;
    const lowerHit = c.low  <= lowerBand;
    if (upperHit) upperTouches++;
    if (lowerHit) lowerTouches++;
    if ((upperHit || lowerHit) && firstTouchIdx === -1) firstTouchIdx = i;
  });

  const barsSinceFirst      = firstTouchIdx >= 0 ? lookback - firstTouchIdx : 0;
  const weeksSinceFirstTouch = barsSinceFirst / 5;

  return {
    high, low,
    midpoint: (high + low) / 2,
    widthAtr: (high - low) / atrLast,
    upperTouches, lowerTouches,
    durationDays: lookback,
    weeksSinceFirstTouch,
  };
}

// ─── Swing low helper ────────────────────────────────────────────────────────

export interface SwingLow {
  price:   number;
  barsAgo: number;
}

export function findSwingLow(
  ctx: StrategyContext,
  timeframe: string,
  lookback: number,
): SwingLow | null {
  const candles = ctx.timeframes[timeframe]?.candles ?? [];
  if (candles.length < lookback) return null;
  const slice = candles.slice(-lookback);
  let minLow = Infinity, minIdx = 0;
  slice.forEach((c, i) => { if (c.low < minLow) { minLow = c.low; minIdx = i; } });
  return { price: minLow, barsAgo: lookback - 1 - minIdx };
}

// ─── ABC pattern points ──────────────────────────────────────────────────────
// Identifies the A→B→C swing structure used by the ABC Pullback strategy.
//   B = most recent 3-bar close pivot (local maximum) in the last `lookback` bars.
//       Using the most recent local max (not the absolute maximum) ensures we
//       track the current cycle's peak, not an older historical high.
//   A = lowest LOW in slice[0..bIdx] — the impulse base before B
//   HL = most recent meaningful higher low before B (5-bar pivot, >= aPoint);
//        falls back to aPoint when no pivot qualifies
//   C (pullbackLow) = lowest LOW in bars after B (the pullback trough)

export interface AbcPoints {
  bPoint:      number;  // highest close (B)
  bIdx:        number;  // B index in the lookback slice (0 = oldest)
  barsAgo:     number;  // bars from B to current bar
  aPoint:      number;  // lowest low before B (A) — searched in 60-bar window
  aBarsBefore: number;  // bars from A to B (A absolute index = candles.length - 1 - barsAgo - aBarsBefore)
  hl:          number;  // prior structural higher low; fallback = aPoint
  pullbackLow: number;  // lowest low after B (C)
}

export function computeAbcPoints(
  candles: OhlcvRow[],
  lookback = 20,
): AbcPoints | null {
  if (candles.length < lookback) return null;
  const slice = candles.slice(-lookback);

  // B = most recent 3-bar close pivot (local maximum) in the lookback window.
  // Searching backward from bar -2 (need at least 1 bar after B to confirm the pivot).
  // Using the most recent local max rather than the absolute maximum ensures we
  // capture the current cycle's peak, not an older peak from earlier in the window.
  let bPoint = -Infinity, bIdx = -1;
  for (let i = slice.length - 2; i >= 1; i--) {
    if (slice[i].close > slice[i - 1].close && slice[i].close > slice[i + 1].close) {
      bPoint = slice[i].close;
      bIdx   = i;
      break;
    }
  }
  if (bIdx < 2) return null; // need at least 2 bars before B for impulse
  const barsAgo = lookback - 1 - bIdx;

  // A = lowest low in slice[0..bIdx] — same 20-bar window used to find B.
  let aPoint = Infinity, aBarsBefore = 0;
  for (let i = 0; i <= bIdx; i++) {
    if (slice[i].low < aPoint) {
      aPoint      = slice[i].low;
      aBarsBefore = bIdx - i;   // bars from A to B within the slice
    }
  }

  // HL = most recent 5-bar pivot low before B that is >= aPoint.
  // Same broader window, >= allows HL to equal aPoint when A is the structural HL.
  const hlSearchLen = Math.min(60 + barsAgo, candles.length);
  const hlCandles   = candles.slice(-hlSearchLen);
  const bInHl       = hlCandles.length - 1 - barsAgo;

  let hl: number | null = null;
  for (let i = bInHl - 2; i >= 2; i--) {
    if (
      hlCandles[i].low < hlCandles[i - 1].low &&
      hlCandles[i].low < hlCandles[i - 2].low &&
      hlCandles[i].low < hlCandles[i + 1].low &&
      hlCandles[i].low < hlCandles[i + 2].low &&
      hlCandles[i].low >= aPoint
    ) {
      hl = hlCandles[i].low;
      break;
    }
  }
  if (hl === null) hl = aPoint;

  // C = lowest low after B
  let pullbackLow = slice[bIdx].low;
  for (let i = bIdx + 1; i < slice.length; i++) {
    if (slice[i].low < pullbackLow) pullbackLow = slice[i].low;
  }

  return { bPoint, bIdx, barsAgo, aPoint, aBarsBefore, hl, pullbackLow };
}

// ─── Param-typing helpers ────────────────────────────────────────────────────
// Replace the `params.foo as number` pattern with validated accessors. Each
// helper returns the fallback (when provided) on missing/wrong-type params,
// otherwise throws a descriptive error.

export function paramNum(params: Record<string, unknown>, key: string, fallback?: number): number {
  const v = params[key];
  if (typeof v === 'number') return v;
  if (v == null && fallback !== undefined) return fallback;
  throw new Error(`Param "${key}" must be a number, got ${typeof v}`);
}

export function paramStr(params: Record<string, unknown>, key: string, fallback?: string): string {
  const v = params[key];
  if (typeof v === 'string') return v;
  if (v == null && fallback !== undefined) return fallback;
  throw new Error(`Param "${key}" must be a string, got ${typeof v}`);
}

export function paramArr(params: Record<string, unknown>, key: string, fallback?: number[]): number[] {
  const v = params[key];
  if (Array.isArray(v) && v.every(n => typeof n === 'number')) return v as number[];
  if (v == null && fallback !== undefined) return fallback;
  throw new Error(`Param "${key}" must be a number[], got ${typeof v}`);
}

export function paramBool(params: Record<string, unknown>, key: string, fallback?: boolean): boolean {
  const v = params[key];
  if (typeof v === 'boolean') return v;
  if (v == null && fallback !== undefined) return fallback;
  throw new Error(`Param "${key}" must be a boolean, got ${typeof v}`);
}

export function paramNumOpt(params: Record<string, unknown>, key: string): number | undefined {
  const v = params[key];
  if (typeof v === 'number') return v;
  if (v == null) return undefined;
  throw new Error(`Param "${key}" must be a number, got ${typeof v}`);
}
