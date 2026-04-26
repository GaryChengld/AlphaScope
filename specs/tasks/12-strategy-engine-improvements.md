# 12 — Strategy Engine Improvements

## Goal

Address review findings on the strategy engine implementation (task 11). Fixes are grouped by severity. None of these are blockers — task 11 is functional — but applying them improves correctness, maintainability, and performance.

---

## 🔴 Bugs / Correctness Issues

### 1. `triggerTiming` doesn't skip the current incomplete daily bar

**File:** `server/src/services/rules/triggerRules.ts` (line ~122)

The loop starts from `candles.length - 1`. The last daily bar is today's intraday/incomplete bar — it'll always be "near support" if EMA20 is close, inflating `setupDays`. Same bug we fixed in `weeklyTrend` and `uptrendDuration`.

**Fix:** Start from `candles.length - 2`.

### 2. `triggerTiming` has hardcoded EMA20/EMA50 — inconsistent with parameterization

**File:** `server/src/services/rules/triggerRules.ts` (lines 117–118)

`tf.ema[20]` and `tf.ema[50]` are hardcoded, contradicting the project-wide rule that all periods should be parameters.

**Fix:** Accept `emaPeriods: number[]` param (default `[20, 50]`). Update `multi_timeframe_pullback_v1.json` to declare it explicitly.

### 3. `triggerTimeOfDay` ignores DST

**File:** `server/src/services/rules/triggerRules.ts` (line 152)

`((utcHour - 5) % 24 + 24) % 24` always assumes EST (UTC-5). The US is on EDT (UTC-4) from March to November. A 10:30 AM EDT trigger is reported as 9:30 AM, potentially failing the 10:00–14:00 window.

**Fix:** Use `Intl.DateTimeFormat` with `timeZone: 'America/New_York'` and the `hour: 'numeric', minute: 'numeric'` options to extract the local hour correctly.

### 4. `noNearEarnings` business-day count edge case

**File:** `server/src/services/rules/marketRules.ts` (line 12)

`while (cur < end)` returns 0 if earnings are today, and `0 > 5` fails — actually correct. But check the case where earnings are in the past (`days < 0`): the rule passes with detail "earnings in the past". For a stock that just reported, this is the desired behavior. Worth a comment.

**Fix:** Add a code comment explaining the intent. No logic change.

### 5. `pullbackVolume` `quality: "below_avg"` semantics

**File:** `server/src/services/rules/pullbackRules.ts` (line 138)

`pass = recentAvg < avgVol && !declining` — the `!declining` clause makes this mutually exclusive from `ideal` quality, which is intentional for `tiered` pick but non-obvious.

**Fix:** Add a comment clarifying the mutual-exclusion intent.

### 6. `rsiStructure` divergence detection

**File:** `server/src/services/rules/pullbackRules.ts` (lines 307–318)

Detection finds local price lows but only checks RSI values at those indices, not whether the RSI series itself is making local lows. A noisy RSI can satisfy the comparison trivially.

**Fix:** Require both price and RSI to have confirmed local lows at adjacent swing points. Find the two most recent local lows in price; verify RSI at those exact bars shows a higher low (current logic is OK), but additionally require RSI to be near a local minimum at each of those bars (e.g., RSI[i] <= RSI[i-1] and RSI[i] <= RSI[i+1]).

### 7. `supportConfluence` round-number scaling

**File:** `server/src/services/rules/pullbackRules.ts` (lines 262–265)

Uses fixed $50/$100 grid. For a $30 stock, the nearest "round number" is always far away.

**Fix:** Scale the grid by price:
- < $50  → $5  grid
- $50–200 → $10 grid
- > $200 → $25 grid

Also extract this logic to a helper since it's duplicated in `supportProximity`.

### 8. SPY EMA hardcoded in context

**File:** `server/src/services/strategy/strategyContext.ts` (line 98)

`buildTimeframeData(spyCandles, { ema: [200] })` — only EMA200 is computed. If a future strategy needs a different SPY EMA period (e.g., 50 for short-term regime), it won't have data.

**Fix:** Add an optional `requires.spy?: { ema?: number[]; atr?: number[]; rsi?: number[] }` block to the strategy schema. Default to `{ ema: [200] }` if absent.

---

## 🟡 Design / Correctness Concerns

### 9. Section 5 gate detection is fragile

**File:** `server/src/services/strategy/strategyEngine.ts` (line 140)

`section.note?.includes('40')` matches "40" anywhere in the note text. A note like "Combines 4 or 5 factors" would falsely trigger the gate.

**Fix:** Add a structured field to `SectionDef`:
```ts
dependsOn?: { sections: number[]; minTotal: number };
```
Update the JSON to use it. Engine reads the structured field, not the note.

### 10. `points` field in `RuleResult` is unused

**File:** `server/src/services/rules/trendRules.ts` (line 5)

Every rule returns `points: 0`; the engine uses `def.points` from the JSON instead. The field is dead weight.

**Fix:** Remove `points` from `RuleResult`. Update all rule implementations to drop it.

### 11. `evaluateStrategy` total score isn't capped at the section-sum maximum

**File:** `server/src/services/strategy/strategyEngine.ts` (line 153)

If a JSON file mistakenly has sections summing to > the strategy's intended max, no enforcement.

**Fix:** Validate at JSON load time: `sum(sections.maxPoints)` must match an optional top-level `totalMaxPoints` field (default 100). Throw on mismatch.

### 12. Strategy JSON loaded twice per request

**Files:** `server/src/services/strategy/strategyService.ts` and `server/src/routes/strategyRoutes.ts` (line 18)

The route calls `loadStrategy` first to check 404, then `runStrategy` calls it again internally. Two file reads.

**Fix:** Either:
- Add an in-memory cache with a 30-second TTL inside `loadStrategy`, OR
- Have the route call `runStrategy` directly and check for `STRATEGY_NOT_FOUND` in the catch block.

### 13. No JSON schema validation on strategy load

**File:** `server/src/services/strategy/strategyService.ts` (line 33)

`JSON.parse` then cast — if the file is malformed (missing `requires`, wrong types, unknown rule names), errors surface deep inside rule evaluation as cryptic failures.

**Fix:** Add a hand-rolled validator in `strategyService.ts` (no new dependency needed) that checks:
- Required fields present (`id`, `name`, `version`, `requires`, `mandatory`, `sections`)
- Every `condition.rule` exists in `RULES` registry
- Every section has at least one group
- Every group has `pick` ∈ {tiered, best_trigger, additive} and ≥1 condition
Throw a descriptive error on failure.

### 14. `evaluateGroup` for `additive` doesn't expose a winner

**File:** `server/src/services/strategy/strategyEngine.ts` (line 113)

Returns no `winner`. The Markdown renderer at `strategyService.ts:113` shows "no condition met" when `winner` is absent — wrong for additive (which sums all passing conditions).

**Fix:** In `renderSection` (`strategyService.ts`), branch on group structure:
- If `winner` present → render "Group → winner.label +X pts" (current)
- Else if any conditions passed → render the list of passing conditions and their points
- Else → "no condition met"

### 15. `runCondition` doesn't catch rule exceptions

**File:** `server/src/services/strategy/strategyEngine.ts` (line 87)

If a rule throws (malformed params, unexpected null), the whole evaluation crashes, the route returns 502, no diagnostic in the report.

**Fix:** Wrap `ruleFn(ctx, def.params ?? {})` in try/catch. On error, return `{ pass: false, points: def.points ?? 0, detail: 'Rule error: ' + err.message }`. Log the stack.

---

## 🟢 Code Quality / Maintainability

### 16. `last<T>` helper duplicated in 4 rule files

**Files:** `trendRules.ts`, `pullbackRules.ts`, `triggerRules.ts`, `marketRules.ts`

**Fix:** Create `server/src/services/rules/helpers.ts`. Move `last`, `lastN`, `slope`, and the future `nearestRoundNumber` helper there. Re-export from rule files only if needed.

### 17. `RuleResult` interface lives in `trendRules.ts`

Awkward — every other rule file imports it from `trendRules.ts`.

**Fix:** Move `RuleResult` to a new `server/src/services/rules/types.ts` or co-locate with `RuleFn` in `ruleRegistry.ts`. Update imports.

### 18. Round-number logic duplicated

**Files:** `pullbackRules.ts:185-194` and `262-265`

**Fix:** Extract `nearestRoundNumber(close: number): { value: number; distance: number }` to `helpers.ts`. Use in both `supportProximity` and `supportConfluence`.

### 19. Polarity-flip logic duplicated

**Files:** `pullbackRules.ts:213-215` and `257-258`

**Fix:** Extract `priorSwingHigh(candles, lookback): number` to `helpers.ts`. Use in both `swingHighPolarity` and `supportConfluence`.

### 20. Verbose `as TYPE` casts on every param

**Files:** All rule files

**Fix:** Add to `helpers.ts`:
```ts
export function paramNum(params: Record<string, unknown>, key: string, fallback?: number): number;
export function paramStr(params: Record<string, unknown>, key: string, fallback?: string): string;
export function paramArr(params: Record<string, unknown>, key: string, fallback?: number[]): number[];
export function paramBool(params: Record<string, unknown>, key: string, fallback?: boolean): boolean;
```
Each validates the type and throws or returns the fallback. Replaces `params.foo as number` patterns.

### 21. `slope()` not normalized in `all_sloping`

**File:** `trendRules.ts` (line 13)

`ema200_flat` quality normalizes slope by `refVal`, but `all_sloping` only checks `> 0`. Internal inconsistency.

**Fix:** Normalize slope by reference value in all branches. Pass criterion: normalized slope > some small positive threshold (e.g., 0.0005 = 0.05%).

### 22. `hourlyEngulfing` rule name is misleading

**File:** `triggerRules.ts` (line 52)

Rule also accepts hammer/pin bar.

**Fix:** Either:
- Rename to `bullishReversalCandle` (and update the JSON), OR
- Split into `hourlyEngulfing` and `hourlyHammer` as two separate rules.

Recommend the rename.

### 23. `eslint-disable @typescript-eslint/no-explicit-any` clutter in context

**File:** `strategyContext.ts` (lines 84–85, 103, 109)

**Fix:** Define a minimal local interface for the parts of `quoteSummary` we use:
```ts
interface QuoteSummary {
  assetProfile?:    { sector?: string };
  calendarEvents?:  { earnings?: { earningsDate?: unknown[] } };
}
```
Cast once at the call site.

### 24. Markdown `toMarkdown` hardcodes **100** in total row

**File:** `strategyService.ts` (line 94)

**Fix:** Replace with `result.sections.reduce((s, sec) => s + sec.maxPoints, 0)`.

### 25. `findSwingHigh.idx` field name is non-obvious

**File:** `pullbackRules.ts` (line 16)

**Fix:** Rename to `barsAgo` for clarity. Update all callers.

---

## 🔵 Performance / Robustness

### 26. Sector ETF data fetched every request (11 fetches)

**File:** `strategyContext.ts` (line 86)

Sector ETF daily candles only change once per market day. Currently fetched on every strategy evaluation.

**Fix:** Add a module-level cache in `strategyContext.ts`:
```ts
const sectorCache: { data: Record<string, number> | null; timestamp: number } = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
```
On request, return cached `sectorReturns` if `Date.now() - timestamp < CACHE_TTL_MS`.

### 27. SPY data fetched every request

**File:** `strategyContext.ts` (line 82)

**Fix:** Same caching approach as sector ETFs. Cache the parsed `TimeframeData` for SPY with 30-minute TTL.

### 28. Mixing `Promise.all` and `Promise.allSettled` makes failure modes ambiguous

**File:** `strategyContext.ts` (line 80)

Outer `Promise.all` with inner `.catch()` calls on individual fetches — works but harder to reason about than a uniform pattern.

**Fix:** Convert outer wrapper to `Promise.allSettled` and handle each result explicitly. Removes the need for inline `.catch()`.

### 29. No NaN/null guard on candle closes before indicator computation

**File:** `strategyContext.ts` (line 50)

If `candles` contains NaN closes, indicators silently produce garbage.

**Fix:** Filter `candles.filter(c => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low))` at the start of `buildTimeframeData`.

---

## Recommended Priorities

If implementing in phases, suggest this order:

### Phase A — Correctness (must-fix bugs)
- [x] #1 `triggerTiming` skip incomplete bar
- [x] #2 `triggerTiming` parameterize EMA periods
- [x] #3 `triggerTimeOfDay` DST fix
- [x] #15 `runCondition` try/catch
- [x] #14 `additive` rendering fix

### Phase B — Performance (high-impact, simple)
- [x] #26 Cache sector ETF fetches
- [x] #27 Cache SPY fetches

### Phase C — Robustness
- [x] #13 JSON schema validation
- [x] #29 NaN guard
- [x] #11 Total score cap validation

### Phase D — Refactoring (no behavior change)
- [x] #16 Extract `helpers.ts` (`last`, `lastN`, `slope`)
- [x] #17 Move `RuleResult` out of `trendRules.ts`
- [x] #18 Extract `nearestRoundNumber`
- [x] #19 Extract `priorSwingHigh`
- [x] #20 Add param-typing helpers
- [x] #23 Type the Yahoo `quoteSummary` shape locally
- [x] #24 Dynamic total max in Markdown
- [x] #25 Rename `idx` → `barsAgo`

### Phase E — Semantic improvements
- [x] #6 Stricter RSI divergence detection
- [x] #7 Price-scaled round-number grid
- [x] #8 Configurable SPY indicator requirements
- [x] #9 Structured section dependency
- [x] #21 Normalized slope in `all_sloping`
- [x] #22 Rename `hourlyEngulfing`
- [x] #28 Uniform `Promise.allSettled` pattern

### Phase F — Documentation
- [x] #4 Comment on past-earnings semantics
- [x] #5 Comment on `pullbackVolume` mutual exclusion
- [x] #10 Decide whether to remove `points` from `RuleResult` (removed)

---

## Files That Will Be Touched

| File | Phases |
|------|--------|
| `server/src/services/rules/triggerRules.ts` | A |
| `server/src/services/rules/marketRules.ts` | F |
| `server/src/services/rules/pullbackRules.ts` | E, D |
| `server/src/services/rules/trendRules.ts` | E, D |
| `server/src/services/rules/helpers.ts` (new) | D |
| `server/src/services/rules/types.ts` (new) | D |
| `server/src/services/strategy/strategyEngine.ts` | A, B, C |
| `server/src/services/strategy/strategyService.ts` | A, C, D |
| `server/src/services/strategy/strategyContext.ts` | B, C, D |
| `server/src/routes/strategyRoutes.ts` | (consider for #12) |
| `specs/strategies/multi_timeframe_pullback_v1.json` | A (#2), E (#9, #22) |

---

## Verification

After each phase:

```bash
# Type check
cd server && npx tsc --noEmit

# Smoke tests
curl http://localhost:3001/api/strategies
curl http://localhost:3001/api/strategies/multi_timeframe_pullback/evaluate/NVDA
curl http://localhost:3001/api/strategies/multi_timeframe_pullback/evaluate/SQQQ
curl -i http://localhost:3001/api/strategies/nonexistent/evaluate/AAPL  # → 404
curl -i http://localhost:3001/api/strategies/multi_timeframe_pullback/evaluate/XXXXXX  # → 502, no crash
```

After Phase A (DST fix): test during EDT (Mar–Nov) — last 1H candle's reported EST hour should match wall-clock NY time.

After Phase B (caching): second request for the same strategy should be noticeably faster; sector returns identical to first request.

After Phase C (validation): create a malformed strategy JSON missing `requires` → server returns descriptive error, not crash.
