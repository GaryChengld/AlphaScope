# 09 — Search Modal

## Goal

Replace the `/search` route navigation with a modal triggered by the Search button in the topbar.
Refactor `AddTickerModal` to share a common base component with the new search modal, eliminating
duplicate search/results UI code.

---

## Shared component: `StockSearchModal.tsx`

Handles everything that is identical between the two modals:

- Modal shell: `fixed inset-0 z-50 bg-black/60` backdrop, `w-[480px]` card, overlay-click-to-close, Escape-to-close.
- Search input: autoFocus, debounced 300 ms `GET /api/stocks/search?q=`, Loader2 spinner.
- Results list with columns: **Symbol (w-20)** · **Name (flex-1, truncated)** · **Type (w-12)** · **Exchange (w-12)**.
- Empty / loading states.

### Props

```ts
interface StockSearchModalProps {
  title: React.ReactNode;           // header label
  onClose: () => void;
  onSelect: (result: SearchResult) => void;  // called on row click
  renderRowAction?: (result: SearchResult) => React.ReactNode; // optional left-side action (bookmark)
}
```

- When `renderRowAction` is provided, it is rendered on the left of each row and the rest of the row is also clickable (calls `onSelect`).
- When omitted, the entire row is a single clickable button.

---

## `AddTickerModal.tsx` — refactored

Becomes a thin wrapper around `StockSearchModal`:

```tsx
<StockSearchModal
  title={<>Add to <span className="text-blue-400">{activeWatchlist?.name}</span></>}
  onClose={onClose}
  onSelect={handleToggle}
  renderRowAction={(r) => (
    <Bookmark size={15} className={inWatchlist.has(r.symbol) ? 'text-red-400 fill-red-400' : 'text-gray-500'} />
  )}
/>
```

Retains `inWatchlist` state and `handleToggle` logic — just delegates UI to the shared component.

---

## New `SearchModal.tsx` — thin wrapper

```tsx
<StockSearchModal
  title="Search"
  onClose={onClose}
  onSelect={(r) => { navigate(`/stock/${r.symbol}`); onClose(); }}
/>
```

No bookmark, no watchlist state — just navigate on select.

---

## `Topbar.tsx` changes

- Add `onSearchClick` prop.
- Search icon button calls `onSearchClick` instead of `navigate('/search')`.

---

## `Shell.tsx` changes

- Add `searchOpen` boolean state.
- Pass `onSearchClick={() => setSearchOpen(true)}` to `Topbar`.
- Render `{searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}` at shell level.

---

## Remove `/search` route (optional)

`SearchResults.tsx` and its `App.tsx` route entry can be removed — confirm before deleting.

---

## Files

| Action | File |
|--------|------|
| New    | `client/src/components/StockSearchModal.tsx` |
| New    | `client/src/components/SearchModal.tsx` |
| Modify | `client/src/components/AddTickerModal.tsx` |
| Modify | `client/src/components/layout/Topbar.tsx` |
| Modify | `client/src/components/layout/Shell.tsx` |
| Remove (optional) | `client/src/pages/SearchResults.tsx` |

---

## Tasks

- [ ] Create `StockSearchModal.tsx` — shared modal shell, search input, results list with `onSelect` + optional `renderRowAction`
- [ ] Refactor `AddTickerModal.tsx` — thin wrapper using `StockSearchModal`
- [ ] Create `SearchModal.tsx` — thin wrapper, navigates to `/stock/:ticker` on select
- [ ] Update `Topbar.tsx` — accept `onSearchClick` prop
- [ ] Update `Shell.tsx` — manage `searchOpen` state, render `SearchModal` at shell level
- [ ] (Optional) Remove `SearchResults.tsx` and its route
