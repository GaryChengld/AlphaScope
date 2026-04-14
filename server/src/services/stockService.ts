import { SMA, RSI, ATR, MACD, BollingerBands, Stochastic } from 'technicalindicators';
import { yf } from '../lib/yf';
import { subDate, today, tomorrow } from '../lib/dateUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OhlcvRow {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PeriodCfg {
  interval: string;
  days: number;
  aggregate?: number;
}

export const PERIOD_CONFIG: Record<string, PeriodCfg> = {
  '1H':  { interval: '60m', days: 30,   aggregate: 1 },
  '2H':  { interval: '60m', days: 60,   aggregate: 2 },
  '4H':  { interval: '60m', days: 120,  aggregate: 4 },
  '1D':  { interval: '1d',  days: 365               },
  '1W':  { interval: '1wk', days: 1825              },
  '1M':  { interval: '1mo', days: 3650              },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

function aggregateCandles(candles: OhlcvRow[], n: number): OhlcvRow[] {
  if (n <= 1) return candles;
  const out: OhlcvRow[] = [];
  for (let i = 0; i < candles.length; i += n) {
    const chunk = candles.slice(i, i + n);
    out.push({
      time:   chunk[0].time,
      open:   chunk[0].open,
      high:   Math.max(...chunk.map((c) => c.high)),
      low:    Math.min(...chunk.map((c) => c.low)),
      close:  chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

// ─── Technicals ───────────────────────────────────────────────────────────────

export function computeTechnicals(candles: { close: number; high: number; low: number; open: number }[]) {
  const closes = candles.map((c) => c.close);
  const highs  = candles.map((c) => c.high);
  const lows   = candles.map((c) => c.low);

  const sma = (period: number) => last(SMA.calculate({ period, values: closes })) ?? null;

  const rsiArr   = RSI.calculate({ period: 14, values: closes });
  const atrArr   = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
  const macdArr  = MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: closes, SimpleMAOscillator: false, SimpleMASignal: false });
  const bbArr    = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const stochArr = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });

  const macdLast  = last(macdArr);
  const bbLast    = last(bbArr);
  const stochLast = last(stochArr);

  return {
    ma5:   sma(5),
    ma10:  sma(10),
    ma20:  sma(20),
    ma50:  sma(50),
    ma100: sma(100),
    ma200: sma(200),
    rsi14: last(rsiArr) ?? null,
    atr14: last(atrArr) ?? null,
    macd: macdLast
      ? { macd: macdLast.MACD ?? null, signal: macdLast.signal ?? null, histogram: macdLast.histogram ?? null }
      : null,
    bollingerBands: bbLast
      ? { upper: bbLast.upper, middle: bbLast.middle, lower: bbLast.lower }
      : null,
    stochastic: stochLast
      ? { k: stochLast.k, d: stochLast.d }
      : null,
  };
}

// ─── Summary ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getStockSummary(ticker: string): Promise<Record<string, any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [quoteResult, summaryResult, historyResult] = await Promise.allSettled([
    (yf.quote as any)(ticker),
    (yf.quoteSummary as any)(ticker, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'calendarEvents', 'financialData'],
    }, { validateResult: false }),
    (yf.historical as any)(ticker, { period1: subDate(300), period2: today(), interval: '1d' }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q  = quoteResult.status   === 'fulfilled' ? quoteResult.value   as any : {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s  = summaryResult.status === 'fulfilled' ? summaryResult.value as any : {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h  = historyResult.status === 'fulfilled' ? historyResult.value as any[] : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = s.summaryDetail        ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ks = s.defaultKeyStatistics ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ce = s.calendarEvents       ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fd = s.financialData        ?? {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candles = (h as any[]).filter((c) => c.close != null);
  const technicals = candles.length >= 14 ? computeTechnicals(candles) : null;

  const earningsDate = ce.earnings?.earningsDate?.[0] ?? null;

  const trailingPE = sd.trailingPE ?? ks.trailingPE ?? q.trailingPE ?? null;

  return {
    symbol:    q.symbol    ?? ticker,
    shortName: q.shortName ?? q.longName ?? null,
    quoteType: q.quoteType ?? null,
    exchange:  q.fullExchangeName ?? q.exchange ?? null,
    price:     q.regularMarketPrice         ?? null,
    change:    q.regularMarketChange        ?? null,
    changePct: q.regularMarketChangePercent ?? null,
    high:      q.regularMarketDayHigh       ?? null,
    low:       q.regularMarketDayLow        ?? null,
    volume:    q.regularMarketVolume        ?? null,
    marketCap: q.marketCap                  ?? null,
    // summaryDetail
    previousClose:    sd.previousClose    ?? null,
    open:             sd.open             ?? null,
    dayRangeLow:      sd.dayLow           ?? null,
    dayRangeHigh:     sd.dayHigh          ?? null,
    fiftyTwoWeekLow:  sd.fiftyTwoWeekLow  ?? null,
    fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh ?? null,
    averageVolume:    sd.averageVolume     ?? null,
    beta:             sd.beta             ?? null,
    dividendRate:     sd.dividendRate     ?? null,
    dividendYield:    sd.dividendYield    ?? null,
    exDividendDate:   sd.exDividendDate   ?? null,
    // valuation
    trailingPE,
    forwardPE:           sd.forwardPE  ?? ks.forwardPE  ?? null,
    trailingEps:         ks.trailingEps ?? q.epsTrailingTwelveMonths ?? null,
    pegRatio: (() => {
      const g = fd.earningsGrowth ?? null;
      if (trailingPE != null && g != null && g > 0) return +(trailingPE / (g * 100)).toFixed(2);
      return null;
    })(),
    priceToBook:         ks.priceToBook         ?? null,
    priceToSales:        sd.priceToSalesTrailing12Months ?? null,
    enterpriseValue:     ks.enterpriseValue     ?? null,
    enterpriseToEbitda:  ks.enterpriseToEbitda  ?? null,
    enterpriseToRevenue: ks.enterpriseToRevenue ?? null,
    bookValue:           ks.bookValue           ?? null,
    sharesOutstanding:   ks.sharesOutstanding   ?? null,
    floatShares:         ks.floatShares         ?? null,
    heldByInsiders:      ks.heldPercentInsiders   ?? null,
    heldByInstitutions:  ks.heldPercentInstitutions ?? null,
    shortRatio:          ks.shortRatio          ?? null,
    // calendar
    earningsDate,
    // financial data
    targetMeanPrice:   fd.targetMeanPrice   ?? null,
    totalRevenue:      fd.totalRevenue      ?? null,
    revenuePerShare:   fd.revenuePerShare   ?? null,
    revenueGrowth:     fd.revenueGrowth     ?? null,
    grossProfits:      fd.grossProfits      ?? null,
    grossMargins:      fd.grossMargins      ?? null,
    ebitda:            fd.ebitda            ?? null,
    ebitdaMargins:     fd.ebitdaMargins     ?? null,
    netIncomeToCommon: ks.netIncomeToCommon ?? null,
    earningsGrowth:    fd.earningsGrowth    ?? null,
    profitMargins:     fd.profitMargins     ?? null,
    operatingMargins:  fd.operatingMargins  ?? null,
    returnOnEquity:    fd.returnOnEquity    ?? null,
    returnOnAssets:    fd.returnOnAssets    ?? null,
    totalCash:         fd.totalCash         ?? null,
    totalDebt:         fd.totalDebt         ?? null,
    debtToEquity:      fd.debtToEquity      ?? null,
    currentRatio:      fd.currentRatio      ?? null,
    quickRatio:        fd.quickRatio        ?? null,
    operatingCashflow: fd.operatingCashflow ?? null,
    freeCashflow:      fd.freeCashflow      ?? null,
    // technicals
    technicals,
  };
}

// ─── Candles ──────────────────────────────────────────────────────────────────

export async function getStockCandles(ticker: string, period: string): Promise<OhlcvRow[]> {
  const cfg = PERIOD_CONFIG[period] ?? PERIOD_CONFIG['1D'];
  const isIntraday = cfg.interval === '60m';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[];

  if (isIntraday) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (yf.chart as any)(ticker, {
      period1: subDate(cfg.days),
      period2: tomorrow(),
      interval: cfg.interval,
    });
    rows = result?.quotes ?? [];
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows = await (yf.historical as any)(ticker, {
      period1: subDate(cfg.days),
      period2: tomorrow(),
      interval: cfg.interval,
    });
  }

  const candles: OhlcvRow[] = rows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((c: any) => c.open != null && c.close != null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => ({
      time: isIntraday
        ? Math.floor(new Date(c.date).getTime() / 1000)
        : new Date(c.date).toISOString().slice(0, 10),
      open:   c.open,
      high:   c.high,
      low:    c.low,
      close:  c.close,
      volume: c.volume ?? 0,
    }));

  return aggregateCandles(candles, cfg.aggregate ?? 1);
}

// ─── Live prices ──────────────────────────────────────────────────────────────

export async function getLivePrices(
  tickers: string[],
): Promise<Record<string, { price: number | null; change: number | null; changePct: number | null }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await (yf.quote as any)(tickers) as any[];
  const arr = Array.isArray(results) ? results : [results];
  const map: Record<string, { price: number | null; change: number | null; changePct: number | null }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const q of arr as any[]) {
    map[q.symbol] = {
      price:     q.regularMarketPrice         ?? null,
      change:    q.regularMarketChange        ?? null,
      changePct: q.regularMarketChangePercent ?? null,
    };
  }
  return map;
}
