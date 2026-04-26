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

// Price-scaled "round number" — for a $30 stock, $5 increments are psychologically
// significant; for a $300 stock, $25 increments are. Returns the nearest round
// price using the appropriate grid for the price band.
export function nearestRoundNumber(close: number): { value: number; distance: number } {
  const grid = close < 50 ? 5 : close <= 200 ? 10 : 25;
  const value = Math.round(close / grid) * grid;
  return { value, distance: Math.abs(close - value) };
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
