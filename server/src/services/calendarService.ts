import { yf } from '../lib/yf';
import { prisma } from '../lib/prisma';

// ─── Economic Events (FRED) ─────────────────────────────────────────────────
//
// Finnhub / FMP / Trading Economics all moved their economic calendars behind
// paid plans, so we assemble a weekly view from the FRED API (St. Louis Fed),
// which is genuinely free. FRED is series-based, not a calendar, so we curate a
// small set of high-impact US releases: for each we look up whether it was
// released in the requested window (release/dates) and derive a calendar-style
// headline from its observations. FRED has no consensus forecast — actual/prior
// only.

export interface EconomicEvent {
  date: string;              // release date, YYYY-MM-DD
  event: string;             // friendly name
  actual: number | null;
  prev: number | null;
  change: number | null;     // actual − prev
  unit: string;
}

// How to turn raw FRED observation values into a calendar headline.
type DisplayMode = 'level' | 'mom_change' | 'mom_pct' | 'yoy_pct';

interface FredSeriesConfig {
  seriesId: string;
  releaseId: number;
  name: string;
  display: DisplayMode;
  unit: string;
}

// Curated high-impact US releases. release_id values verified via
// /fred/series/release. CPI+Core CPI share release 10; NFP+Unemployment share 50.
const FRED_EVENTS: FredSeriesConfig[] = [
  { seriesId: 'CPIAUCSL',        releaseId: 10, name: 'CPI (YoY)',              display: 'yoy_pct',    unit: '%' },
  { seriesId: 'CPILFESL',        releaseId: 10, name: 'Core CPI (YoY)',         display: 'yoy_pct',    unit: '%' },
  { seriesId: 'PAYEMS',          releaseId: 50, name: 'Nonfarm Payrolls (MoM)', display: 'mom_change', unit: 'K' },
  { seriesId: 'UNRATE',          releaseId: 50, name: 'Unemployment Rate',      display: 'level',      unit: '%' },
  { seriesId: 'PCEPI',           releaseId: 54, name: 'PCE Price Index (YoY)',  display: 'yoy_pct',    unit: '%' },
  { seriesId: 'A191RL1Q225SBEA', releaseId: 53, name: 'Real GDP (QoQ)',         display: 'level',      unit: '%' },
  { seriesId: 'RSAFS',           releaseId: 9,  name: 'Retail Sales (MoM)',      display: 'mom_pct',    unit: '%' },
  { seriesId: 'FEDFUNDS',        releaseId: 18, name: 'Fed Funds Rate',         display: 'level',      unit: '%' },
];

const FRED_BASE = 'https://api.stlouisfed.org/fred';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fredFetch(path: string, params: Record<string, string>, apiKey: string): Promise<any | null> {
  const query = new URLSearchParams({ ...params, api_key: apiKey, file_type: 'json' }).toString();
  const resp = await fetch(`${FRED_BASE}${path}?${query}`);
  if (!resp.ok) return null;
  return resp.json();
}

// Latest release date for a release that falls within [from, to], or null.
// Cached per release id since several series share a release.
async function getReleaseDateInWindow(
  releaseId: number,
  from: string,
  to: string,
  apiKey: string,
  cache: Map<number, string | null>,
): Promise<string | null> {
  const cached = cache.get(releaseId);
  if (cached !== undefined) return cached;

  const data = await fredFetch('/release/dates', {
    release_id: String(releaseId),
    realtime_start: from,
    realtime_end: to,
    include_release_dates_with_no_data: 'true',
    sort_order: 'asc',
  }, apiKey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dates: any[] = data?.release_dates ?? [];
  const inWindow = dates
    .map((d) => d.date as string)
    .filter((d) => d >= from && d <= to)
    .sort();
  const result = inWindow.length ? inWindow[inWindow.length - 1] : null;
  cache.set(releaseId, result);
  return result;
}

function parseObs(v: string | undefined): number | null {
  if (v === undefined || v === '.' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}

// values are newest-first: values[0] = latest observation, values[1] = prior, …
function computeHeadline(values: (number | null)[], display: DisplayMode): { actual: number | null; prev: number | null } {
  const pct = (a: number | null, b: number | null) =>
    a != null && b != null && b !== 0 ? (a / b - 1) * 100 : null;
  const diff = (a: number | null, b: number | null) =>
    a != null && b != null ? a - b : null;

  switch (display) {
    case 'level':
      return { actual: values[0] ?? null, prev: values[1] ?? null };
    case 'mom_change':
      return { actual: diff(values[0], values[1]), prev: diff(values[1], values[2]) };
    case 'mom_pct':
      return { actual: pct(values[0], values[1]), prev: pct(values[1], values[2]) };
    case 'yoy_pct':
      return { actual: pct(values[0], values[12]), prev: pct(values[1], values[13]) };
  }
}

export async function getEconomicEvents(from: string, to: string): Promise<EconomicEvent[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn('[calendarService] FRED_API_KEY not set');
    return [];
  }

  const today = new Date().toISOString().split('T')[0];
  const releaseDateCache = new Map<number, string | null>();

  const results = await Promise.allSettled(
    FRED_EVENTS.map(async (cfg): Promise<EconomicEvent | null> => {
      const releaseDate = await getReleaseDateInWindow(cfg.releaseId, from, to, apiKey, releaseDateCache);
      if (!releaseDate) return null;

      const obsData = await fredFetch('/series/observations', {
        series_id: cfg.seriesId,
        sort_order: 'desc',
        limit: '14', // enough history for YoY (needs the value 12 months back)
      }, apiKey);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = ((obsData?.observations ?? []) as any[]).map((o) => parseObs(o.value));

      const headline = computeHeadline(values, cfg.display);
      // A release scheduled after today hasn't printed yet — show it pending,
      // with the last known reading as prior context.
      const pending = releaseDate > today;
      const actual = pending ? null : round2(headline.actual);
      const prev = pending ? round2(headline.actual) : round2(headline.prev);
      const change = actual != null && prev != null ? round2(actual - prev) : null;

      return { date: releaseDate, event: cfg.name, actual, prev, change, unit: cfg.unit };
    }),
  );

  const events: EconomicEvent[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) events.push(r.value);
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.event.localeCompare(b.event));
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

    // 2. Finnhub returned nothing for our tickers — fall back to Yahoo Finance
    //    calendarEvents, which reports the ACTUAL upcoming earnings date(s) in
    //    `earnings.earningsDate`. (The previous heuristic used earningsHistory's
    //    past quarter-end + 35 days, which wrongly collapsed every company that
    //    shares a fiscal-quarter end onto the same fake date.)
    const fromTs = new Date(from + 'T00:00:00Z').getTime();
    const toTs   = new Date(to   + 'T23:59:59Z').getTime();

    const equityTickers = Array.from(equitySet);
    const summaries = await Promise.allSettled(
      equityTickers.map(async (ticker) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = await (yf.quoteSummary as any)(
          ticker,
          { modules: ['calendarEvents'] },
          { validateResult: false },
        );
        return { ticker, s };
      }),
    );

    const events: EarningsEvent[] = [];
    for (const result of summaries) {
      if (result.status !== 'fulfilled') continue;
      const { ticker, s } = result.value;
      const earnings = s?.calendarEvents?.earnings;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dates: any[] = earnings?.earningsDate ?? [];

      for (const d of dates) {
        const ts = new Date(d as Date).getTime();
        if (!Number.isFinite(ts) || ts < fromTs || ts > toTs) continue;
        events.push({
          date:            new Date(d as Date).toISOString().split('T')[0],
          ticker,
          shortName:       nameByTicker[ticker] ?? null,
          epsEstimate:     earnings?.earningsAverage ?? null,
          epsActual:       null,
          revenueEstimate: earnings?.revenueAverage ?? null,
          revenueActual:   null,
        });
      }
    }

    return events.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}
