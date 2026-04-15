import { useEffect, useRef, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { useWatchlist } from '../context/WatchlistContext';

interface WatchlistBookmarkProps {
  ticker: string;
  exchange: string | null;
}

export default function WatchlistBookmark({ ticker, exchange }: WatchlistBookmarkProps) {
  const { watchlists, refreshStocks } = useWatchlist();
  const [open, setOpen]           = useState(false);
  const [memberOf, setMemberOf]   = useState<Set<number>>(new Set());
  const [loading, setLoading]     = useState(false);
  const [toggling, setToggling]   = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  // Fetch membership on mount and whenever ticker changes
  useEffect(() => {
    fetch(`/api/watchlists/membership?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((ids: number[]) => setMemberOf(new Set(ids)))
      .catch(() => {});
  }, [ticker]);

  // Refresh membership when dropdown opens (in case it changed elsewhere)
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/watchlists/membership?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((ids: number[]) => setMemberOf(new Set(ids)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, ticker]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = async (watchlistId: number) => {
    if (toggling.has(watchlistId)) return;
    setToggling((prev) => new Set(prev).add(watchlistId));

    const inList = memberOf.has(watchlistId);

    // Optimistic update
    setMemberOf((prev) => {
      const next = new Set(prev);
      inList ? next.delete(watchlistId) : next.add(watchlistId);
      return next;
    });

    try {
      if (inList) {
        await fetch(`/api/watchlists/${watchlistId}/stocks/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
      } else {
        await fetch(`/api/watchlists/${watchlistId}/stocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, exchange }),
        });
      }
      refreshStocks();
    } catch {
      // Revert optimistic update on failure
      setMemberOf((prev) => {
        const next = new Set(prev);
        inList ? next.add(watchlistId) : next.delete(watchlistId);
        return next;
      });
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(watchlistId); return next; });
    }
  };

  const isBookmarked = memberOf.size > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded hover:bg-gray-800 transition-colors"
        title="Add to watchlist"
      >
        <Bookmark
          size={18}
          className={isBookmarked ? 'text-blue-400 fill-blue-400' : 'text-gray-500'}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg border border-gray-700 bg-gray-900 shadow-xl py-1">
          <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
            Add to watchlist
          </div>
          {loading ? (
            <div className="px-3 py-2 text-xs text-gray-500">Loading…</div>
          ) : watchlists.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">No watchlists</div>
          ) : (
            watchlists.map((wl) => {
              const checked = memberOf.has(wl.id);
              const busy    = toggling.has(wl.id);
              return (
                <label
                  key={wl.id}
                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-800 transition-colors ${busy ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggle(wl.id)}
                    className="accent-blue-400 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-sm text-gray-200 truncate">{wl.name}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
