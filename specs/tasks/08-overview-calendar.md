# 08 — Overview Calendar Section

## Goal

Add a weekly calendar section below the chart/sectors area in the Overview page.
Shows US economic events (Finnhub) and earnings for watchlist stocks (Yahoo Finance2).

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  [Today]  [📅]  <  Apr 13 – Apr 19, 2026  >             │  ← WeekNav
├───────────────────────────┬──────────────────────────────┤
│  ECONOMIC DATA            │  EARNINGS                    │
│  Date/Time | Activity     │  Date/Time | Sym | Company   │
│  Actual | Fcst | Prior    │  Est EPS | Act EPS           │
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

#### `getEconomicEvents(from: string, to: string)`

- Calls Finnhub: `GET /calendar/economic?from={from}&to={to}&token={FINNHUB_API_KEY}`
- Uses the same `FINNHUB_API_KEY` pattern as `newsService.ts`
- Filters response: `country === 'US'` AND `impact === 'high'`
- Sorts by `time` ascending
- Returns:
  ```ts
  interface EconomicEvent {
    time: string;      // "2026-04-17 08:30:00"
    event: string;     // "Initial Jobless Claims"
    actual: number | null;
    estimate: number | null;
    prev: number | null;
    unit: string;      // "K", "%", "B", etc.
  }
  ```

#### `getEarningsForWeek(from: string, to: string)`

**Step 1 — Get all unique watchlist tickers:**
```ts
const rows = await prisma.stock.findMany({ select: { ticker: true }, distinct: ['ticker'] });
const tickers = rows.map(r => r.ticker);
```

**Step 2 — Filter to EQUITY only:**
- Batch call `yf.quote(tickers)` (same pattern as `getLivePrices` using `as any`)
- Keep only those where `q.quoteType === 'EQUITY'`

**Step 3 — Fetch earnings data per EQUITY ticker:**
- Call `yf.quoteSummary(ticker, { modules: ['calendarEvents', 'earnings', 'incomeStatementHistory'] }, { validateResult: false })`
- From `calendarEvents.earnings.earningsDate`: check if any date falls in `[from, to]` range
- If yes, include in results

**Step 4 — Build response:**
```ts
interface EarningsEvent {
  date: string;              // "2026-04-17"
  time: string | null;       // earnings time if known ("BMO"/"AMC") — from calendarEvents if available
  ticker: string;
  shortName: string | null;
  epsEstimate: number | null;   // calendarEvents.earnings.earningsAverage
  epsActual: number | null;     // earnings.earningsChart.quarterly[latest].actual (if date is past)
  revenueEstimate: number | null; // calendarEvents.earnings.revenueAverage
  revenueActual: number | null;   // incomeStatementHistory.incomeStatementHistory[0].totalRevenue (if past)
}
```

> **Note on revenueActual:** `incomeStatementHistory` gives quarterly revenue. Match the most recent quarter to the earnings date — if the date is past and within the same quarter, use it; otherwise `null`.

> **Note on parallel fetching:** Run `yf.quoteSummary` calls concurrently with `Promise.allSettled` to avoid one failing ticker blocking the rest.

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

- Props: `events: EconomicEvent[]`
- Loading: show skeleton rows while `events.length === 0`
- Table columns: **Date/Time** | **Activity** | **Actual** | **Forecast** | **Prior**
- Format time: `"Thu Apr 17, 08:30"` from the `time` string
- Color actual vs estimate: green if actual > estimate (growth), red if below — but note some indicators (like jobless claims) are inverse; skip coloring to keep it simple
- Empty state: "No major US economic events this week"

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

- [ ] `calendarService.ts` — `getEconomicEvents` + `getEarningsForWeek`
- [ ] Add endpoints to `overview.ts` + mount
- [ ] Client date helpers (`mondayOf`, `formatWeekRange`, `addDays`, `toDateStr`)
- [ ] `WeekNav` component
- [ ] `EconomicTable` component
- [ ] `EarningsTable` component
- [ ] Wire state + fetches into `Overview.tsx`
- [ ] Add section divider + layout in `Overview.tsx`
