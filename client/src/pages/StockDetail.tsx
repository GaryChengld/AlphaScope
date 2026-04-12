import { useParams } from 'react-router-dom';

const PERIODS = ['1D', '5D', '1M', '3M', '1Y'] as const;

export default function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-gray-100">{ticker}</h1>
          <span className="text-2xl text-gray-100">$213.45</span>
          <span className="text-sm text-green-400">▲ +2.31 (+1.09%)</span>
        </div>
        <div className="text-sm text-gray-500 mt-0.5">Apple Inc · NASDAQ</div>
      </div>

      {/* Period selector */}
      <div className="flex gap-1">
        {PERIODS.map((p, i) => (
          <button
            key={p}
            className={`px-3 py-1 text-xs rounded font-medium transition-colors
              ${i === 0
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800 border border-transparent'
              }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart area */}
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        {/* Candlestick + VWAP */}
        <div className="flex-[3] bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-center">
          <span className="text-gray-600 text-sm">Candlestick + VWAP — lightweight-charts</span>
        </div>
        {/* Volume */}
        <div className="flex-[1] bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-center">
          <span className="text-gray-600 text-sm">Volume</span>
        </div>
        {/* RSI */}
        <div className="flex-[1] bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-center">
          <span className="text-gray-600 text-sm">RSI</span>
        </div>
      </div>
    </div>
  );
}
