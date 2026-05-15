import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Trash2, Plus } from 'lucide-react';

interface AiAnalysisSummary {
  id: number;
  ticker: string;
  timestamp: string;
  llmProvider: string;
}

interface AiAnalysisFull extends AiAnalysisSummary {
  content: string;
}

function AddAnalysisModal({
  ticker,
  onClose,
  onSaved,
}: {
  ticker: string;
  onClose: () => void;
  onSaved: (record: AiAnalysisFull) => void;
}) {
  const [llmProvider, setLlmProvider] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!llmProvider.trim() || !content.trim()) {
      setError('Both LLM Provider and content are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/stocks/${encodeURIComponent(ticker)}/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llmProvider: llmProvider.trim(), content: content.trim() }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const record: AiAnalysisFull = await r.json();
      onSaved(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-gray-200">Add AI Analysis — {ticker}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs text-gray-500 mb-1">LLM Provider</label>
            <input
              type="text"
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
              placeholder="e.g. GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1 flex flex-col">
            <label className="block text-xs text-gray-500 mb-1">Analysis Content (Markdown)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste or type the AI analysis here..."
              rows={14}
              className="w-full flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none font-mono"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function fmtTimestamp(ts: string): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  );
}

export default function AiAnalysisTab({ ticker }: { ticker: string }) {
  const [records, setRecords] = useState<AiAnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AiAnalysisFull | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const contentPaneRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef(ticker);
  useEffect(() => { tickerRef.current = ticker; }, [ticker]);

  useEffect(() => {
    if (contentPaneRef.current) contentPaneRef.current.scrollTop = 0;
    setLoading(true);
    setRecords([]);
    setSelectedId(null);
    setSelectedRecord(null);
    fetch(`/api/stocks/${encodeURIComponent(ticker)}/ai-analysis`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AiAnalysisSummary[]) => {
        setRecords(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticker]);

  useEffect(() => {
    if (contentPaneRef.current) contentPaneRef.current.scrollTop = 0;
    if (selectedId == null) {
      setSelectedRecord(null);
      return;
    }
    setContentLoading(true);
    fetch(`/api/stocks/${encodeURIComponent(tickerRef.current)}/ai-analysis/${selectedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AiAnalysisFull | null) => { if (data) setSelectedRecord(data); })
      .catch(() => {})
      .finally(() => setContentLoading(false));
  }, [selectedId]); // ticker intentionally omitted — ticker effect resets selectedId first

  const handleDelete = async (id: number) => {
    await fetch(`/api/stocks/${encodeURIComponent(ticker)}/ai-analysis/${id}`, {
      method: 'DELETE',
    });
    const next = records.filter((r) => r.id !== id);
    setRecords(next);
    if (selectedId === id) {
      setSelectedId(next.length > 0 ? next[0].id : null);
      setSelectedRecord(null);
    }
  };

  const handleSaved = (record: AiAnalysisFull) => {
    setShowModal(false);
    const summary: AiAnalysisSummary = {
      id: record.id,
      ticker: record.ticker,
      timestamp: record.timestamp,
      llmProvider: record.llmProvider,
    };
    setRecords((prev) => [summary, ...prev]);
    setSelectedId(record.id);
    setSelectedRecord(record);
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Left: analysis list */}
      <div className="w-64 shrink-0 border-r border-gray-800 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800 shrink-0">
          <span className="text-xs text-gray-500 uppercase tracking-wider">AI Analyses</span>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
          >
            <Plus size={12} />
            Add
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          )}

          {!loading && records.length === 0 && (
            <p className="text-xs text-gray-600 p-3">
              No AI analyses yet. Click Add to create one.
            </p>
          )}

          {!loading &&
            records.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`flex items-start justify-between gap-1 px-3 py-2.5 cursor-pointer border-b border-gray-800 group ${
                  selectedId === r.id ? 'bg-blue-500/10' : 'hover:bg-gray-800/60'
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-xs font-medium truncate ${
                      selectedId === r.id ? 'text-blue-400' : 'text-gray-300'
                    }`}
                  >
                    {r.llmProvider}
                  </span>
                  <span className="text-[10px] text-gray-600 mt-0.5">
                    {fmtTimestamp(r.timestamp)}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(r.id);
                  }}
                  className="shrink-0 text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 mt-0.5"
                  aria-label="Delete analysis"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* Right: content pane */}
      <div ref={contentPaneRef} className="flex-1 min-w-0 overflow-y-auto px-5 py-4">
        {!loading && selectedId == null && (
          <p className="text-sm text-gray-500">
            {records.length === 0
              ? 'No analyses yet. Click Add to create one.'
              : 'Select an analysis from the list.'}
          </p>
        )}

        {contentLoading && (
          <div className="space-y-2">
            <div className="h-5 w-1/3 bg-gray-800 rounded animate-pulse" />
            <div className="h-4 w-full bg-gray-800 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-gray-800 rounded animate-pulse" />
            <div className="h-4 w-4/6 bg-gray-800 rounded animate-pulse" />
          </div>
        )}

        {selectedRecord && !contentLoading && (
          <div>
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-800">
              <span className="text-sm font-medium text-gray-300">{selectedRecord.llmProvider}</span>
              <span className="text-xs text-gray-600">{fmtTimestamp(selectedRecord.timestamp)}</span>
            </div>
            <div className="prose prose-invert max-w-none prose-h1:text-lg prose-h1:text-blue-400 prose-h1:mt-0 prose-h1:mb-1 prose-h2:text-base prose-h2:mt-4 prose-h2:mb-2 prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedRecord.content}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <AddAnalysisModal
          ticker={ticker}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
