# 08 — Overview Calendar Section

## Goal

Add a weekly calendar section below the chart/sectors area in the Overview page.
Shows US economic releases and earnings for watchlist stocks.

> **Revision (task 21):** The economic source was migrated from Finnhub to the
> **FRED API** after Finnhub moved `/calendar/economic` behind a premium plan
> (FMP and Trading Economics likewise gated theirs). Earnings switched to
> Finnhub's `/calendar/earnings` as the primary source with a Yahoo Finance
> `calendarEvents` fallback. The sections below reflect the current implementation;
> see `21-fred-economic-calendar.md` for the economic migration detail.

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  [Today]  [📅]  <  Apr 13 – Apr 19, 2026  >             │  ← WeekNav
├───────────────────────────┬──────────────────────────────┤
│  ECONOMIC DATA            │  EARNINGS                    │
│  Date | Release           │  Date | Sym | Company        │
│  Actual | Prior | Change  │  Est EPS | Act EPS           │
│                           │  Est Rev | Act Rev           │
└───────────────────────────┴──────────────────────────────┘
```

Split: same 64% / 36% as chart/sectors above.

---

## Week Navigation (`WeekNav`)

**State in `Overview.tsx`:** `weekStart: Date` — always the Monday of the selected week, initialized to the Monday of today.

**Helper (client-side util):**
```ts
function mondayOf(d: Date): Date {
  const day = d.getDay();               // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Mon
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = sunday.getFullYear();
  return `${fmt(monday)} – ${fmt(sunday)}, ${year}`;
}
```

**Controls:**
- **[Today]** button: `setWeekStart(mondayOf(new Date()))`
- **[📅]** calendar button: triggers a hidden `<input type="date">` via `ref.current.showPicker()` (no extra dependency). On `change`, `setWeekStart(mondayOf(new Date(value)))`.
- **[<]** button: `setWeekStart(d => addDays(d, -7))`
- **[>]** button: `setWeekStart(d => addDays(d, +7))`
- Date label: `formatWeekRange(weekStart)` — e.g. "Apr 13 – Apr 19, 2026"

Style: same `border border-gray-800 bg-gray-900` pill buttons as the rest of the UI.

---

## Server

### `calendarService.ts` — two exported functions

#### `getEconomicEvents(from: string, to: string)` — FRED

FRED (St. Louis Fed) is series-based, not a calendar, so we curate a small
`FRED_EVENTS` list of high-impact US releases and assemble a weekly view:

```ts
interface FredSeriesConfig {
  seriesId: string;   // e.g. 'CPIAUCSL'
  releaseId: number;  // FRED release id (verified via /fred/series/release)
  name: string;       // 'CPI (YoY)'
  display: 'level' | 'mom_change' | 'mom_pct' | 'yoy_pct';
  unit: string;       // '%' | 'K'
}
```

Curated set: CPI + Core CPI (yoy_pct, release 10), Nonfarm Payrolls (mom_change,
release 50) + Unemployment Rate (level, release 50), PCE Price Index (yoy_pct,
release 54), Real GDP (level, release 53), Retail Sales (mom_pct, release 9),
Fed Funds Rate (level, release 18).

Per event (all in parallel via `Promise.allSettled`):
1. `GET /fred/release/dates?release_id=…&realtime_start={from}&realtime_end={to}&include_release_dates_with_no_data=true` — keep dates within `[from, to]`. Cached per `releaseId` (CPI+Core share 10; NFP+Unemployment share 50).
2. If a release date lands in the window, `GET /fred/series/observations?series_id=…&sort_order=desc&limit=14` (14 = enough history for YoY).
3. Derive `{ actual, prev }` from the newest-first values per `display` mode; `change = actual − prev`. A release dated after today is shown pending (`actual: null`).

- Uses `FRED_API_KEY` (missing → `console.warn` + `[]`).
- **No consensus forecast** — FRED does not provide one.
- Returns:
  ```ts
  interface EconomicEvent {
    date: string;          // release date "2026-07-02"
    event: string;         // "Nonfarm Payrolls (MoM)"
    actual: number | null;
    prev: number | null;
    change: number | null; // actual − prev
    unit: string;          // "%" | "K"
  }
  ```

> **Known quirk:** Fed Funds Rate maps to the H.15 release, which publishes
> weekly, so it appears in most weeks (usually `change 0`).

#### `getEarningsForWeek(from: string, to: string)`

**Step 1 — Get all unique watchlist tickers:**
```ts
const rows = await prisma.stock.findMany({ select: { ticker: true }, distinct: ['ticker'] });
const tickers = rows.map(r => r.ticker);
```

**Step 2 — Filter to EQUITY only:**
- Batch call `yf.quote(tickers)` (same pattern as `getLivePrices` using `as any`)
- Keep only those where `q.quoteType === 'EQUITY'`

**Step 3 — Earnings dates (Finnhub primary, Yahoo fallback):**

1. **Primary — Finnhub `/calendar/earnings?from={from}&to={to}`:** filter the returned `earningsCalendar` to our EQUITY tickers. If any match, map them and return (real date + EPS/revenue estimate & actual straight from Finnhub).
2. **Fallback — Yahoo `calendarEvents`:** only if Finnhub returned none of our tickers for the window. For each EQUITY ticker (concurrent `Promise.allSettled`), call `yf.quoteSummary(ticker, { modules: ['calendarEvents'] }, { validateResult: false })` and keep `calendarEvents.earnings.earningsDate` entries within `[from, to]`; estimates from `earningsAverage` / `revenueAverage`.

> **Do NOT** approximate earnings dates from `earningsHistory` quarter-ends + a
> fixed offset — that clusters every company sharing a fiscal-quarter end onto one
> fake date (the original bug: MU/COST/ACN/ADBE/ORCL all landed on the same day).
> `calendarEvents.earnings.earningsDate` is the actual upcoming date.

**Step 4 — Response shape:**
```ts
interface EarningsEvent {
  date: string;              // "2026-06-18"
  ticker: string;
  shortName: string | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}
```

### New endpoints in `overview.ts`

```
GET /api/overview/economic?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/overview/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Both: thin try/catch handlers delegating to `calendarService`.

---

## Client

### `Overview.tsx` additions

New state:
```ts
const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
const [economic, setEconomic] = useState<EconomicEvent[]>([]);
const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
```

Fetch on `weekStart` change (no polling — calendar data is static per week):
```ts
useEffect(() => {
  const from = toDateStr(weekStart);               // "2026-04-13"
  const to   = toDateStr(addDays(weekStart, 6));   // "2026-04-19"
  setEconomic([]);
  setEarnings([]);
  fetch(`/api/overview/economic?from=${from}&to=${to}`)
    .then(r => r.ok ? r.json() : []).then(setEconomic).catch(() => {});
  fetch(`/api/overview/earnings?from=${from}&to=${to}`)
    .then(r => r.ok ? r.json() : []).then(setEarnings).catch(() => {});
}, [weekStart]);
```

### `WeekNav` component

```tsx
<div className="flex items-center gap-2">
  <button onClick={goToday}>Today</button>
  <button onClick={openPicker}>📅</button>
  <input type="date" ref={pickerRef} className="sr-only" onChange={onPickerChange} />
  <button onClick={prevWeek}>‹</button>
  <span>{formatWeekRange(weekStart)}</span>
  <button onClick={nextWeek}>›</button>
</div>
```

Style: `text-xs font-medium` buttons with `border border-gray-700 bg-gray-900 hover:bg-gray-800 rounded px-2 py-1`.

### `EconomicTable` component

- Props: `events: EconomicEvent[] | null` (null = loading)
- Loading: show skeleton rows while `events === null`
- Table columns: **Date** | **Release** | **Actual** | **Prior** | **Change**
- Format date: `"Thu, Jul 2"` from the `date` string
- Color the **Change** cell: green if `≥ 0`, red if `< 0`, gray if null (neutral — no good/bad judgement on the underlying metric)
- Empty state: "No major US economic releases this week"

### `EarningsTable` component

- Props: `events: EarningsEvent[]`
- Loading: skeleton rows
- Table columns: **Date/Time** | **Symbol** | **Company** | **Est EPS** | **Act EPS** | **Est Rev** | **Act Rev**
- Color actual EPS: green if actual ≥ estimate, red if below
- Format revenue: abbreviate (e.g. `$12.4B`, `$890M`)
- Empty state: "No earnings from watchlist stocks this week"

---

## Section divider

Add a full-width divider (`-mx-4 border-b border-gray-800`) between the chart/sectors block and the calendar section, matching the existing divider under the index bar.

---

## Tasks

- [x] `calendarService.ts` — `getEconomicEvents` (FRED) + `getEarningsForWeek` (Finnhub → Yahoo fallback)
- [x] Add endpoints to `overview.ts` + mount
- [x] Client date helpers (`mondayOf`, `formatWeekRange`, `addDays`, `toDateStr`)
- [x] `WeekNav` component
- [x] `EconomicTable` component
- [x] `EarningsTable` component
- [x] Wire state + fetches into `Overview.tsx`
- [x] Add section divider + layout in `Overview.tsx`
