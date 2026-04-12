# 02 — Page Layout Shell ✅ COMPLETED

## Context

Define and implement the top-level UI structure for Alpha Scope. The app is a persistent three-panel shell — sidebar on the left, main content in the center, right panel for notifications/AI analysis — so the sidebar and right panel stay mounted while only the center view changes on navigation.

Key constraints:
- No AI chat input — AI analysis is server-generated and displayed read-only
- Scanner is a backend job — frontend shows status and hits only
- Right panel fed entirely by Socket.io events
- 10% horizontal gutters on both sides with a distinct background color

---

## Final Layout

```
┌─ bg-gray-900 gutter (10%) ──────────────────────────────── gutter (10%) ─┐
│ ┌─ bg-gray-950 ───────────────────────────────────────────────────────┐  │
│ │ TOPBAR: [Alpha Scope] [🔍 Search…] ── spacer ── [clock·status] [🔔][⚙]│ │
│ ├─────────────────────────────────────────────────────────────────────┤  │
│ │ SIDEBAR (300px) │ MAIN CONTENT (flex-1)  │ RIGHT PANEL (360px)     │  │
│ └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Topbar

Order (left → right): **Logo** · **Search** · spacer · **Clock + Status** · **Bell** · **Settings**

- **Logo** — "Alpha Scope" in blue, `text-[17.5px]` (14px base × 1.25)
- **Search** — left of spacer, icon on left; collapses to `w-60` (240px), expands to `w-[432px]` on focus; inline dropdown on type, Enter navigates to `/search?q=...`
- **Clock + Status** — ET time + badge (`OPEN` green / `PRE-MARKET` yellow / `AFTER-HOURS` orange / `CLOSED` gray)
- **Bell** — toggles right panel open/closed
- **Settings** — `NavLink` to `/settings`, highlights blue when active

---

## Left Sidebar (300px)

**Nav section:**
```
📊 Overview       ← active: blue left border
🔍 Scanner
```

**Watchlist section** (with `mx-3` inset dividers throughout):
```
My List  ▾                  [＋ Add]
──────────────────────────────
Symbol   Price       Change  Chg%
──────────────────────────────
AAPL    1,234.56    +2.31  +1.09%
──────────────────────────────
TSLA      248.12    -1.98  -0.79%
...
```

- Four columns: Symbol (w-14) | Price (flex-1, right) | Change (w-20, right) | Chg% (w-14, right)
- Price formatted as `999,999.99` (toLocaleString en-US)
- `tabular-nums` for aligned digits; green/red coloring per direction
- Dividers: `mx-3 border-t border-gray-800` between watchlist header, column header, each row
- Clicking a row navigates to `/stock/:ticker`
- **＋ Add** button (Plus icon size 16 + "Add" label) sits right-aligned in the watchlist header row

---

## Main Content Views

### Market Overview — `/overview`
SPX/SPY/QQQ header + SPX chart placeholder + sector heatmap (11 ETFs with bar visualization)

### Search Results — `/search?q=:query`
Grouped by Stocks / ETFs / Indices; each row clickable → `/stock/:ticker`; hover shows "Add to watchlist"

### Stock Detail — `/stock/:ticker`
Ticker + price header, period selector (1D/5D/1M/3M/1Y), chart/volume/RSI pane placeholders

### Scanner — `/scanner`
Active strategies list (name + status + last run + hit count) + recent hits list

### Settings — `/settings`
AI provider selector (Gemini/OpenAI/Claude) + market data refresh interval

---

## Right Panel (360px, collapsible)

Two scrollable sections fed by Socket.io:
- **Notifications** — scanner hits; clickable → `/stock/:ticker`
- **AI Analysis** — markdown-rendered analysis per ticker + timestamp (`react-markdown` + `remark-gfm`)

---

## Routing

```
/                  → redirect to /overview
/overview          → Market Overview
/search?q=:query   → Search Results
/stock/:ticker     → Stock Detail
/scanner           → Scanner status
/settings          → Settings
```

Sidebar and right panel stay mounted across all routes via React Router `<Outlet>`.

---

## Files Created

```
client/
├── public/
│   └── favicon.svg                      (candlestick chart icon)
├── index.html                           (favicon linked)
└── src/
    ├── App.tsx                          (BrowserRouter + Routes + Shell)
    ├── components/layout/
    │   ├── Shell.tsx                    (gutter wrapper + three-panel flex)
    │   ├── Topbar.tsx                   (search, clock, bell, settings)
    │   ├── Sidebar.tsx                  (nav + watchlist with price columns)
    │   └── RightPanel.tsx              (notifications + AI analysis)
    └── pages/
        ├── Overview.tsx
        ├── SearchResults.tsx
        ├── StockDetail.tsx
        ├── Scanner.tsx
        └── Settings.tsx
```

**Dependency added:** `react-router-dom` (installed into `client` workspace)
