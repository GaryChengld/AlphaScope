# 06 — Stock Reorder in Watchlist ✅ COMPLETED

## Context

The sidebar stock list currently supports drag-to-reorder only. This task adds column-header sorting (asc/desc/normal) and restricts drag-to-reorder to normal order only — sorting and manual reorder are mutually exclusive.

---

## Sort States

Each sortable column cycles through three states on successive clicks:

| Click | State | Arrow indicator |
|-------|-------|-----------------|
| 1st | ascending | ↑ beside header label |
| 2nd | descending | ↓ beside header label |
| 3rd | normal (position order) | no arrow |

Only one column can be sorted at a time. Clicking a different column resets the previous one and starts that column at ascending.

---

## Sortable Columns

| Column | Sort key |
|--------|----------|
| SYMBOL | `ticker` (alphabetical) |
| PRICE | `price` (numeric, nulls last) |
| CHANGE | `change` (numeric, nulls last) |
| CHG% | `changePct` (numeric, nulls last) |

---

## Drag-to-Reorder Availability

- Drag handles (`GripVertical`) and `<DragDropContext>` / `<Droppable>` / `<Draggable>` are **only active when sort state is normal**.
- When any column sort is active:
  - Grip icons are hidden (or visually disabled / `cursor-default`).
  - `isDragDisabled` is set to `true` on every `<Draggable>`.
  - No API call to `PATCH /api/watchlists/:id/stocks/reorder` is made.

---

## UI Details

### Column header row

- Each sortable column header becomes a clickable `<button>` with `cursor-pointer`.
- Arrow indicator: use `ChevronUp` / `ChevronDown` from `lucide-react` (size 12), shown inline after the label.
- Non-active column headers show no arrow; hovering may show a faint `ChevronUp` to hint sortability (optional).

### Grip column spacer

- The grip-handle spacer in the column header row is already present (added in task 04).
- When sort is active, hide the spacer (or keep it for alignment — implementation choice).

---

## State

All sort state is **local to `Sidebar.tsx`** — no changes to `WatchlistContext` or the server.

```ts
type SortKey = 'ticker' | 'price' | 'change' | 'changePct' | null;
type SortDir = 'asc' | 'desc';

const [sortKey, setSortKey] = useState<SortKey>(null);
const [sortDir, setSortDir] = useState<SortDir>('asc');
```

Derived sorted list:

```ts
const displayStocks = useMemo(() => {
  if (!sortKey) return stocks; // position order from context
  return [...stocks].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
    const bv = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
    if (typeof av === 'string') return sortDir === 'asc'
      ? av.localeCompare(bv as string)
      : (bv as string).localeCompare(av);
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}, [stocks, sortKey, sortDir]);
```

Click handler on a column header:

```ts
function handleSort(key: SortKey) {
  if (sortKey !== key) {
    setSortKey(key);
    setSortDir('asc');
  } else if (sortDir === 'asc') {
    setSortDir('desc');
  } else {
    setSortKey(null);   // back to normal
    setSortDir('asc');
  }
}
```

Sort state resets to normal when `activeId` changes (watchlist switch).

---

## Files to Modify

**Client only — no server changes required:**

- `client/src/components/layout/Sidebar.tsx`
  - Add `sortKey` / `sortDir` state
  - Derive `displayStocks` via `useMemo`
  - Make column headers clickable with arrow indicators
  - Conditionally disable drag handles and `isDragDisabled` based on sort state
  - Reset sort on `activeId` change (`useEffect`)

---

## Verification

1. Click SYMBOL header → stocks sort A→Z, ↑ appears beside SYMBOL
2. Click SYMBOL again → sorts Z→A, ↑ changes to ↓
3. Click SYMBOL again → returns to position order, arrow gone, grip handles reappear
4. Click PRICE header while SYMBOL is sorted → SYMBOL arrow clears, PRICE sorts ascending
5. While sorted: grip icons hidden / drag disabled; dragging a row has no effect
6. Switch watchlist → sort resets to normal
7. In normal order: drag-to-reorder works as before; server reorder call succeeds
