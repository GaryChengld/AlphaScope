import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const STRATEGIES = [
  { name: 'RSI Oversold', status: 'Running', lastRun: '2 min ago', hits: 3 },
  { name: 'SMA Breakout', status: 'Running', lastRun: '2 min ago', hits: 1 },
];

const RECENT_HITS = [
  { ticker: 'AAPL', strategy: 'RSI Oversold', time: '10:32 AM' },
  { ticker: 'TSLA', strategy: 'SMA Breakout', time: '10:28 AM' },
  { ticker: 'NVDA', strategy: 'RSI Oversold', time: '10:21 AM' },
];

export default function Scanner() {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Active strategies */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Active Strategies
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
          {STRATEGIES.map((s) => (
            <div key={s.name} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                  <span className="text-sm font-medium text-gray-100">{s.name}</span>
                  <span className="text-xs text-gray-600">{s.status}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 ml-4">
                  Last run: {s.lastRun} · {s.hits} hit{s.hits !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent hits */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Recent Hits
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
          {RECENT_HITS.map((h, i) => (
            <button
              key={i}
              onClick={() => navigate(`/stock/${h.ticker}`)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800 transition-colors group text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-100">{h.ticker}</span>
                <span className="text-xs text-gray-500">{h.strategy}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">{h.time}</span>
                <ChevronRight size={13} className="text-gray-700 group-hover:text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
