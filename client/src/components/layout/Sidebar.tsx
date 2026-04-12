import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScanSearch, BookMarked, Check, Pencil, GripVertical, Trash2, X, Plus } from 'lucide-react';
import { useWatchlist, type Watchlist, type StockWithPrice } from '../../context/WatchlistContext';
import AddTickerModal from '../AddTickerModal';

const NAV_ITEMS = [
  { to: '/overview', icon: LayoutDashboard, label: 'Overview' },
  { to: '/scanner', icon: ScanSearch, label: 'Scanner' },
];


// ─── Watchlist Dropdown ───────────────────────────────────────────────────────

type RowMode = 'view' | 'rename' | 'confirmDelete';

interface RowState {
  [id: number]: RowMode;
}

interface WatchlistDropdownProps {
  onClose: () => void;
}

function WatchlistDropdown({ onClose }: WatchlistDropdownProps) {
  const { watchlists, activeId, setActiveId, refresh } = useWatchlist();
  const [rowMode, setRowMode] = useState<RowState>({});
  const [renameValue, setRenameValue] = useState<{ [id: number]: string }>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const dragIdRef = useRef<number | null>(null);

  function getMode(id: number): RowMode {
    return rowMode[id] ?? 'view';
  }

  function setMode(id: number, mode: RowMode) {
    setRowMode((prev) => ({ ...prev, [id]: mode }));
  }

  // ── Rename ──────────────────────────────────────────────────────────────────
  function startRename(w: Watchlist) {
    setRenameValue((prev) => ({ ...prev, [w.id]: w.name }));
    setMode(w.id, 'rename');
  }

  async function commitRename(id: number) {
    const name = renameValue[id]?.trim();
    if (!name) { cancelRename(id); return; }
    await fetch(`/api/watchlists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setMode(id, 'view');
    refresh();
  }

  function cancelRename(id: number) {
    setMode(id, 'view');
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function commitDelete(id: number) {
    await fetch(`/api/watchlists/${id}`, { method: 'DELETE' });
    setMode(id, 'view');
    if (id === activeId) {
      const remaining = watchlists.filter((w) => w.id !== id);
      if (remaining.length > 0) setActiveId(remaining[0].id);
    }
    refresh();
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  async function commitCreate() {
    const name = newName.trim();
    if (!name) { setAddingNew(false); setNewName(''); return; }
    const res = await fetch('/api/watchlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const created = await res.json();
      setAddingNew(false);
      setNewName('');
      await refresh();
      setActiveId(created.id);
    }
  }

  // ── Drag & Drop reorder ──────────────────────────────────────────────────────
  function handleDragStart(id: number) {
    dragIdRef.current = id;
  }

  function handleDragOver(e: React.DragEvent, id: number) {
    e.preventDefault();
    setDragOverId(id);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  async function handleDrop(targetId: number) {
    setDragOverId(null);
    const sourceId = dragIdRef.current;
    if (sourceId === null || sourceId === targetId) return;
    const ids = watchlists.map((w) => w.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, sourceId);
    await fetch('/api/watchlists/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    refresh();
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-md shadow-xl z-50 py-1 text-sm">
      {watchlists.map((w) => {
        const mode = getMode(w.id);
        const isActive = w.id === activeId;
        const isDragTarget = dragOverId === w.id;

        return (
          <div
            key={w.id}
            draggable
            onDragStart={() => handleDragStart(w.id)}
            onDragOver={(e) => handleDragOver(e, w.id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(w.id)}
            className={`group flex items-center gap-1 px-2 py-1.5 transition-colors ${
              isDragTarget ? 'bg-blue-500/20' : 'hover:bg-gray-800'
            }`}
          >
            {/* Drag handle */}
            <GripVertical size={13} className="text-gray-700 group-hover:text-gray-500 cursor-grab shrink-0" />

            {mode === 'rename' ? (
              // ── Rename mode ──
              <>
                <input
                  autoFocus
                  className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-100 text-sm focus:outline-none focus:border-gray-500"
                  value={renameValue[w.id] ?? w.name}
                  onChange={(e) => setRenameValue((prev) => ({ ...prev, [w.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(w.id);
                    if (e.key === 'Escape') cancelRename(w.id);
                  }}
                />
                <button onClick={() => commitRename(w.id)} className="p-0.5 text-green-400 hover:text-green-300">
                  <Check size={13} />
                </button>
                <button onClick={() => cancelRename(w.id)} className="p-0.5 text-gray-500 hover:text-gray-300">
                  <X size={13} />
                </button>
              </>
            ) : mode === 'confirmDelete' ? (
              // ── Delete confirmation mode ──
              <>
                <span className="flex-1 min-w-0 text-xs text-gray-400 truncate">
                  Delete <span className="text-gray-200">"{w.name}"</span>?
                </span>
                <button
                  onClick={() => commitDelete(w.id)}
                  className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded"
                >
                  Yes
                </button>
                <button
                  onClick={() => setMode(w.id, 'view')}
                  className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-300"
                >
                  No
                </button>
              </>
            ) : (
              // ── Normal view mode ──
              <>
                <button
                  className="flex-1 min-w-0 text-left text-gray-300 hover:text-gray-100 truncate"
                  onClick={() => { setActiveId(w.id); onClose(); }}
                >
                  {w.name}
                </button>
                {isActive && <Check size={12} className="text-blue-400 shrink-0" />}
                <div className="hidden group-hover:flex items-center gap-0.5 ml-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(w); }}
                    className="p-0.5 text-gray-500 hover:text-gray-200"
                    title="Rename"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (!isActive) setMode(w.id, 'confirmDelete'); }}
                    className={`p-0.5 ${isActive ? 'text-gray-700 cursor-not-allowed' : 'text-gray-500 hover:text-red-400'}`}
                    title={isActive ? 'Cannot delete active watchlist' : 'Delete'}
                    disabled={isActive}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      <div className="mx-2 my-1 border-t border-gray-700" />

      {addingNew ? (
        <div className="flex items-center gap-1 px-2 py-1.5">
          <input
            autoFocus
            placeholder="Watchlist name…"
            className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-100 text-sm focus:outline-none focus:border-gray-500"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCreate();
              if (e.key === 'Escape') { setAddingNew(false); setNewName(''); }
            }}
          />
          <button onClick={commitCreate} className="p-0.5 text-green-400 hover:text-green-300">
            <Check size={13} />
          </button>
          <button onClick={() => { setAddingNew(false); setNewName(''); }} className="p-0.5 text-gray-500 hover:text-gray-300">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          onClick={() => setAddingNew(true)}
        >
          <Plus size={13} />
          New watchlist
        </button>
      )}
    </div>
  );
}

// ─── Stock Row ────────────────────────────────────────────────────────────────

interface StockRowProps {
  stock: StockWithPrice;
  index: number;
  onRemove: (ticker: string) => void;
  onDragStart: (id: number) => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: () => void;
  onDrop: (id: number) => void;
  isDragTarget: boolean;
}

function StockRow({ stock, index, onRemove, onDragStart, onDragOver, onDragLeave, onDrop, isDragTarget }: StockRowProps) {
  const navigate = useNavigate();
  const { ticker, price, change, changePct } = stock;
  const positive = (change ?? 0) >= 0;
  const color = positive ? 'text-green-400' : 'text-red-400';
  const sign = positive ? '+' : '';

  return (
    <div
      draggable
      onDragStart={() => onDragStart(stock.id)}
      onDragOver={(e) => onDragOver(e, stock.id)}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(stock.id)}
      className={isDragTarget ? 'bg-blue-500/10' : ''}
    >
      {index > 0 && <div className="mx-3 border-t border-gray-800" />}
      <div className="relative group">
        <button
          onClick={() => navigate(`/stock/${ticker}`)}
          className="w-full flex items-center px-3 py-2 hover:bg-gray-800 transition-colors"
        >
          <span className="w-14 text-sm font-semibold text-gray-100 group-hover:text-white text-left">
            {ticker}
          </span>
          <span className="flex-1 text-sm text-gray-300 text-right tabular-nums">
            {price != null ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
          </span>
          <span className={`w-20 text-xs text-right tabular-nums ${color}`}>
            {change != null ? `${sign}${change.toFixed(2)}` : '—'}
          </span>
          <span className={`w-14 text-xs text-right tabular-nums ${color}`}>
            {changePct != null ? `${sign}${changePct.toFixed(2)}%` : '—'}
          </span>
        </button>
        {/* Hover trash */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(ticker); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center p-1 text-gray-600 hover:text-red-400 transition-colors bg-gray-800 rounded"
          title="Remove from watchlist"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const { watchlists, activeId, stocks, stocksLoading, refreshStocks } = useWatchlist();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const dragIdRef = useRef<number | null>(null);
  const selectorRef = useRef<HTMLDivElement>(null);

  const activeWatchlist = watchlists.find((w) => w.id === activeId);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [dropdownOpen]);

  async function handleRemove(ticker: string) {
    if (!activeId) return;
    await fetch(`/api/watchlists/${activeId}/stocks/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
    refreshStocks();
  }

  function handleDragStart(id: number) { dragIdRef.current = id; }
  function handleDragOver(e: React.DragEvent, id: number) { e.preventDefault(); setDragOverId(id); }
  function handleDragLeave() { setDragOverId(null); }

  async function handleDrop(targetId: number) {
    setDragOverId(null);
    const sourceId = dragIdRef.current;
    if (!activeId || sourceId === null || sourceId === targetId) return;
    const ids = stocks.map((s) => s.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, sourceId);
    await fetch(`/api/watchlists/${activeId}/stocks/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    refreshStocks();
  }

  return (
    <aside className="w-[300px] shrink-0 flex flex-col border-r border-gray-800 bg-gray-950">
      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors
              ${isActive
                ? 'border-l-2 border-blue-400 bg-blue-500/10 text-blue-400 pl-[10px]'
                : 'border-l-2 border-transparent text-gray-400 hover:text-gray-100 hover:bg-gray-800'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 my-1 border-t border-gray-800" />

      {/* Watchlist selector */}
      <div ref={selectorRef} className="relative flex items-center px-3 py-2">
        <button
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-100 font-medium"
          onClick={() => setDropdownOpen((o) => !o)}
        >
          <BookMarked size={15} />
          {activeWatchlist?.name ?? 'My List'}
          <span className="ml-0.5 text-gray-600 text-lg">{dropdownOpen ? '▴' : '▾'}</span>
        </button>
        <button
          onClick={() => setModalOpen(true)}
          className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 transition-colors"
        >
          <Plus size={16} />
          Add
        </button>
        {dropdownOpen && <WatchlistDropdown onClose={() => setDropdownOpen(false)} />}
      </div>
      <div className="mx-3 border-t border-gray-800" />

      {/* Column headers */}
      <div className="flex items-center px-3 py-1.5 text-[10px] text-gray-600 uppercase tracking-wider">
        <span className="w-14">Symbol</span>
        <span className="flex-1 text-right">Price</span>
        <span className="w-20 text-right">Change</span>
        <span className="w-14 text-right">Chg%</span>
      </div>
      <div className="mx-3 border-t border-gray-800" />

      {/* Ticker list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {stocksLoading ? (
          // Skeleton rows
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center px-3 py-3 gap-3">
              <div className="w-10 h-3 bg-gray-800 rounded animate-pulse" />
              <div className="flex-1 h-3 bg-gray-800 rounded animate-pulse" />
              <div className="w-14 h-3 bg-gray-800 rounded animate-pulse" />
            </div>
          ))
        ) : (
          stocks.map((stock, i) => (
            <StockRow
              key={stock.id}
              stock={stock}
              index={i}
              onRemove={handleRemove}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              isDragTarget={dragOverId === stock.id}
            />
          ))
        )}

      </div>

      {modalOpen && <AddTickerModal onClose={() => setModalOpen(false)} />}
    </aside>
  );
}
