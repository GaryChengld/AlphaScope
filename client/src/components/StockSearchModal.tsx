import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

export interface SearchResult {
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

interface StockSearchModalProps {
  title: React.ReactNode;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  renderRowAction?: (result: SearchResult) => React.ReactNode;
}

export default function StockSearchModal({ title, onClose, onSelect, renderRowAction }: StockSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          <span className="text-sm font-medium text-gray-200">{title}</span>
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
          {results.map((r) => (
            <div
              key={r.symbol}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors cursor-pointer"
              onClick={() => onSelect(r)}
            >
              {renderRowAction && (
                <button
                  className="shrink-0"
                  onClick={(e) => { e.stopPropagation(); onSelect(r); }}
                >
                  {renderRowAction(r)}
                </button>
              )}
              <span className="w-20 text-sm font-semibold text-gray-100 shrink-0">{r.symbol}</span>
              <span className="flex-1 text-sm text-gray-400 truncate">{r.name}</span>
              <span className="text-xs text-gray-600 shrink-0 w-12 text-right">
                {TYPE_LABEL[r.type] ?? r.type}
              </span>
              <span className="text-xs text-gray-600 shrink-0 w-12 text-right">{r.exchange ?? ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
