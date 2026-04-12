import { useSearchParams, useNavigate } from 'react-router-dom';
import { TrendingUp, BarChart2, Activity, Plus } from 'lucide-react';

interface Result {
  ticker: string;
  name: string;
  exchange: string;
  type: 'Stock' | 'ETF' | 'Index';
}

// Placeholder results — will be replaced by yahoo-finance2 search API
function getMockResults(q: string): Result[] {
  const all: Result[] = [
    { ticker: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ', type: 'Stock' },
    { ticker: 'AMZN', name: 'Amazon.com Inc', exchange: 'NASDAQ', type: 'Stock' },
    { ticker: 'MSFT', name: 'Microsoft Corp', exchange: 'NASDAQ', type: 'Stock' },
    { ticker: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ', type: 'ETF' },
    { ticker: 'SPY', name: 'SPDR S&P 500 ETF', exchange: 'NYSE', type: 'ETF' },
    { ticker: 'XLK', name: 'Technology Select SPDR', exchange: 'NYSE', type: 'ETF' },
    { ticker: 'SPX', name: 'S&P 500 Index', exchange: 'INDEX', type: 'Index' },
    { ticker: 'NDX', name: 'Nasdaq-100 Index', exchange: 'INDEX', type: 'Index' },
  ];
  const lower = q.toLowerCase();
  return all.filter(
    (r) => r.ticker.toLowerCase().includes(lower) || r.name.toLowerCase().includes(lower)
  );
}

const TYPE_ICON = {
  Stock: TrendingUp,
  ETF: BarChart2,
  Index: Activity,
};

const TYPE_COLOR = {
  Stock: 'text-blue-400',
  ETF: 'text-purple-400',
  Index: 'text-yellow-400',
};

function ResultRow({ result }: { result: Result }) {
  const navigate = useNavigate();
  const Icon = TYPE_ICON[result.type];
  return (
    <button
      onClick={() => navigate(`/stock/${result.ticker}`)}
      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-800 transition-colors group text-left"
    >
      <Icon size={15} className={TYPE_COLOR[result.type]} />
      <span className="w-16 font-semibold text-gray-100 group-hover:text-white">{result.ticker}</span>
      <span className="flex-1 text-sm text-gray-400">{result.name}</span>
      <span className="text-xs text-gray-600">{result.exchange}</span>
      <span className={`text-xs font-medium ${TYPE_COLOR[result.type]}`}>{result.type}</span>
      <button
        onClick={(e) => { e.stopPropagation(); /* TODO: add to watchlist */ }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-all"
        aria-label={`Add ${result.ticker} to watchlist`}
      >
        <Plus size={13} />
      </button>
    </button>
  );
}

export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const results = getMockResults(query);

  const stocks = results.filter((r) => r.type === 'Stock');
  const etfs = results.filter((r) => r.type === 'ETF');
  const indices = results.filter((r) => r.type === 'Index');

  function Section({ title, items }: { title: string; items: Result[] }) {
    if (items.length === 0) return null;
    return (
      <div className="mb-2">
        <div className="px-4 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-900/50">
          {title}
        </div>
        {items.map((r) => <ResultRow key={r.ticker} result={r} />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-sm text-gray-400 mb-4">
        Results for <span className="text-gray-100 font-medium">"{query}"</span>
        <span className="ml-2 text-gray-600">({results.length})</span>
      </h2>

      {results.length === 0 ? (
        <div className="text-sm text-gray-500">No results found.</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden divide-y divide-gray-800">
          <Section title="Stocks" items={stocks} />
          <Section title="ETFs" items={etfs} />
          <Section title="Indices" items={indices} />
        </div>
      )}
    </div>
  );
}
