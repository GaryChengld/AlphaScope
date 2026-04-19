import { useEffect, useRef, useState } from 'react';
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

interface EconomicEvent {
  time: string;
  event: string;
  actual: number | null;
  estimate: number | null;
  prev: number | null;
  unit: string;
}

interface EarningsEvent {
  date: string;
  ticker: string;
  shortName: string | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
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

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(monday)} – ${fmt(sunday)}, ${sunday.getFullYear()}`;
}

function formatEconomicTime(time: string): string {
  const date = new Date(time.replace(' ', 'T'));
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ', ' +
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatWithUnit(value: number | null, unit: string): string {
  if (value === null) return '—';
  return `${value}${unit}`;
}

function formatRevenue(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value}`;
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

function WeekNav({
  weekStart,
  onToday,
  onPrev,
  onNext,
  onDatePick,
}: {
  weekStart: Date;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDatePick: (date: Date) => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToday}
        className="px-2 py-1 text-xs font-medium border border-gray-700 bg-gray-900 hover:bg-gray-800 rounded transition-colors text-gray-300"
      >
        Today
      </button>
      <button
        onClick={() => pickerRef.current?.showPicker()}
        className="px-2 py-1 text-xs font-medium border border-gray-700 bg-gray-900 hover:bg-gray-800 rounded transition-colors text-gray-300"
      >
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="sr-only"
        onChange={(e) => {
          if (e.target.value) onDatePick(new Date(e.target.value + 'T00:00:00'));
        }}
      />
      <button
        onClick={onPrev}
        className="px-2 py-1 text-xs font-medium border border-gray-700 bg-gray-900 hover:bg-gray-800 rounded transition-colors text-gray-300"
      >
        ‹
      </button>
      <span className="text-xs text-gray-300 font-medium min-w-[160px]">
        {formatWeekRange(weekStart)}
      </span>
      <button
        onClick={onNext}
        className="px-2 py-1 text-xs font-medium border border-gray-700 bg-gray-900 hover:bg-gray-800 rounded transition-colors text-gray-300"
      >
        ›
      </button>
    </div>
  );
}

function EconomicTable({ events }: { events: EconomicEvent[] | null }) {
  if (events === null) {
    return (
      <div className="flex flex-col gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">No major US economic events this week.</p>;
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-left py-1 pr-3">Date/Time</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-left py-1 pr-3">Activity</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right py-1 pr-3">Actual</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right py-1 pr-3">Forecast</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right py-1">Prior</th>
        </tr>
      </thead>
      <tbody>
        {events.map((ev, i) => (
          <tr key={`${ev.time}-${ev.event}`} className={`border-b border-gray-800 ${i % 2 === 0 ? 'bg-gray-900/50' : ''}`}>
            <td className="text-xs text-gray-300 py-1.5 pr-3 whitespace-nowrap">{formatEconomicTime(ev.time)}</td>
            <td className="text-xs text-gray-300 py-1.5 pr-3">{ev.event}</td>
            <td className="text-xs text-gray-300 py-1.5 pr-3 text-right tabular-nums">{formatWithUnit(ev.actual, ev.unit)}</td>
            <td className="text-xs text-gray-300 py-1.5 pr-3 text-right tabular-nums">{formatWithUnit(ev.estimate, ev.unit)}</td>
            <td className="text-xs text-gray-300 py-1.5 text-right tabular-nums">{formatWithUnit(ev.prev, ev.unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EarningsTable({ events }: { events: EarningsEvent[] | null }) {
  if (events === null) {
    return (
      <div className="flex flex-col gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">No earnings from watchlist stocks this week.</p>;
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-left py-1 pr-3">Date</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-left py-1 pr-3">Symbol</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-left py-1 pr-3">Company</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right py-1 pr-3">Est EPS</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right py-1 pr-3">Act EPS</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right py-1 pr-3">Est Rev</th>
          <th className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right py-1">Act Rev</th>
        </tr>
      </thead>
      <tbody>
        {events.map((ev, i) => {
          const epsColor =
            ev.epsActual === null
              ? 'text-gray-400'
              : ev.epsEstimate !== null && ev.epsActual >= ev.epsEstimate
              ? 'text-green-400'
              : 'text-red-400';

          return (
            <tr key={`${ev.date}-${ev.ticker}`} className={`border-b border-gray-800 ${i % 2 === 0 ? 'bg-gray-900/50' : ''}`}>
              <td className="text-xs text-gray-300 py-1.5 pr-3 whitespace-nowrap">{ev.date}</td>
              <td className="text-xs text-gray-300 py-1.5 pr-3 font-medium">{ev.ticker}</td>
              <td className="text-xs text-gray-300 py-1.5 pr-3 truncate max-w-[120px]">{ev.shortName ?? '—'}</td>
              <td className="text-xs text-gray-300 py-1.5 pr-3 text-right tabular-nums">
                {ev.epsEstimate !== null ? ev.epsEstimate.toFixed(2) : '—'}
              </td>
              <td className={`text-xs py-1.5 pr-3 text-right tabular-nums ${epsColor}`}>
                {ev.epsActual !== null ? ev.epsActual.toFixed(2) : '—'}
              </td>
              <td className="text-xs text-gray-300 py-1.5 pr-3 text-right tabular-nums">{formatRevenue(ev.revenueEstimate)}</td>
              <td className="text-xs text-gray-300 py-1.5 text-right tabular-nums">{formatRevenue(ev.revenueActual)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function Overview() {
  const [indicators, setIndicators] = useState<MarketIndicator[]>([]);
  const [sectors, setSectors] = useState<SectorPrice[]>([]);
  const [selected, setSelected] = useState('^GSPC');
  const [period, setPeriod] = useState<Period>('1D');
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [economic, setEconomic] = useState<EconomicEvent[] | null>(null);
  const [earnings, setEarnings] = useState<EarningsEvent[] | null>(null);

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

  useEffect(() => {
    const from = toDateStr(weekStart);
    const to = toDateStr(addDays(weekStart, 6));
    setEconomic(null);
    setEarnings(null);
    fetch(`/api/overview/economic?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: EconomicEvent[]) => setEconomic(data))
      .catch(() => setEconomic([]));
    fetch(`/api/overview/earnings?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: EarningsEvent[]) => setEarnings(data))
      .catch(() => setEarnings([]));
  }, [weekStart]);

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

      <div className="-mx-4 border-b border-gray-800" />

      <div className="flex flex-col gap-3">
        <WeekNav
          weekStart={weekStart}
          onToday={() => setWeekStart(mondayOf(new Date()))}
          onPrev={() => setWeekStart((d) => addDays(d, -7))}
          onNext={() => setWeekStart((d) => addDays(d, 7))}
          onDatePick={(date) => setWeekStart(mondayOf(date))}
        />
        <div className="flex gap-4">
          <div className="w-[64%] min-w-0">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Economic Data</span>
              <EconomicTable events={economic} />
            </div>
          </div>
          <div className="w-[36%]">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Earnings</span>
              <EarningsTable events={earnings} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
