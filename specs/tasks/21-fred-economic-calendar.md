# 21 — FRED Economic Calendar

## Problem

The Overview page "Economic Data" panel was always empty. Root cause: Finnhub's
`/calendar/economic` endpoint became premium-only (returns `403 "You don't have
access to this resource."`). FMP and Trading Economics have likewise gated their
economic calendars behind paid plans. No code change caused the regression — the
data source changed underneath us.

## Decision

Replace the Finnhub economic-calendar source with the **FRED API** (St. Louis Fed),
which is genuinely free (instant key, no plan gating). FRED is series-based, not a
calendar, so we curate a small set of high-impact releases and assemble a weekly
view from release dates + observations.

Trade-off: FRED provides **actual + prior** but **no consensus forecast**. The panel
drops the "Forecast" column in favor of **Date / Event / Actual / Prior / Change**.

## Curated releases (authoritative release IDs verified via `/fred/series/release`)

| Event                    | series_id          | release_id | display     | unit |
|--------------------------|--------------------|-----------:|-------------|------|
| CPI (YoY)                | `CPIAUCSL`         | 10         | yoy_pct     | %    |
| Core CPI (YoY)           | `CPILFESL`         | 10         | yoy_pct     | %    |
| Nonfarm Payrolls (MoM)   | `PAYEMS`           | 50         | mom_change  | K    |
| Unemployment Rate        | `UNRATE`           | 50         | level       | %    |
| PCE Price Index (YoY)    | `PCEPI`            | 54         | yoy_pct     | %    |
| Real GDP (QoQ annualized)| `A191RL1Q225SBEA`  | 53         | level       | %    |
| Retail Sales (MoM)       | `RSAFS`            | 9          | mom_pct     | %    |
| Fed Funds Rate           | `FEDFUNDS`         | 18         | level       | %    |

`display` transforms the raw FRED value into a calendar-style headline:
- `level`      → value as-is (already a rate/%).
- `mom_change` → latest − prior (e.g. NFP job gain, in thousands).
- `mom_pct`    → month-over-month % change.
- `yoy_pct`    → year-over-year % change (needs the observation 12 months back).

`Change` column = `actual − prev`.

## Implementation

1. **`server/.env`** — add `FRED_API_KEY`.
2. **`calendarService.ts`** — rewrite `getEconomicEvents(from, to)`:
   - New `EconomicEvent` shape: `{ date, event, actual, prev, change, unit }`.
   - For each curated item (parallel, `Promise.allSettled`):
     a. `GET /fred/release/dates?release_id=…&realtime_start=from&realtime_end=to&include_release_dates_with_no_data=true` — keep dates within `[from,to]`.
     b. If a release date lands in the window, `GET /fred/series/observations?series_id=…&sort_order=desc&limit=14` and compute actual/prev per `display`.
     c. Release dates in the future (`> today`) → `actual = null` (pending), prev = last known.
   - Cache release dates per `release_id` within one request (CPI+Core share 10; NFP+UNRATE share 50).
   - Missing `FRED_API_KEY` → `console.warn` + return `[]`.
3. **`routes/overview.ts`** — `/economic` returns data again (no premium-403 throw path needed).
4. **`client/src/pages/Overview.tsx`** — update `EconomicEvent` interface + `EconomicTable`
   columns to Date / Event / Actual / Prior / Change.

## Verification

- FRED key auth, observations, series→release, and release-date endpoints all
  return `200` with the key (tested).
- After implementation: `GET /api/overview/economic?from=…&to=…` returns curated
  events for a week containing a release (e.g. CPI, Employment Situation), empty
  otherwise; server type-checks clean.
