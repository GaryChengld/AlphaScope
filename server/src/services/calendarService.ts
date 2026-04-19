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

async function getEquitySet(tickers: string[]): Promise<{ equitySet: Set<string>; nameByTicker: Record<string, string | null> }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawQuotes = await (yf.quote as any)(tickers) as any[];
  const quotesArr = Array.isArray(rawQuotes) ? rawQuotes : [rawQuotes];
  const nameByTicker: Record<string, string | null> = {};
  const equitySet = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const q of quotesArr as any[]) {
    if (q.quoteType === 'EQUITY') {
      equitySet.add(q.symbol as string);
      nameByTicker[q.symbol] = q.shortName ?? q.longName ?? null;
    }
  }
  return { equitySet, nameByTicker };
}

export async function getEarningsForWeek(from: string, to: string): Promise<EarningsEvent[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('[calendarService] FINNHUB_API_KEY not set');
    return [];
  }

  try {
    const rows = await prisma.stock.findMany({ select: { ticker: true }, distinct: ['ticker'] });
    const tickers = rows.map((r) => r.ticker);
    if (tickers.length === 0) return [];

    const { equitySet, nameByTicker } = await getEquitySet(tickers);
    if (equitySet.size === 0) return [];

    // 1. Try Finnhub earnings calendar (works for recent past + future)
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${apiKey}`;
    const resp = await fetch(url);
    if (resp.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await resp.json() as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calendar: any[] = data.earningsCalendar ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filtered = calendar.filter((e: any) => equitySet.has(e.symbol));
      if (filtered.length > 0) {
        return filtered
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((e: any) => ({
            date:            e.date            ?? '',
            ticker:          e.symbol          ?? '',
            shortName:       nameByTicker[e.symbol] ?? null,
            epsEstimate:     e.epsEstimate     ?? null,
            epsActual:       e.epsActual       ?? null,
            revenueEstimate: e.revenueEstimate ?? null,
            revenueActual:   e.revenueActual   ?? null,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }
    }

    // 2. Finnhub returned nothing — fall back to Yahoo Finance earningsHistory.
    //    earningsHistory gives the QUARTER END date; companies typically report
    //    4–6 weeks after quarter end.  We approximate the announcement date as
    //    quarter-end + 35 days and check whether it lands in the requested week.
    const fromTs = new Date(from + 'T00:00:00Z').getTime();
    const toTs   = new Date(to   + 'T23:59:59Z').getTime();

    const equityTickers = Array.from(equitySet);
    const summaries = await Promise.allSettled(
      equityTickers.map(async (ticker) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = await (yf.quoteSummary as any)(
          ticker,
          { modules: ['earningsHistory'] },
          { validateResult: false },
        );
        return { ticker, s };
      }),
    );

    const events: EarningsEvent[] = [];
    for (const result of summaries) {
      if (result.status !== 'fulfilled') continue;
      const { ticker, s } = result.value;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const history: any[] = s?.earningsHistory?.history ?? [];

      for (const h of history) {
        if (!h.quarter) continue;
        const quarterEnd = new Date(h.quarter as Date);
        const approxDate = new Date(quarterEnd);
        approxDate.setDate(approxDate.getDate() + 35);
        const approxTs = approxDate.getTime();

        if (approxTs >= fromTs && approxTs <= toTs) {
          events.push({
            date:            approxDate.toISOString().split('T')[0],
            ticker,
            shortName:       nameByTicker[ticker] ?? null,
            epsEstimate:     h.epsEstimate ?? null,
            epsActual:       h.epsActual   ?? null,
            revenueEstimate: null,
            revenueActual:   null,
          });
        }
      }
    }

    return events.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}
