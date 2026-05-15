import { SMA, RSI, ATR, MACD, BollingerBands, Stochastic, ADX } from 'technicalindicators';
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
  '15m': { interval: '15m', days: 7                 },
  '30m': { interval: '30m', days: 30                },
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
  const adxArr   = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });

  const macdLast  = last(macdArr);
  const bbLast    = last(bbArr);
  const stochLast = last(stochArr);
  const adxLast   = last(adxArr);

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
    adx: adxLast
      ? { adx: adxLast.adx, pdi: adxLast.pdi, mdi: adxLast.mdi }
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
      modules: ['summaryDetail', 'defaultKeyStatistics', 'calendarEvents', 'financialData', 'assetProfile'],
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
  const ap = s.assetProfile         ?? {};

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
    sector:              ap.sector              ?? null,
    industry:            ap.industry            ?? null,
    longBusinessSummary: ap.longBusinessSummary ?? null,
    marketState: q.marketState ?? null,
    price:     q.regularMarketPrice         ?? null,
    change:    q.regularMarketChange        ?? null,
    changePct: q.regularMarketChangePercent ?? null,
    high:      q.regularMarketDayHigh       ?? null,
    low:       q.regularMarketDayLow        ?? null,
    // extended hours
    preMarketPrice:         q.preMarketPrice         ?? null,
    preMarketChange:        q.preMarketChange        ?? null,
    preMarketChangePct:     q.preMarketChangePercent ?? null,
    postMarketPrice:        q.postMarketPrice        ?? null,
    postMarketChange:       q.postMarketChange       ?? null,
    postMarketChangePct:    q.postMarketChangePercent ?? null,
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

// ─── Analysis ────────────────────────────────────────────────────────────────

export interface StockAnalysis {
  targetMeanPrice: number | null;
  targetMedianPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  numberOfAnalystOpinions: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  recommendationBreakdown: {
    strongBuy: number; buy: number; hold: number; sell: number; strongSell: number;
  } | null;
  valuation: { description: string; discount: string; relativeValue: string; provider: string } | null;
  keyTechnicals: { support: number; resistance: number; stopLoss: number; provider: string } | null;
  technicalOutlook: {
    shortTerm:    { direction: string; score: number; description: string };
    intermediate: { direction: string; score: number; description: string };
    longTerm:     { direction: string; score: number; description: string };
    provider: string;
  } | null;
  analystActions: Array<{
    date: string;
    firm: string;
    fromGrade: string | null;
    toGrade: string;
    action: string;
    currentPriceTarget: number | null;
  }>;
}

export async function getStockAnalysis(ticker: string): Promise<StockAnalysis> {
  const [summaryResult, insightsResult] = await Promise.allSettled([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (yf.quoteSummary as any)(ticker, {
      modules: ['financialData', 'recommendationTrend', 'upgradeDowngradeHistory'],
    }, { validateResult: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (yf.insights as any)(ticker, {}, { validateResult: false }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qs = summaryResult.status === 'fulfilled' ? summaryResult.value as any : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ins = insightsResult.status === 'fulfilled' ? insightsResult.value as any : null;

  const fd  = qs?.financialData ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trend: any = qs?.recommendationTrend?.trend?.[0] ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history: any[] = qs?.upgradeDowngradeHistory?.history ?? [];
  const instrInfo = ins?.instrumentInfo ?? null;
  const valuation = instrInfo?.valuation ?? null;
  const keyTech   = instrInfo?.keyTechnicals ?? null;
  const techEv    = instrInfo?.technicalEvents ?? null;

  return {
    targetMeanPrice:          fd.targetMeanPrice          ?? null,
    targetMedianPrice:        fd.targetMedianPrice        ?? null,
    targetHighPrice:          fd.targetHighPrice          ?? null,
    targetLowPrice:           fd.targetLowPrice           ?? null,
    numberOfAnalystOpinions:  fd.numberOfAnalystOpinions  ?? null,
    recommendationKey:        fd.recommendationKey        ?? null,
    recommendationMean:       fd.recommendationMean       ?? null,
    recommendationBreakdown: trend ? {
      strongBuy:  trend.strongBuy  ?? 0,
      buy:        trend.buy        ?? 0,
      hold:       trend.hold       ?? 0,
      sell:       trend.sell       ?? 0,
      strongSell: trend.strongSell ?? 0,
    } : null,
    valuation: valuation ? {
      description:   valuation.description   ?? '',
      discount:      valuation.discount      ?? '',
      relativeValue: valuation.relativeValue ?? '',
      provider:      valuation.provider      ?? 'Trading Central',
    } : null,
    keyTechnicals: keyTech ? {
      support:    keyTech.support    ?? 0,
      resistance: keyTech.resistance ?? 0,
      stopLoss:   keyTech.stopLoss   ?? 0,
      provider:   keyTech.provider   ?? 'Trading Central',
    } : null,
    technicalOutlook: techEv ? {
      shortTerm: {
        direction:   techEv.shortTermOutlook?.direction        ?? '',
        score:       techEv.shortTermOutlook?.score            ?? 0,
        description: techEv.shortTermOutlook?.stateDescription ?? '',
      },
      intermediate: {
        direction:   techEv.intermediateTermOutlook?.direction        ?? '',
        score:       techEv.intermediateTermOutlook?.score            ?? 0,
        description: techEv.intermediateTermOutlook?.stateDescription ?? '',
      },
      longTerm: {
        direction:   techEv.longTermOutlook?.direction        ?? '',
        score:       techEv.longTermOutlook?.score            ?? 0,
        description: techEv.longTermOutlook?.stateDescription ?? '',
      },
      provider: techEv.provider ?? 'Trading Central',
    } : null,
    analystActions: history.slice(0, 10).map((h) => ({
      date:               h.epochGradeDate instanceof Date
                            ? h.epochGradeDate.toISOString().slice(0, 10)
                            : String(h.epochGradeDate ?? '').slice(0, 10),
      firm:               h.firm        ?? '',
      fromGrade:          h.fromGrade   ?? null,
      toGrade:            h.toGrade     ?? '',
      action:             h.action      ?? '',
      currentPriceTarget: h.currentPriceTarget ?? null,
    })),
  };
}

// ─── Candles ──────────────────────────────────────────────────────────────────

export async function getStockCandles(ticker: string, period: string): Promise<OhlcvRow[]> {
  const cfg = PERIOD_CONFIG[period] ?? PERIOD_CONFIG['1D'];
  const isIntraday = cfg.interval.endsWith('m');

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
