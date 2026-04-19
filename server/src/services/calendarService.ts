import { yf } from '../lib/yf';
import { prisma } from '../lib/prisma';

// ─── Economic Events ──────────────────────────────────────────────────────────

export interface EconomicEvent {
  time: string;        // raw from Finnhub e.g. "2026-04-17 08:30:00"
  event: string;
  actual: number | null;
  estimate: number | null;
  prev: number | null;
  unit: string;
}

export async function getEconomicEvents(from: string, to: string): Promise<EconomicEvent[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('[calendarService] FINNHUB_API_KEY not set');
    return [];
  }

  try {
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await resp.json() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: any[] = Array.isArray(data) ? data : (data.economicCalendar ?? []);

    return events
      .filter((e) => e.country === 'US' && e.impact === 'high')
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
      .map((e) => ({
        time:     e.time     ?? '',
        event:    e.event    ?? '',
        actual:   e.actual   ?? null,
        estimate: e.estimate ?? null,
        prev:     e.prev     ?? null,
        unit:     e.unit     ?? '',
      }));
  } catch {
    return [];
  }
}

// ─── Earnings Events ──────────────────────────────────────────────────────────

export interface EarningsEvent {
  date: string;
  ticker: string;
  shortName: string | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

export async function getEarningsForWeek(from: string, to: string): Promise<EarningsEvent[]> {
  try {
    // 1. Get all unique tickers from DB
    const rows = await prisma.stock.findMany({ select: { ticker: true }, distinct: ['ticker'] });
    const tickers = rows.map((r) => r.ticker);
    if (tickers.length === 0) return [];

    // 2. Batch quote to filter EQUITYs and capture shortName
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawQuotes = await (yf.quote as any)(tickers) as any[];
    const quotesArr = Array.isArray(rawQuotes) ? rawQuotes : [rawQuotes];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const equityQuotes = quotesArr.filter((q: any) => q.quoteType === 'EQUITY');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quoteByTicker: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const q of equityQuotes as any[]) {
      quoteByTicker[q.symbol] = q;
    }
    const equityTickers = equityQuotes.map((q) => q.symbol as string);

    // 3. quoteSummary for each EQUITY ticker
    const summaryResults = await Promise.allSettled(
      equityTickers.map((ticker) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (yf.quoteSummary as any)(
          ticker,
          { modules: ['calendarEvents', 'earnings', 'incomeStatementHistory'] },
          { validateResult: false },
        ),
      ),
    );

    const today = new Date().toISOString().slice(0, 10);
    const events: EarningsEvent[] = [];

    for (let i = 0; i < equityTickers.length; i++) {
      const result = summaryResults[i];
      if (result.status !== 'fulfilled') continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const summary = result.value as any;
      const earningsDateRaw = summary.calendarEvents?.earnings?.earningsDate?.[0];
      if (!earningsDateRaw) continue;

      // Convert Date to YYYY-MM-DD
      const earningsDate = earningsDateRaw instanceof Date
        ? earningsDateRaw.toISOString().slice(0, 10)
        : String(earningsDateRaw).slice(0, 10);

      // Check if in range
      if (earningsDate < from || earningsDate > to) continue;

      const ticker = equityTickers[i];
      const q = quoteByTicker[ticker];
      const isPast = earningsDate < today;

      events.push({
        date:            earningsDate,
        ticker,
        shortName:       q?.shortName ?? q?.longName ?? null,
        epsEstimate:     summary.calendarEvents?.earnings?.earningsAverage ?? null,
        epsActual:       isPast ? (summary.earnings?.earningsChart?.quarterly?.[0]?.actual ?? null) : null,
        revenueEstimate: summary.calendarEvents?.earnings?.revenueAverage ?? null,
        revenueActual:   isPast ? (summary.incomeStatementHistory?.incomeStatementHistory?.[0]?.totalRevenue ?? null) : null,
      });
    }

    return events.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}
