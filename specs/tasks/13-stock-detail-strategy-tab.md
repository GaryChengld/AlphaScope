# Task 13 — Stock Detail: Strategy Evaluation Tab

## Context

The strategy engine (Task 11) and `multi_timeframe_pullback_v2` are running on the server, exposed via:
- `GET /api/strategies` → `[{ id, name, version }]` (enabled only)
- `GET /api/strategies/:strategyId/evaluate/:ticker` → `text/markdown`

Today the only way to run an evaluation is via curl. Goal: surface this on the **Stock Detail** page so the user can pick a strategy from a dropdown and evaluate the current ticker on demand. Markdown output renders verbatim using the existing `ReactMarkdown` + Tailwind `prose` pattern already used in `RightPanel.tsx`.

## User-confirmed decisions

- **Placement:** new top-level **Strategy** tab between **Analysis** and **News** (stocks only).
- **Trigger UX:** dropdown + explicit **Evaluate** button. Lazy — no auto-fire on selection change.
- **Render mode:** stream the server's markdown directly into `ReactMarkdown`. No JSON variant, no custom card components.

## Scope

Single file change: `client/src/pages/StockDetail.tsx`.
No server changes — endpoints already exist.
No new dependencies — `react-markdown` + `remark-gfm` already used.

## Layout

```
Header / Chart / Key Stats   (unchanged)
─────────────────────────────────────────────────────────────
[ Fundamentals ][ Technicals ][ Analysis ][ Strategy ][ News ]
─────────────────────────────────────────────────────────────
  Strategy: [ Multi-Timeframe Pullback Swing Trading v2.0 ▾ ]   [ Evaluate ]

  ─ State A: idle (before first click) ─
  > Select a strategy and click Evaluate to run it against AAPL.

  ─ State B: loading (after click, while fetching) ─
  Skeleton block matching Analysis-tab loader

  ─ State C: success (markdown rendered) ─
  # Multi-Timeframe Pullback Swing Trading — AAPL
  *Generated: ...*
  ## Mandatory Conditions
  - [x] Price above daily EMA 200 — ...
  ...
  ## Score Summary
  | Section | Max | Score |
  ...
  ### 🟡 ACCEPTABLE SETUP — Reduced position size

  ─ State D: error ─
  Inline red text: "Failed to evaluate: <message>". Evaluate button re-enabled.
```

The dropdown is a Tailwind-styled native `<select>` matching the pattern in `client/src/pages/Settings.tsx`. Re-clicking **Evaluate** refetches; switching strategy in the dropdown does **not** auto-run.

## Implementation Steps (all in `client/src/pages/StockDetail.tsx`)

1. **Extend tab union and visibility filter (lines 405, 437–440):**
   - `useState<'fundamentals' | 'technicals' | 'analysis' | 'strategy' | 'news'>` — add `'strategy'`.
   - Update `visibleTabs` to include `'strategy'` only when `isStock` (same gate as `fundamentals` / `analysis`).
   - Update the `activeTab` fallback to redirect `'strategy'` to `'technicals'` for indices.

2. **New state in `StockDetail`:**
   ```ts
   const [strategies, setStrategies]                 = useState<{ id: string; name: string; version: string }[] | null>(null);
   const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
   const [strategyMarkdown, setStrategyMarkdown]     = useState<string | null>(null);
   const [strategyLoading, setStrategyLoading]       = useState(false);
   const [strategyError, setStrategyError]           = useState<string | null>(null);
   ```
   Reset `strategyMarkdown` / `strategyError` when `ticker` changes (extend the existing reset block near lines 410–412).

3. **Lazy-load strategy list when tab first opens** (mirror Analysis lazy-load at 443–451):
   ```ts
   useEffect(() => {
     if (activeTab !== 'strategy' || strategies !== null) return;
     fetch('/api/strategies')
       .then((r) => r.ok ? r.json() : [])
       .then((list) => {
         setStrategies(list);
         if (list.length > 0) setSelectedStrategyId(list[0].id);
       })
       .catch(() => setStrategies([]));
   }, [activeTab, strategies]);
   ```

4. **Evaluate handler:**
   ```ts
   const runEvaluate = async () => {
     if (!selectedStrategyId || !ticker) return;
     setStrategyLoading(true);
     setStrategyError(null);
     setStrategyMarkdown(null);
     try {
       const r = await fetch(`/api/strategies/${encodeURIComponent(selectedStrategyId)}/evaluate/${encodeURIComponent(ticker)}`);
       if (!r.ok) {
         const j = await r.json().catch(() => ({}));
         throw new Error(j.error ?? `HTTP ${r.status}`);
       }
       setStrategyMarkdown(await r.text());
     } catch (e) {
       setStrategyError(e instanceof Error ? e.message : 'Unknown error');
     } finally {
       setStrategyLoading(false);
     }
   };
   ```

5. **Render the panel** alongside the other `activeTab === ...` blocks (~line 590):
   - Top toolbar: `<select>` of strategies + **Evaluate** button.
     - Select classes (from Settings.tsx): `bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-blue-500`.
     - Evaluate button styled to match existing primary actions; disabled when `strategyLoading || !selectedStrategyId`.
   - Body: idle hint / skeleton / error message / markdown output:
     ```tsx
     <div className="prose prose-invert prose-sm max-w-none">
       <ReactMarkdown remarkPlugins={[remarkGfm]}>{strategyMarkdown}</ReactMarkdown>
     </div>
     ```

6. **Imports:** add (if missing in this file) `import ReactMarkdown from 'react-markdown'` and `import remarkGfm from 'remark-gfm'`.

## Patterns Reused

- Lazy-load on tab activation: `client/src/pages/StockDetail.tsx:443–451` (analysis tab).
- Markdown rendering: `client/src/components/layout/RightPanel.tsx:127–129` (`ReactMarkdown` + `remarkGfm` + `prose prose-invert prose-xs max-w-none`). Use `prose-sm` here since the strategy report is denser.
- Native `<select>` styling: `client/src/pages/Settings.tsx:11–22`.
- Fetch convention (raw `fetch`, relative `/api/...`, silent catch): used throughout `StockDetail.tsx`.
- Tab visibility gate (stocks only): `visibleTabs` filter at `StockDetail.tsx:437–439`.

## Out of Scope

- No JSON variant of the evaluate endpoint. Markdown-only.
- No custom score-card / pill / progress-bar components — markdown rendering is sufficient for v1.
- No persistent caching of evaluations (each click re-fetches).
- No multi-strategy comparison view.

## Verification

1. `cd client && npm run dev` — open `/stock/AAPL`, click the new **Strategy** tab.
2. Confirm the dropdown lists the enabled v2 strategy. Click **Evaluate** — markdown report renders with formatted headings, mandatory checkboxes, score table, and decision banner.
3. Click **Evaluate** again — spinner appears, result refreshes.
4. Open `/stock/^GSPC` (an index) — confirm the **Strategy** tab is hidden.
5. Open `/stock/APPL` (typo) — confirm the markdown still renders (with "Insufficient data" mandatory rows) instead of crashing.
6. Stop the server, click **Evaluate** — confirm the inline error message appears and the button re-enables.
7. `cd client && npx tsc --noEmit` — must pass.
