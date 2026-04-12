import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Bookmark, X, Loader2 } from 'lucide-react';
import { useWatchlist } from '../context/WatchlistContext';

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  EQUITY: 'Stock',
  ETF: 'ETF',
  INDEX: 'Index',
  CRYPTOCURRENCY: 'Crypto',
};

interface AddTickerModalProps {
  onClose: () => void;
}

export default function AddTickerModal({ onClose }: AddTickerModalProps) {
  const { activeId, watchlists, stocks, refreshStocks } = useWatchlist();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inWatchlist, setInWatchlist] = useState<Set<string>>(new Set());
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeWatchlist = watchlists.find((w) => w.id === activeId);

  // Sync inWatchlist from context stocks
  useEffect(() => {
    setInWatchlist(new Set(stocks.map((s) => s.ticker)));
  }, [stocks]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    } catch { /* ignore */ }
    finally { setSearching(false); }
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  }

  async function handleToggle(result: SearchResult) {
    if (!activeId) return;
    const ticker = result.symbol;
    if (inWatchlist.has(ticker)) {
      // Optimistic remove
      setInWatchlist((prev) => { const s = new Set(prev); s.delete(ticker); return s; });
      await fetch(`/api/watchlists/${activeId}/stocks/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
    } else {
      // Optimistic add
      setInWatchlist((prev) => new Set(prev).add(ticker));
      await fetch(`/api/watchlists/${activeId}/stocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, exchange: result.exchange }),
      });
    }
    refreshStocks();
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleOverlayClick}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[480px] max-h-[520px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm font-medium text-gray-200">
            Add to <span className="text-blue-400">{activeWatchlist?.name ?? 'watchlist'}</span>
          </span>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-200 rounded">
            <X size={15} />
          </button>
        </div>

        {/* Search input */}
        <div className="relative px-4 py-3 border-b border-gray-800">
          <Search size={14} className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search symbol or name…"
            className="w-full bg-gray-800 border border-gray-700 rounded-md pl-8 pr-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
          />
          {searching && (
            <Loader2 size={14} className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 && !searching && (
            <p className="px-4 py-6 text-sm text-gray-600 text-center">
              {query.trim() ? 'No results found' : 'Type to search for a symbol'}
            </p>
          )}
          {results.map((r) => {
            const already = inWatchlist.has(r.symbol);
            return (
              <div
                key={r.symbol}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors"
              >
                <button
                  onClick={() => handleToggle(r)}
                  className="shrink-0"
                  title={already ? 'Remove from watchlist' : 'Add to watchlist'}
                >
                  <Bookmark
                    size={15}
                    className={already ? 'text-red-400 fill-red-400' : 'text-gray-500'}
                  />
                </button>
                <span className="w-20 text-sm font-semibold text-gray-100 shrink-0">{r.symbol}</span>
                <span className="flex-1 text-sm text-gray-400 truncate">{r.name}</span>
                <span className="text-xs text-gray-600 shrink-0 w-12 text-right">
                  {TYPE_LABEL[r.type] ?? r.type}
                </span>
                <span className="text-xs text-gray-600 shrink-0 w-12 text-right">{r.exchange ?? ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
