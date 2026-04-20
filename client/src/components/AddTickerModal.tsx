import { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { useWatchlist } from '../context/WatchlistContext';
import StockSearchModal, { type SearchResult } from './StockSearchModal';

interface AddTickerModalProps {
  onClose: () => void;
}

export default function AddTickerModal({ onClose }: AddTickerModalProps) {
  const { activeId, watchlists, stocks, refreshStocks } = useWatchlist();
  const [inWatchlist, setInWatchlist] = useState<Set<string>>(new Set());

  const activeWatchlist = watchlists.find((w) => w.id === activeId);

  useEffect(() => {
    setInWatchlist(new Set(stocks.map((s) => s.ticker)));
  }, [stocks]);

  async function handleSelect(result: SearchResult) {
    if (!activeId) return;
    const ticker = result.symbol;
    if (inWatchlist.has(ticker)) {
      setInWatchlist((prev) => { const s = new Set(prev); s.delete(ticker); return s; });
      await fetch(`/api/watchlists/${activeId}/stocks/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
    } else {
      setInWatchlist((prev) => new Set(prev).add(ticker));
      await fetch(`/api/watchlists/${activeId}/stocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, exchange: result.exchange }),
      });
    }
    refreshStocks();
  }

  return (
    <StockSearchModal
      title={<>Add to <span className="text-blue-400">{activeWatchlist?.name ?? 'watchlist'}</span></>}
      onClose={onClose}
      onSelect={handleSelect}
      renderRowAction={(r) => (
        <Bookmark
          size={15}
          className={inWatchlist.has(r.symbol) ? 'text-red-400 fill-red-400' : 'text-gray-500'}
        />
      )}
    />
  );
}
