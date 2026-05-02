import { EMA, ATR, RSI, ADX, BollingerBands, MACD } from 'technicalindicators';
import { getStockCandles, getLivePrices, OhlcvRow } from '../stockService';
import { yf } from '../../lib/yf';

export interface BollingerBandsSeries {
  period: number;
  stdDev: number;
  upper:  number[];
  middle: number[];
  lower:  number[];
}

export interface MacdSeries {
  fast:       number;
  slow:       number;
  signal:     number;
  macd:       number[];
  signalLine: number[];
  histogram:  number[];
}

export interface TimeframeData {
  candles: OhlcvRow[];
  ema:  Record<number, number[]>;
  atr:  Record<number, number[]>;
  rsi:  Record<number, number[]>;
  adx:  Record<number, number[]>;
  bb:   BollingerBandsSeries[];
  macd: MacdSeries[];
}

export interface IndicatorSpec {
  ema?:  number[];
  atr?:  number[];
  rsi?:  number[];
  adx?:  number[];
  bb?:   { period: number; stdDev: number }[];
  macd?: { fast: number; slow: number; signal: number }[];
}

export interface IndicatorRequirements {
  timeframes: Record<string, IndicatorSpec>;
  spy?: IndicatorSpec;
}

export interface StrategyContext {
  ticker: string;
  timeframes: Record<string, TimeframeData>;
  spy: TimeframeData;
  vix: number | null;
  earningsDate: string | null;
  sectorEtf: string | null;
  sectorReturns: Record<string, number>;
}

export interface QuoteSummary {
  assetProfile?:    { sector?: string };
  calendarEvents?:  { earnings?: { earningsDate?: unknown[] } };
}

type ScanCacheValue = OhlcvRow[] | QuoteSummary | null | number | Record<string, number>;
export type ScanCache = Map<string, ScanCacheValue>;

const SECTOR_TO_ETF: Record<string, string> = {
  'Technology':             'XLK',
  'Financial Services':     'XLF',
  'Energy':                 'XLE',
  'Healthcare':             'XLV',
  'Industrials':            'XLI',
  'Communication Services': 'XLC',
  'Consumer Cyclical':      'XLY',
  'Consumer Defensive':     'XLP',
  'Real Estate':            'XLRE',
  'Basic Materials':        'XLB',
  'Utilities':              'XLU',
};

const SECTOR_TICKERS = Object.values(SECTOR_TO_ETF);

type QuoteSummaryFn = (
  ticker: string,
  opts: { modules: string[] },
  reqOpts: { validateResult: boolean },
) => Promise<QuoteSummary>;

function buildTimeframeData(
  candles: OhlcvRow[],
  reqs: IndicatorSpec,
): TimeframeData {
  // Drop bars with non-finite OHLC — indicators silently produce NaN otherwise.
  const cleanCandles = candles.filter(
    c => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low),
  );
  const closes = cleanCandles.map(c => c.close);
  const highs  = cleanCandles.map(c => c.high);
  const lows   = cleanCandles.map(c => c.low);

  const ema: Record<number, number[]> = {};
  const atr: Record<number, number[]> = {};
  const rsi: Record<number, number[]> = {};
  const adx: Record<number, number[]> = {};
  const bb:   BollingerBandsSeries[] = [];
  const macd: MacdSeries[] = [];

  for (const p of reqs.ema ?? []) {
    if (closes.length > p)
      ema[p] = EMA.calculate({ period: p, values: closes });
  }
  for (const p of reqs.atr ?? []) {
    if (closes.length > p)
      atr[p] = ATR.calculate({ period: p, high: highs, low: lows, close: closes });
  }
  for (const p of reqs.rsi ?? []) {
    if (closes.length > p)
      rsi[p] = RSI.calculate({ period: p, values: closes });
  }
  for (const p of reqs.adx ?? []) {
    if (closes.length > p * 2) {
      const out = ADX.calculate({ period: p, high: highs, low: lows, close: closes });
      adx[p] = out.map((a: { adx: number }) => a.adx ?? NaN);
    }
  }
  for (const spec of reqs.bb ?? []) {
    if (closes.length > spec.period) {
      const out = BollingerBands.calculate({ period: spec.period, stdDev: spec.stdDev, values: closes });
      bb.push({
        period: spec.period,
        stdDev: spec.stdDev,
        upper:  out.map(b => b.upper),
        middle: out.map(b => b.middle),
        lower:  out.map(b => b.lower),
      });
    }
  }
  for (const spec of reqs.macd ?? []) {
    if (closes.length > spec.slow + spec.signal) {
      const out = MACD.calculate({
        fastPeriod:        spec.fast,
        slowPeriod:        spec.slow,
        signalPeriod:      spec.signal,
        values:            closes,
        SimpleMAOscillator: false,
        SimpleMASignal:     false,
      });
      macd.push({
        fast:       spec.fast,
        slow:       spec.slow,
        signal:     spec.signal,
        macd:       out.map(m => m.MACD       ?? NaN),
        signalLine: out.map(m => m.signal     ?? NaN),
        histogram:  out.map(m => m.histogram  ?? NaN),
      });
    }
  }

  return { candles: cleanCandles, ema, atr, rsi, adx, bb, macd };
}

async function fetchSectorReturns(): Promise<Record<string, number>> {
  const results = await Promise.allSettled(
    SECTOR_TICKERS.map(t => getStockCandles(t, '1D')),
  );
  const out: Record<string, number> = {};
  SECTOR_TICKERS.forEach((etf, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.length >= 22) {
      const c = r.value;
      out[etf] = (c[c.length - 1].close - c[c.length - 22].close) / c[c.length - 22].close;
    }
  });
  return out;
}

export async function buildStrategyContext(
  ticker: string,
  requires: IndicatorRequirements,
  scanCache?: ScanCache,
): Promise<StrategyContext> {
  const tfKeys = Object.keys(requires.timeframes);

  const quoteSummary = (yf.quoteSummary as unknown as QuoteSummaryFn).bind(yf);

  // ── Ticker candles ──────────────────────────────────────────────────────────
  const candlePromises = tfKeys.map(tf => {
    const key = `candles:${ticker}:${tf}`;
    if (scanCache?.has(key)) return Promise.resolve(scanCache.get(key) as OhlcvRow[]);
    return getStockCandles(ticker, tf).then(rows => { scanCache?.set(key, rows); return rows; });
  });

  // ── SPY candles ─────────────────────────────────────────────────────────────
  const spyKey = 'candles:SPY:1D';
  const spyPromise: Promise<OhlcvRow[]> = scanCache?.has(spyKey)
    ? Promise.resolve(scanCache.get(spyKey) as OhlcvRow[])
    : getStockCandles('SPY', '1D').then(rows => { scanCache?.set(spyKey, rows); return rows; });

  // ── VIX ─────────────────────────────────────────────────────────────────────
  const vixPromise = scanCache?.has('vix')
    ? Promise.resolve({ '^VIX': { price: scanCache.get('vix') as number | null } })
    : getLivePrices(['^VIX']).then(prices => {
        scanCache?.set('vix', prices['^VIX']?.price ?? null);
        return prices;
      });

  // ── quoteSummary (sector + earnings) ────────────────────────────────────────
  const summaryKey = `summary:${ticker}`;
  const summaryPromise: Promise<QuoteSummary> = scanCache?.has(summaryKey)
    ? Promise.resolve(scanCache.get(summaryKey) as QuoteSummary)
    : quoteSummary(ticker, { modules: ['assetProfile', 'calendarEvents'] }, { validateResult: false })
        .then(r => { scanCache?.set(summaryKey, r); return r; });

  // ── Sector ETF returns ──────────────────────────────────────────────────────
  const sectorPromise: Promise<Record<string, number>> = scanCache?.has('sectorReturns')
    ? Promise.resolve(scanCache.get('sectorReturns') as Record<string, number>)
    : fetchSectorReturns().then(out => { scanCache?.set('sectorReturns', out); return out; });

  const [
    candleResults,
    spyResult,
    vixResult,
    summaryResult,
    sectorResult,
  ] = await Promise.all([
    Promise.allSettled(candlePromises),
    Promise.allSettled([spyPromise]),
    Promise.allSettled([vixPromise]),
    Promise.allSettled([summaryPromise]),
    Promise.allSettled([sectorPromise]),
  ]);

  const timeframes: Record<string, TimeframeData> = {};
  tfKeys.forEach((tf, i) => {
    const r = candleResults[i];
    if (r.status === 'rejected')
      console.warn(`[ctx] ${ticker} ${tf} candles failed:`, (r.reason as Error)?.message ?? r.reason);
    timeframes[tf] = buildTimeframeData(
      r.status === 'fulfilled' ? r.value : [],
      requires.timeframes[tf],
    );
  });

  const spyCandles: OhlcvRow[] = spyResult[0].status === 'fulfilled' ? spyResult[0].value : [];
  if (spyResult[0].status === 'rejected')
    console.warn('[ctx] SPY candles failed:', (spyResult[0].reason as Error)?.message ?? spyResult[0].reason);
  const spy = buildTimeframeData(spyCandles, requires.spy ?? { ema: [200] });

  const vixPrices: Record<string, { price: number | null }> =
    vixResult[0].status === 'fulfilled' ? vixResult[0].value : {};
  if (vixResult[0].status === 'rejected')
    console.warn('[ctx] VIX fetch failed:', (vixResult[0].reason as Error)?.message ?? vixResult[0].reason);
  const vix = vixPrices['^VIX']?.price ?? null;

  const summary: QuoteSummary | null =
    summaryResult[0].status === 'fulfilled' ? summaryResult[0].value : null;
  if (summaryResult[0].status === 'rejected')
    console.warn(`[ctx] ${ticker} quoteSummary failed:`, (summaryResult[0].reason as Error)?.message ?? summaryResult[0].reason);

  const sectorReturns: Record<string, number> =
    sectorResult[0].status === 'fulfilled' ? sectorResult[0].value : {};

  const earningsDate: string | null = (() => {
    const raw = summary?.calendarEvents?.earnings?.earningsDate?.[0];
    if (!raw) return null;
    return raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
  })();

  const sectorName: string | null = summary?.assetProfile?.sector ?? null;
  const sectorEtf: string | null  = sectorName ? (SECTOR_TO_ETF[sectorName] ?? null) : null;

  return { ticker, timeframes, spy, vix, earningsDate, sectorEtf, sectorReturns };
}
