import { Router } from 'express';
import {
  SMA, RSI, ATR, MACD, BollingerBands, Stochastic,
} from 'technicalindicators';
import { yf } from '../lib/yf';

export const stockDetailRouter = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

function subDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

function computeTechnicals(candles: { close: number; high: number; low: number; open: number }[]) {
  const closes = candles.map((c) => c.close);
  const highs  = candles.map((c) => c.high);
  const lows   = candles.map((c) => c.low);

  const sma = (period: number) => {
    const res = SMA.calculate({ period, values: closes });
    return last(res) ?? null;
  };

  const rsiArr  = RSI.calculate({ period: 14, values: closes });
  const atrArr  = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
  const macdArr = MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: closes, SimpleMAOscillator: false, SimpleMASignal: false });
  const bbArr   = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
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

// ─── GET /api/stocks/:ticker/summary ─────────────────────────────────────────

stockDetailRouter.get('/:ticker/summary', async (req, res) => {
  const { ticker } = req.params;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [quote, summary, history] = await Promise.allSettled([
      (yf.quote as any)(ticker),
      (yf.quoteSummary as any)(ticker, {
        modules: ['summaryDetail', 'defaultKeyStatistics', 'calendarEvents', 'financialData'],
      }, { validateResult: false }),
      (yf.historical as any)(ticker, { period1: subDate(300), interval: '1d' }),
    ]);

    const q  = quote.status  === 'fulfilled' ? quote.value  as any : {};
    const s  = summary.status === 'fulfilled' ? summary.value as any : {};
    const h  = history.status === 'fulfilled' ? (history.value as any[]) : [];

    const sd  = s.summaryDetail         ?? {};
    const ks  = s.defaultKeyStatistics  ?? {};
    const ce  = s.calendarEvents        ?? {};
    const fd  = s.financialData         ?? {};

    const candles = h.filter((c: any) => c.close != null);
    const technicals = candles.length >= 14 ? computeTechnicals(candles) : null;

    const earningsDate = ce.earnings?.earningsDate?.[0] ?? null;

    res.json({
      symbol:      q.symbol        ?? ticker,
      shortName:   q.shortName     ?? q.longName ?? null,
      quoteType:   q.quoteType     ?? null,
      exchange:    q.fullExchangeName ?? q.exchange ?? null,
      price:       q.regularMarketPrice        ?? null,
      change:      q.regularMarketChange       ?? null,
      changePct:   q.regularMarketChangePercent ?? null,
      high:        q.regularMarketDayHigh      ?? null,
      low:         q.regularMarketDayLow       ?? null,
      volume:      q.regularMarketVolume       ?? null,
      marketCap:   q.marketCap                 ?? null,
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
      // key statistics
      trailingPE:  ks.trailingPE  ?? null,
      trailingEps: ks.trailingEps ?? null,
      // calendar
      earningsDate: earningsDate,
      // financial data
      targetMeanPrice:  fd.targetMeanPrice  ?? null,
      revenuePerShare:  fd.revenuePerShare  ?? null,
      grossProfits:     fd.grossProfits     ?? null,
      profitMargins:    fd.profitMargins    ?? null,
      operatingMargins: fd.operatingMargins ?? null,
      returnOnEquity:   fd.returnOnEquity   ?? null,
      returnOnAssets:   fd.returnOnAssets   ?? null,
      // technicals
      technicals,
    });
  } catch (err) {
    console.error('[stockDetail] summary error', err);
    res.status(502).json({ error: 'failed to fetch summary' });
  }
});

// ─── GET /api/stocks/:ticker/history ─────────────────────────────────────────

const PERIOD_CONFIG: Record<string, { interval: string; days: number }> = {
  '1d': { interval: '5m',  days: 1   },
  '5d': { interval: '60m', days: 5   },
  '1m': { interval: '1d',  days: 30  },
  '3m': { interval: '1d',  days: 90  },
  '1y': { interval: '1d',  days: 365 },
};

stockDetailRouter.get('/:ticker/history', async (req, res) => {
  const { ticker } = req.params;
  const period = String(req.query.period ?? '1y');
  const cfg = PERIOD_CONFIG[period] ?? PERIOD_CONFIG['1y'];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (yf.historical as any)(ticker, {
      period1: subDate(cfg.days),
      interval: cfg.interval,
    }) as any[];

    const candles = data
      .filter((c: any) => c.open != null && c.close != null)
      .map((c: any) => ({
        time: formatDate(new Date(c.date)),
        open: c.open,
        high: c.high,
        low:  c.low,
        close: c.close,
        volume: c.volume ?? 0,
      }));

    res.json(candles);
  } catch (err) {
    console.error('[stockDetail] history error', err);
    res.status(502).json({ error: 'failed to fetch history' });
  }
});

// ─── GET /api/stocks/:ticker/news ─────────────────────────────────────────────

stockDetailRouter.get('/:ticker/news', async (req, res) => {
  const { ticker } = req.params;
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    res.json([]);
    return;
  }

  const to   = formatDate(new Date());
  const from = formatDate(subDate(7));
  const url  = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${apiKey}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) { res.json([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const articles = (await resp.json() as any[]).slice(0, 10).map((a) => ({
      headline: a.headline,
      source:   a.source,
      url:      a.url,
      datetime: a.datetime,
      summary:  a.summary,
      image:    a.image || null,
    }));
    res.json(articles);
  } catch (err) {
    console.error('[stockDetail] news error', err);
    res.json([]);
  }
});
