import { useEffect, useState } from 'react';
import IndexChart from '../components/IndexChart';

interface MarketIndicator {
  ticker: string;
  label: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
}

interface SectorPrice {
  ticker: string;
  name: string;
  changePct: number | null;
}

const PERIODS = ['15m', '30m', '1H', '2H', '4H', '1D', '1W', '1M'] as const;
type Period = typeof PERIODS[number];

function formatChangePct(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function sectorTileClass(changePct: number | null): string {
  if (changePct === null) return 'bg-gray-800';
  if (changePct >= 2) return 'bg-green-500/70';
  if (changePct >= 1) return 'bg-green-500/40';
  if (changePct >= 0.3) return 'bg-green-500/20';
  if (changePct > -0.3) return 'bg-gray-700';
  if (changePct > -1) return 'bg-red-500/20';
  if (changePct > -2) return 'bg-red-500/40';
  return 'bg-red-500/70';
}

function MarketIndicatorBar({
  indicators,
  selected,
  onSelect,
}: {
  indicators: MarketIndicator[];
  selected: string;
  onSelect: (ticker: string) => void;
}) {
  if (indicators.length === 0) {
    return (
      <div className="grid grid-cols-8 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg border border-gray-700 bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-8 gap-2">
      {indicators.map((ind) => {
        const isActive = ind.ticker === selected;
        const pct = ind.changePct;
        const isPositive = pct !== null && pct >= 0;

        let priceDisplay: string;
        if (ind.ticker === '^TNX') {
          priceDisplay = ind.price !== null ? `${ind.price.toFixed(2)}%` : '—';
        } else {
          priceDisplay = ind.price !== null ? ind.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
        }

        return (
          <button
            key={ind.ticker}
            onClick={() => onSelect(ind.ticker)}
            className={`flex flex-col px-4 py-3 rounded-lg border transition-colors text-left w-full ${
              isActive
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                : 'border-gray-700 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <span className="text-xs text-gray-400 leading-tight">{ind.label}</span>
            <span className="text-base font-semibold tabular-nums text-gray-100 leading-tight mt-1">
              {priceDisplay}
            </span>
            <span
              className={`text-xs tabular-nums leading-tight mt-0.5 ${
                pct === null ? 'text-gray-500' : isPositive ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {formatChangePct(pct)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SectorHeatmap({ sectors, selected, onSelect }: { sectors: SectorPrice[]; selected: string; onSelect: (ticker: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sectors</span>
      {sectors.length === 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="h-16 rounded bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {sectors.map((s) => (
            <button
              key={s.ticker}
              onClick={() => onSelect(s.ticker)}
              className={`flex flex-col justify-between p-2.5 rounded text-left w-full transition-all ${sectorTileClass(s.changePct)} ${
                selected === s.ticker ? 'ring-2 ring-blue-400' : 'hover:brightness-125'
              }`}
            >
              <span className="text-sm font-bold text-white leading-tight">{s.ticker}</span>
              <span className="text-xs text-gray-300 truncate leading-tight">{s.name}</span>
              <span
                className={`text-sm tabular-nums font-medium leading-tight ${
                  s.changePct === null
                    ? 'text-gray-400'
                    : s.changePct >= 0
                    ? 'text-green-200'
                    : 'text-red-200'
                }`}
              >
                {formatChangePct(s.changePct)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Overview() {
  const [indicators, setIndicators] = useState<MarketIndicator[]>([]);
  const [sectors, setSectors] = useState<SectorPrice[]>([]);
  const [selected, setSelected] = useState('^GSPC');
  const [period, setPeriod] = useState<Period>('1D');

  useEffect(() => {
    const fetchMarkets = () =>
      fetch('/api/overview/markets')
        .then((r) => (r.ok ? r.json() : []))
        .then((data: MarketIndicator[]) => setIndicators(data))
        .catch(() => {});

    const fetchSectors = () =>
      fetch('/api/overview/sectors')
        .then((r) => (r.ok ? r.json() : []))
        .then((data: SectorPrice[]) => setSectors(data))
        .catch(() => {});

    fetchMarkets();
    fetchSectors();

    const timer = setInterval(() => {
      fetchMarkets();
      fetchSectors();
    }, 30_000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      <MarketIndicatorBar indicators={indicators} selected={selected} onSelect={setSelected} />
      <div className="-mx-4 border-b border-gray-800" />

      <div className="flex gap-4">
        <div className="flex flex-col w-[64%] min-w-0 gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {indicators.find((i) => i.ticker === selected)?.label ??
              sectors.find((s) => s.ticker === selected)?.name ??
              selected}
          </span>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors border ${
                  period === p
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800 border-transparent'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="h-[346px]">
            <IndexChart ticker={selected} period={period} />
          </div>
        </div>

        <div className="w-[36%]">
          <SectorHeatmap sectors={sectors} selected={selected} onSelect={setSelected} />
        </div>
      </div>
    </div>
  );
}
