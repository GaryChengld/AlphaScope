import { EMA, ATR, RSI } from 'technicalindicators';
import { getStockCandles, getLivePrices, OhlcvRow } from '../stockService';
import { yf } from '../../lib/yf';

export interface TimeframeData {
  candles: OhlcvRow[];
  ema: Record<number, number[]>;
  atr: Record<number, number[]>;
  rsi: Record<number, number[]>;
}

export interface IndicatorSpec {
  ema?: number[];
  atr?: number[];
  rsi?: number[];
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

// Minimal local typing for the slice of yahoo-finance2 quoteSummary we use,
// so we don't have to sprinkle `any` casts at every access site.
interface QuoteSummary {
  assetProfile?:    { sector?: string };
  calendarEvents?:  { earnings?: { earningsDate?: unknown[] } };
}
type QuoteSummaryFn = (
  ticker: string,
  opts: { modules: string[] },
  reqOpts: { validateResult: boolean },
) => Promise<QuoteSummary>;

// ─── Caches ───────────────────────────────────────────────────────────────────
// SPY candles and sector ETF 30-day returns change at most once per market day,
// but every strategy evaluation needs them. Cache at the promise level so
// concurrent first-fetches dedupe to a single network call.

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let spyCandlesPromise: Promise<OhlcvRow[]> | null = null;
let spyCandlesTimestamp = 0;

function getCachedSpyCandles(): Promise<OhlcvRow[]> {
  if (!spyCandlesPromise || Date.now() - spyCandlesTimestamp > CACHE_TTL_MS) {
    spyCandlesPromise = getStockCandles('SPY', '1D').catch(() => [] as OhlcvRow[]);
    spyCandlesTimestamp = Date.now();
  }
  return spyCandlesPromise;
}

let sectorReturnsPromise: Promise<Record<string, number>> | null = null;
let sectorReturnsTimestamp = 0;

function getCachedSectorReturns(): Promise<Record<string, number>> {
  if (!sectorReturnsPromise || Date.now() - sectorReturnsTimestamp > CACHE_TTL_MS) {
    sectorReturnsPromise = (async () => {
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
    })();
    sectorReturnsTimestamp = Date.now();
  }
  return sectorReturnsPromise;
}

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

  return { candles: cleanCandles, ema, atr, rsi };
}

export async function buildStrategyContext(
  ticker: string,
  requires: IndicatorRequirements,
): Promise<StrategyContext> {
  const tfKeys = Object.keys(requires.timeframes);

  const quoteSummary = (yf.quoteSummary as unknown as QuoteSummaryFn).bind(yf);

  // Uniform allSettled — every fetch can fail independently and we degrade
  // gracefully rather than blowing up the whole evaluation.
  const [
    candleResults,
    spyResult,
    vixResult,
    summaryResult,
    sectorResult,
  ] = await Promise.all([
    Promise.allSettled(tfKeys.map(tf => getStockCandles(ticker, tf))),
    Promise.allSettled([getCachedSpyCandles()]),
    Promise.allSettled([getLivePrices(['^VIX'])]),
    Promise.allSettled([
      quoteSummary(ticker, { modules: ['assetProfile', 'calendarEvents'] }, { validateResult: false }),
    ]),
    Promise.allSettled([getCachedSectorReturns()]),
  ]);

  const timeframes: Record<string, TimeframeData> = {};
  tfKeys.forEach((tf, i) => {
    const r = candleResults[i];
    timeframes[tf] = buildTimeframeData(
      r.status === 'fulfilled' ? r.value : [],
      requires.timeframes[tf],
    );
  });

  const spyCandles: OhlcvRow[] = spyResult[0].status === 'fulfilled' ? spyResult[0].value : [];
  const spy = buildTimeframeData(spyCandles, requires.spy ?? { ema: [200] });

  const vixPrices: Record<string, { price: number | null }> =
    vixResult[0].status === 'fulfilled' ? vixResult[0].value : {};
  const vix = vixPrices['^VIX']?.price ?? null;

  const summary: QuoteSummary | null =
    summaryResult[0].status === 'fulfilled' ? summaryResult[0].value : null;

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
