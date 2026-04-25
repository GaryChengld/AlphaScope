import { EMA, ATR, RSI } from 'technicalindicators';
import { getStockCandles, getLivePrices, OhlcvRow } from '../stockService';
import { yf } from '../../lib/yf';

export interface TimeframeData {
  candles: OhlcvRow[];
  ema: Record<number, number[]>;
  atr: Record<number, number[]>;
  rsi: Record<number, number[]>;
}

export interface IndicatorRequirements {
  timeframes: Record<string, {
    ema?: number[];
    atr?: number[];
    rsi?: number[];
  }>;
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

function buildTimeframeData(
  candles: OhlcvRow[],
  reqs: { ema?: number[]; atr?: number[]; rsi?: number[] },
): TimeframeData {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

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

  return { candles, ema, atr, rsi };
}

export async function buildStrategyContext(
  ticker: string,
  requires: IndicatorRequirements,
): Promise<StrategyContext> {
  const tfKeys = Object.keys(requires.timeframes);

  const [candleResults, spyCandles, vixPrices, summary, sectorResults] = await Promise.all([
    Promise.allSettled(tfKeys.map(tf => getStockCandles(ticker, tf))),
    getStockCandles('SPY', '1D').catch(() => [] as OhlcvRow[]),
    getLivePrices(['^VIX']).catch(() => ({} as Record<string, { price: number | null }>)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (yf.quoteSummary as any)(ticker, { modules: ['assetProfile', 'calendarEvents'] }, { validateResult: false }).catch(() => null),
    Promise.allSettled(SECTOR_TICKERS.map(t => getStockCandles(t, '1D'))),
  ]);

  const timeframes: Record<string, TimeframeData> = {};
  tfKeys.forEach((tf, i) => {
    const r = candleResults[i];
    timeframes[tf] = buildTimeframeData(
      r.status === 'fulfilled' ? r.value : [],
      requires.timeframes[tf],
    );
  });

  const spy = buildTimeframeData(spyCandles, { ema: [200] });

  const vix = vixPrices['^VIX']?.price ?? null;

  const earningsDate: string | null = (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (summary as any)?.calendarEvents?.earnings?.earningsDate?.[0];
    if (!raw) return null;
    return raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
  })();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sectorName: string | null = (summary as any)?.assetProfile?.sector ?? null;
  const sectorEtf: string | null  = sectorName ? (SECTOR_TO_ETF[sectorName] ?? null) : null;

  const sectorReturns: Record<string, number> = {};
  SECTOR_TICKERS.forEach((etf, i) => {
    const r = sectorResults[i];
    if (r.status === 'fulfilled' && r.value.length >= 22) {
      const c = r.value;
      sectorReturns[etf] = (c[c.length - 1].close - c[c.length - 22].close) / c[c.length - 22].close;
    }
  });

  return { ticker, timeframes, spy, vix, earningsDate, sectorEtf, sectorReturns };
}
