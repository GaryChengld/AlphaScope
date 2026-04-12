/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

export interface Watchlist {
  id: number;
  name: string;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockWithPrice {
  id: number;
  ticker: string;
  exchange: string | null;
  position: number;
  price: number | null;
  change: number | null;
  changePct: number | null;
}

interface WatchlistContextValue {
  watchlists: Watchlist[];
  activeId: number | null;
  setActiveId: (id: number) => void;
  refresh: () => void;
  stocks: StockWithPrice[];
  stocksLoading: boolean;
  refreshStocks: () => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [stocks, setStocks] = useState<StockWithPrice[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/watchlists');
    if (!res.ok) return;
    const data: Watchlist[] = await res.json();
    setWatchlists(data);
    setActiveId((prev) => {
      if (prev !== null && data.some((w) => w.id === prev)) return prev;
      return data[0]?.id ?? null;
    });
  }, []);

  const refreshStocks = useCallback(async (id?: number | null) => {
    const targetId = id !== undefined ? id : null;
    if (targetId === null) { setStocks([]); return; }
    try {
      const res = await fetch(`/api/watchlists/${targetId}/stocks`);
      if (!res.ok) return;
      const data: StockWithPrice[] = await res.json();
      setStocks(data);
    } catch { /* network error */ }
  }, []);

  // Initial watchlist load
  useEffect(() => {
    async function load() {
      const res = await fetch('/api/watchlists');
      if (!res.ok) return;
      const data: Watchlist[] = await res.json();
      setWatchlists(data);
      setActiveId(data[0]?.id ?? null);
    }
    load();
  }, []);

  // Fetch stocks when activeId changes, set up 30s refresh interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (activeId === null) { setStocks([]); return; }

    setStocksLoading(true);
    fetch(`/api/watchlists/${activeId}/stocks`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: StockWithPrice[]) => setStocks(data))
      .catch(() => {})
      .finally(() => setStocksLoading(false));

    intervalRef.current = setInterval(() => {
      fetch(`/api/watchlists/${activeId}/stocks`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setStocks(data); })
        .catch(() => {});
    }, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeId]);

  const refreshStocksBound = useCallback(() => refreshStocks(activeId), [refreshStocks, activeId]);

  return (
    <WatchlistContext.Provider value={{
      watchlists, activeId, setActiveId, refresh,
      stocks, stocksLoading, refreshStocks: refreshStocksBound,
    }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}
