import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BrainCircuit, X, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';

interface NotificationTicker {
  id: number;
  ticker: string;
  score: number;
  markdown: string;
  addedAt: string;
}

interface Notification {
  id: number;
  strategyId: string;
  strategyName: string;
  date: string;
  read: boolean;
  createdAt: string;
  tickers: NotificationTicker[];
}

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkRead: (id: number) => void;
  onDelete: (id: number) => void;
  scanRunning: boolean;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RightPanel({ open, onClose, notifications, onMarkRead, onDelete, scanRunning }: RightPanelProps) {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const toggleExpand = (id: number) =>
    setExpandedId(prev => (prev === id ? null : id));

  const handleRunScan = () => {
    fetch('/api/scanner/run', { method: 'POST' }).catch(() => {});
  };

  return (
    <aside
      className={`shrink-0 flex flex-col border-l border-gray-800 bg-gray-950 transition-all duration-200 overflow-hidden
        ${open ? 'w-[360px]' : 'w-0'}`}
    >
      {open && (
        <>
          {/* Notifications section header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <Bell size={12} />
              Notifications
              {unreadCount > 0 && (
                <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {scanRunning ? (
                <span className="text-[10px] text-yellow-400 animate-pulse">
                  Scanning in progress…
                </span>
              ) : (
                <button
                  onClick={handleRunScan}
                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Run Scan
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-gray-800 text-gray-600 hover:text-gray-300 transition-colors"
                aria-label="Close panel"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Notification cards */}
          <div className="overflow-y-auto flex-none max-h-[55%] px-2 pb-2 space-y-1.5">
            {notifications.length === 0 ? (
              <p className="text-xs text-gray-600 px-2 py-3">
                No notifications — click "Run Scan" to find setups
              </p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-2 py-2 rounded border ${
                    n.read ? 'border-gray-800 bg-gray-950' : 'border-blue-900 bg-gray-900'
                  }`}
                >
                  {/* Card header — click to expand/collapse */}
                  <button
                    onClick={() => toggleExpand(n.id)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-1.5">
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      )}
                      <span className={`text-xs font-semibold ${n.read ? 'text-gray-400' : 'text-gray-200'}`}>
                        {n.strategyName}
                      </span>
                      <span className="text-[10px] text-gray-600">({n.tickers.length})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-600">{relativeTime(n.createdAt)}</span>
                      <button
                        onClick={e => { e.stopPropagation(); onDelete(n.id); }}
                        className="p-0.5 rounded text-gray-700 hover:text-red-400 hover:bg-gray-800 transition-colors"
                        aria-label="Delete notification"
                      >
                        <Trash2 size={11} />
                      </button>
                      {expandedId === n.id
                        ? <ChevronDown size={11} className="text-gray-500" />
                        : <ChevronRight size={11} className="text-gray-500" />
                      }
                    </div>
                  </button>

                  {/* Ticker list — only shown when expanded */}
                  {expandedId === n.id && (
                    <div className="mt-1.5 space-y-0.5">
                      {n.tickers.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            onMarkRead(n.id);
                            navigate(`/stock/${t.ticker}`, {
                              state: {
                                ticker: t.ticker,
                                notificationMarkdown: t.markdown,
                                strategyId: n.strategyId,
                              },
                            });
                          }}
                          className="w-full flex items-center justify-between text-left hover:bg-gray-800 rounded px-1 py-0.5 group"
                        >
                          <span className="text-sm font-semibold text-blue-400 group-hover:text-blue-300">
                            {t.ticker}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">{t.score} pts</span>
                            <ChevronRight size={11} className="text-gray-700 group-hover:text-gray-400" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mx-3 border-t border-gray-800" />

          {/* AI Analysis section (placeholder) */}
          <div className="px-3 pt-3 pb-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <BrainCircuit size={12} />
              AI Analysis
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3">
            <p className="text-xs text-gray-600 px-2 py-3">No analysis yet</p>
          </div>
        </>
      )}
    </aside>
  );
}
