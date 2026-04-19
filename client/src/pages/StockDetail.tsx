import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import TradingViewChart from '../components/TradingViewChart';
import IndexChart from '../components/IndexChart';
import WatchlistBookmark from '../components/WatchlistBookmark';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Technicals {
  ma5: number | null; ma10: number | null; ma20: number | null;
  ma50: number | null; ma100: number | null; ma200: number | null;
  rsi14: number | null;
  atr14: number | null;
  macd: { macd: number | null; signal: number | null; histogram: number | null } | null;
  bollingerBands: { upper: number; middle: number; lower: number } | null;
  stochastic: { k: number; d: number } | null;
}

interface Summary {
  symbol: string; shortName: string | null; quoteType: string | null; exchange: string | null;
  marketState: string | null;
  price: number | null; change: number | null; changePct: number | null;
  preMarketPrice: number | null; preMarketChange: number | null; preMarketChangePct: number | null;
  postMarketPrice: number | null; postMarketChange: number | null; postMarketChangePct: number | null;
  high: number | null; low: number | null; volume: number | null; marketCap: number | null;
  previousClose: number | null; open: number | null;
  dayRangeLow: number | null; dayRangeHigh: number | null;
  fiftyTwoWeekLow: number | null; fiftyTwoWeekHigh: number | null;
  averageVolume: number | null; beta: number | null;
  dividendRate: number | null; dividendYield: number | null; exDividendDate: string | null;
  trailingPE: number | null; forwardPE: number | null; trailingEps: number | null;
  pegRatio: number | null; priceToBook: number | null; priceToSales: number | null;
  enterpriseValue: number | null; enterpriseToEbitda: number | null; enterpriseToRevenue: number | null;
  bookValue: number | null; sharesOutstanding: number | null; floatShares: number | null;
  heldByInsiders: number | null; heldByInstitutions: number | null; shortRatio: number | null;
  earningsDate: string | null; targetMeanPrice: number | null;
  totalRevenue: number | null; revenuePerShare: number | null; revenueGrowth: number | null;
  grossProfits: number | null; grossMargins: number | null;
  ebitda: number | null; ebitdaMargins: number | null;
  netIncomeToCommon: number | null; earningsGrowth: number | null;
  profitMargins: number | null; operatingMargins: number | null;
  returnOnEquity: number | null; returnOnAssets: number | null;
  totalCash: number | null; totalDebt: number | null; debtToEquity: number | null;
  currentRatio: number | null; quickRatio: number | null;
  operatingCashflow: number | null; freeCashflow: number | null;
  technicals: Technicals | null;
}

interface NewsItem {
  headline: string; source: string; url: string;
  datetime: number; summary: string; image: string | null;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmt = (v: number | null, decimals = 2) =>
  v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtPct = (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(2)}%`;

const fmtLarge = (v: number | null) => {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toLocaleString('en-US')}`;
};

const fmtVol = (v: number | null) => {
  if (v == null) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toLocaleString('en-US');
};

const fmtDate = (v: string | number | null) => {
  if (v == null) return '—';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const PERIODS = ['15m', '30m', '1H', '2H', '4H', '1D', '1W', '1M'] as const;
type Period = typeof PERIODS[number];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-800 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-200 text-right">{value}</span>
    </div>
  );
}

function FundGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-green-600 uppercase tracking-wider mb-1">{title}</div>
      <div className="border border-gray-800 rounded-lg overflow-hidden px-3">{children}</div>
    </div>
  );
}


function MaRow({ label, value, price }: { label: string; value: number | null; price: number | null }) {
  if (value == null) return null;
  const above = price != null && price > value;
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-800 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-300 tabular-nums">{fmt(value)}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${above ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
          {above ? 'Above' : 'Below'}
        </span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('1D');
  const [tab, setTab] = useState<'fundamentals' | 'technicals' | 'news'>('fundamentals');

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setSummary(null);
    setNews([]);

    const fetchSummary = () =>
      fetch(`/api/stocks/${encodeURIComponent(ticker)}/summary`)
        .then((r) => r.ok ? r.json() : null)
        .then((s) => { if (s) setSummary(s); })
        .catch(() => {});

    // Initial load: summary + news together
    Promise.all([
      fetch(`/api/stocks/${encodeURIComponent(ticker)}/summary`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/stocks/${encodeURIComponent(ticker)}/news`).then((r) => r.ok ? r.json() : []),
    ]).then(([s, n]) => {
      setSummary(s);
      setNews(n ?? []);
    }).catch(() => {}).finally(() => setLoading(false));

    const timer = setInterval(fetchSummary, 30_000);
    return () => clearInterval(timer);
  }, [ticker]);

  if (!ticker) return null;

  const isIndex = summary?.quoteType === 'INDEX' || ticker.startsWith('^');
  const isStock = summary?.quoteType === 'EQUITY';
  const visibleTabs = (['fundamentals', 'technicals', 'news'] as const).filter(
    (t) => t !== 'fundamentals' || isStock,
  );
  const activeTab = tab === 'fundamentals' && !isStock ? 'technicals' : tab;
  const positive = (summary?.change ?? 0) >= 0;
  const changeColor = positive ? 'text-green-400' : 'text-red-400';
  const changeSign = positive ? '+' : '';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-950">
      {/* ── Summary header ── */}
      <div className="px-5 py-4 border-b border-gray-800 shrink-0">
        {loading ? (
          <div className="space-y-2">
            <div className="h-7 w-48 bg-gray-800 rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-800 rounded animate-pulse" />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            {/* Left: symbol + price + change */}
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-100">{summary?.symbol ?? ticker}</h1>
                {summary?.shortName && <span className="text-base text-gray-400">{summary.shortName}</span>}
                {summary?.exchange && <span className="text-xs text-gray-600">{summary.exchange}</span>}
                <WatchlistBookmark ticker={summary?.symbol ?? ticker} exchange={summary?.exchange ?? null} />
              </div>
              <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                <span className="text-3xl font-semibold text-gray-100 tabular-nums">
                  {fmt(summary?.price ?? null)}
                </span>
                {summary?.change != null && (
                  <span className={`text-sm font-medium tabular-nums ${changeColor}`}>
                    {changeSign}{fmt(summary.change)} ({changeSign}{(summary.changePct ?? 0).toFixed(2)}%)
                  </span>
                )}
              </div>
              {(() => {
                const state = summary?.marketState;
                const isPre  = state === 'PRE'  || state === 'PREPRE';
                const isPost = state === 'POST' || state === 'POSTPOST' || state === 'CLOSED';
                const extPrice  = isPre ? summary?.preMarketPrice  : isPost ? summary?.postMarketPrice  : null;
                const extChange = isPre ? summary?.preMarketChange : isPost ? summary?.postMarketChange : null;
                const extPct    = isPre ? summary?.preMarketChangePct : isPost ? summary?.postMarketChangePct : null;
                const label     = isPre ? 'Pre-market' : 'After hours';
                if (extPrice == null) return null;
                const up   = (extChange ?? 0) >= 0;
                const color = up ? 'text-green-400' : 'text-red-400';
                const sign  = up ? '+' : '';
                return (
                  <div className={`flex items-baseline gap-2 mt-0.5 text-sm tabular-nums ${color}`}>
                    <span className="text-gray-500 text-xs">{label}</span>
                    <span className="font-medium">{fmt(extPrice)}</span>
                    {extChange != null && (
                      <span className="text-xs">{sign}{fmt(extChange)} ({sign}{(extPct ?? 0).toFixed(2)}%)</span>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* Right: H / L / Vol / Cap */}
            <div className="flex flex-col items-end gap-0.5 text-xs shrink-0">
              <span className="text-gray-500">H: <span className="text-gray-300 tabular-nums">{fmt(summary?.high ?? null)}</span></span>
              <span className="text-gray-500">L: <span className="text-gray-300 tabular-nums">{fmt(summary?.low ?? null)}</span></span>
              <span className="text-gray-500">Vol: <span className="text-gray-300 tabular-nums">{fmtVol(summary?.volume ?? null)}</span></span>
              <span className="text-gray-500">Cap: <span className="text-gray-300 tabular-nums">{fmtLarge(summary?.marketCap ?? null)}</span></span>
            </div>
          </div>
        )}
      </div>

      {/* ── Chart + Key Stats ── */}
      <div className="flex shrink-0 border-b border-gray-800" style={{ height: 600 }}>
        {/* Chart */}
        <div className="flex flex-col flex-1 min-w-0 p-3 gap-2">
          {/* Period buttons */}
          <div className="flex gap-1 shrink-0">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors border
                  ${period === p
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800 border-transparent'
                  }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Chart area */}
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-gray-900">
            {isIndex
              ? <IndexChart ticker={ticker} period={period} />
              : <TradingViewChart symbol={ticker} period={period} />
            }
          </div>
        </div>

        {/* Key Stats */}
        <div className="w-[280px] shrink-0 border-l border-gray-800 overflow-y-auto px-4 py-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Key Statistics</h3>
          <StatRow label="Previous Close"          value={fmt(summary?.previousClose ?? null)} />
          <StatRow label="Open"                    value={fmt(summary?.open ?? null)} />
          <StatRow label="Day's Range"             value={summary?.dayRangeLow != null && summary?.dayRangeHigh != null ? `${fmt(summary.dayRangeLow)} – ${fmt(summary.dayRangeHigh)}` : '—'} />
          <StatRow label="52 Week Range"           value={summary?.fiftyTwoWeekLow != null && summary?.fiftyTwoWeekHigh != null ? `${fmt(summary.fiftyTwoWeekLow)} – ${fmt(summary.fiftyTwoWeekHigh)}` : '—'} />
          <StatRow label="Volume"                  value={fmtVol(summary?.volume ?? null)} />
          <StatRow label="Avg. Volume"             value={fmtVol(summary?.averageVolume ?? null)} />
          <StatRow label="Market Cap"              value={fmtLarge(summary?.marketCap ?? null)} />
          <StatRow label="Beta (5Y Monthly)"       value={fmt(summary?.beta ?? null)} />
          <StatRow label="PE Ratio (TTM)"          value={fmt(summary?.trailingPE ?? null)} />
          <StatRow label="EPS (TTM)"               value={fmt(summary?.trailingEps ?? null)} />
          <StatRow label="Next Earnings Date"      value={fmtDate(summary?.earningsDate ?? null)} />
          <StatRow label="Forward Div & Yield"     value={summary?.dividendRate != null && summary?.dividendYield != null ? `${fmt(summary.dividendRate)} (${fmtPct(summary.dividendYield)})` : '—'} />
          <StatRow label="Ex-Dividend Date"        value={fmtDate(summary?.exDividendDate ?? null)} />
          <StatRow label="1y Target Est"           value={fmt(summary?.targetMeanPrice ?? null)} />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Tab bar */}
        <div className="flex border-b border-gray-800 px-5 shrink-0">
          {visibleTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px
                ${activeTab === t
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {activeTab === 'fundamentals' && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">

              <FundGroup title="Valuation">
                <StatRow label="Market Cap"          value={fmtLarge(summary?.marketCap ?? null)} />
                <StatRow label="Enterprise Value"    value={fmtLarge(summary?.enterpriseValue ?? null)} />
                <StatRow label="P/E Ratio (TTM)"     value={fmt(summary?.trailingPE ?? null)} />
                <StatRow label="Forward P/E"         value={fmt(summary?.forwardPE ?? null)} />
                <StatRow label="PEG Ratio"           value={fmt(summary?.pegRatio ?? null)} />
                <StatRow label="P/S Ratio"           value={fmt(summary?.priceToSales ?? null)} />
                <StatRow label="P/B Ratio"           value={fmt(summary?.priceToBook ?? null)} />
                <StatRow label="EV / Revenue"        value={fmt(summary?.enterpriseToRevenue ?? null)} />
                <StatRow label="EV / EBITDA"         value={fmt(summary?.enterpriseToEbitda ?? null)} />
              </FundGroup>

              <FundGroup title="Income Statement">
                <StatRow label="Revenue (TTM)"       value={fmtLarge(summary?.totalRevenue ?? null)} />
                <StatRow label="Revenue / Share"     value={fmt(summary?.revenuePerShare ?? null)} />
                <StatRow label="Revenue Growth"      value={fmtPct(summary?.revenueGrowth ?? null)} />
                <StatRow label="Gross Profit"        value={fmtLarge(summary?.grossProfits ?? null)} />
                <StatRow label="EBITDA"              value={fmtLarge(summary?.ebitda ?? null)} />
                <StatRow label="Net Income"          value={fmtLarge(summary?.netIncomeToCommon ?? null)} />
                <StatRow label="EPS (TTM)"           value={fmt(summary?.trailingEps ?? null)} />
                <StatRow label="Earnings Growth"     value={fmtPct(summary?.earningsGrowth ?? null)} />
              </FundGroup>

              <FundGroup title="Margins">
                <StatRow label="Gross Margin"        value={fmtPct(summary?.grossMargins ?? null)} />
                <StatRow label="Operating Margin"    value={fmtPct(summary?.operatingMargins ?? null)} />
                <StatRow label="EBITDA Margin"       value={fmtPct(summary?.ebitdaMargins ?? null)} />
                <StatRow label="Profit Margin"       value={fmtPct(summary?.profitMargins ?? null)} />
              </FundGroup>

              <FundGroup title="Profitability">
                <StatRow label="Return on Equity"    value={fmtPct(summary?.returnOnEquity ?? null)} />
                <StatRow label="Return on Assets"    value={fmtPct(summary?.returnOnAssets ?? null)} />
                <StatRow label="1y Target Price"     value={fmt(summary?.targetMeanPrice ?? null)} />
              </FundGroup>

              <FundGroup title="Balance Sheet">
                <StatRow label="Total Cash"          value={fmtLarge(summary?.totalCash ?? null)} />
                <StatRow label="Total Debt"          value={fmtLarge(summary?.totalDebt ?? null)} />
                <StatRow label="Debt / Equity"       value={fmt(summary?.debtToEquity ?? null)} />
                <StatRow label="Current Ratio"       value={fmt(summary?.currentRatio ?? null)} />
                <StatRow label="Quick Ratio"         value={fmt(summary?.quickRatio ?? null)} />
                <StatRow label="Book Value / Share"  value={fmt(summary?.bookValue ?? null)} />
              </FundGroup>

              <FundGroup title="Cash Flow">
                <StatRow label="Operating Cash Flow" value={fmtLarge(summary?.operatingCashflow ?? null)} />
                <StatRow label="Free Cash Flow"      value={fmtLarge(summary?.freeCashflow ?? null)} />
              </FundGroup>

              <FundGroup title="Share Statistics">
                <StatRow label="Shares Outstanding"  value={fmtLarge(summary?.sharesOutstanding ?? null)} />
                <StatRow label="Float"               value={fmtLarge(summary?.floatShares ?? null)} />
                <StatRow label="Held by Insiders"    value={fmtPct(summary?.heldByInsiders ?? null)} />
                <StatRow label="Held by Institutions" value={fmtPct(summary?.heldByInstitutions ?? null)} />
                <StatRow label="Short Ratio"         value={fmt(summary?.shortRatio ?? null)} />
              </FundGroup>

            </div>
          )}

          {activeTab === 'technicals' && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Moving Averages */}
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Moving Averages</div>
                {[
                  ['MA 5',   summary?.technicals?.ma5],
                  ['MA 10',  summary?.technicals?.ma10],
                  ['MA 20',  summary?.technicals?.ma20],
                  ['MA 50',  summary?.technicals?.ma50],
                  ['MA 100', summary?.technicals?.ma100],
                  ['MA 200', summary?.technicals?.ma200],
                ].map(([label, value]) => (
                  <MaRow key={label as string} label={label as string} value={value as number | null} price={summary?.price ?? null} />
                ))}
              </div>

              {/* Oscillators */}
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Oscillators</div>
                {summary?.technicals?.rsi14 != null && (() => {
                  const v = summary.technicals!.rsi14!;
                  const label = v > 70 ? 'Overbought' : v < 30 ? 'Oversold' : 'Neutral';
                  const color = v > 70 ? 'text-red-400 bg-red-400/10' : v < 30 ? 'text-green-400 bg-green-400/10' : 'text-gray-400 bg-gray-700/40';
                  return (
                    <div className="flex justify-between items-center py-1 border-b border-gray-800">
                      <span className="text-xs text-gray-500">RSI (14)</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-300 tabular-nums">{v.toFixed(2)}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>{label}</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex justify-between items-center py-1 border-b border-gray-800">
                  <span className="text-xs text-gray-500">ATR (14)</span>
                  <span className="text-xs text-gray-300 tabular-nums">{fmt(summary?.technicals?.atr14 ?? null)}</span>
                </div>
                {summary?.technicals?.macd && (() => {
                  const { macd: m, signal, histogram } = summary.technicals!.macd!;
                  const bullish = (histogram ?? 0) >= 0;
                  return (
                    <div className="flex justify-between items-center py-1 border-b border-gray-800">
                      <span className="text-xs text-gray-500">MACD (12,26,9)</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 tabular-nums">{fmt(m, 3)} / {fmt(signal, 3)}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${bullish ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                          {bullish ? 'Bullish' : 'Bearish'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                {summary?.technicals?.bollingerBands && (() => {
                  const { upper, middle, lower } = summary.technicals!.bollingerBands!;
                  return (
                    <div className="flex justify-between items-center py-1 border-b border-gray-800">
                      <span className="text-xs text-gray-500">BB (20,2)</span>
                      <span className="text-xs text-gray-400 tabular-nums">{fmt(upper)} / {fmt(middle)} / {fmt(lower)}</span>
                    </div>
                  );
                })()}
                {summary?.technicals?.stochastic && (() => {
                  const { k, d } = summary.technicals!.stochastic!;
                  const label = k > 80 ? 'Overbought' : k < 20 ? 'Oversold' : 'Neutral';
                  const color = k > 80 ? 'text-red-400 bg-red-400/10' : k < 20 ? 'text-green-400 bg-green-400/10' : 'text-gray-400 bg-gray-700/40';
                  return (
                    <div className="flex justify-between items-center py-1 border-b border-gray-800">
                      <span className="text-xs text-gray-500">Stochastic (14,3)</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 tabular-nums">%K {k.toFixed(1)} / %D {d.toFixed(1)}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>{label}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === 'news' && (
            news.length === 0
              ? <p className="text-sm text-gray-600">No recent news available.</p>
              : <div className="flex flex-col divide-y divide-gray-800">
                  {news.map((item, i) => (
                    <a
                      key={i}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-1 py-3 group"
                    >
                      <p className="text-sm text-gray-200 group-hover:text-white line-clamp-2 leading-snug">{item.headline}</p>
                      <p className="text-xs text-gray-500">{item.source} · {fmtDate(item.datetime)} {new Date(item.datetime * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                    </a>
                  ))}
                </div>
          )}
        </div>
      </div>
    </div>
  );
}
