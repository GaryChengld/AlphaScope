import { useNavigate } from 'react-router-dom';
import { Bell, BrainCircuit, X, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Notification {
  id: string;
  ticker: string;
  strategy: string;
  time: string;
}

interface Analysis {
  id: string;
  ticker: string;
  time: string;
  content: string;
}

// Placeholder data — will be replaced by Socket.io events
const NOTIFICATIONS: Notification[] = [
  { id: '1', ticker: 'AAPL', strategy: 'RSI < 30', time: 'now' },
  { id: '2', ticker: 'TSLA', strategy: 'SMA Breakout', time: '2m' },
  { id: '3', ticker: 'NVDA', strategy: 'RSI < 30', time: '5m' },
];

const ANALYSES: Analysis[] = [
  {
    id: '1',
    ticker: 'AAPL',
    time: '10:32 AM',
    content:
      'AAPL shows **bullish divergence** on the RSI. Price made a lower low while RSI formed a higher low, suggesting weakening downside momentum. Support at **$210**.',
  },
  {
    id: '2',
    ticker: 'TSLA',
    time: '10:15 AM',
    content:
      'The breakout above the **50-day SMA** on elevated volume is constructive. Watch for a retest of the breakout level near **$245** as potential support.',
  },
];

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function RightPanel({ open, onClose }: RightPanelProps) {
  const navigate = useNavigate();

  return (
    <aside
      className={`shrink-0 flex flex-col border-l border-gray-800 bg-gray-950 transition-all duration-200 overflow-hidden
        ${open ? 'w-[360px]' : 'w-0'}`}
    >
      {open && (
        <>
          {/* Notifications section */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <Bell size={12} />
              Notifications
              {NOTIFICATIONS.length > 0 && (
                <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {NOTIFICATIONS.length}
                </span>
              )}
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-800 text-gray-600 hover:text-gray-300 transition-colors"
              aria-label="Close panel"
            >
              <X size={13} />
            </button>
          </div>

          <div className="overflow-y-auto flex-none max-h-48 px-2 pb-2">
            {NOTIFICATIONS.length === 0 ? (
              <p className="text-xs text-gray-600 px-2 py-3">No notifications</p>
            ) : (
              NOTIFICATIONS.map((n) => (
                <button
                  key={n.id}
                  onClick={() => navigate(`/stock/${n.ticker}`)}
                  className="w-full flex items-center justify-between px-2 py-2 rounded text-left hover:bg-gray-800 transition-colors group"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-100">{n.ticker}</span>
                      <span className="text-xs text-gray-500">{n.time}</span>
                    </div>
                    <span className="text-xs text-gray-400">{n.strategy}</span>
                  </div>
                  <ChevronRight size={13} className="text-gray-700 group-hover:text-gray-400" />
                </button>
              ))
            )}
          </div>

          <div className="mx-3 border-t border-gray-800" />

          {/* AI Analysis section */}
          <div className="px-3 pt-3 pb-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <BrainCircuit size={12} />
              AI Analysis
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-3">
            {ANALYSES.length === 0 ? (
              <p className="text-xs text-gray-600 px-2 py-3">No analysis yet</p>
            ) : (
              ANALYSES.map((a) => (
                <div key={a.id} className="px-2 py-2 rounded bg-gray-900 border border-gray-800">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <button
                      onClick={() => navigate(`/stock/${a.ticker}`)}
                      className="text-xs font-semibold text-blue-400 hover:text-blue-300"
                    >
                      {a.ticker}
                    </button>
                    <span className="text-xs text-gray-600">{a.time}</span>
                  </div>
                  <div className="text-xs text-gray-300 leading-relaxed prose prose-invert prose-xs max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.content}</ReactMarkdown>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Collapsed toggle tab */}
      {!open && null}
    </aside>
  );
}
