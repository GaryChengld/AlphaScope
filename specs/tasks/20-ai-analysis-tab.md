# Task 20 — AI Analysis Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent "AI" tab to the Stock Detail page where users can manually store and review AI-generated analysis records for stocks and ETFs.

**Architecture:** New `AiAnalysis` Prisma model stores records (ticker, timestamp, LLM provider, markdown content). A dedicated service and route layer exposes CRUD endpoints under `/api/stocks/:ticker/ai-analysis`. The frontend tab is a split-pane: left lists records (metadata only, newest first), right renders the selected record's markdown.

**Tech Stack:** Prisma (SQLite), Express Router, React 18, Tailwind CSS, ReactMarkdown + remark-gfm, Lucide Icons

---

## Scope

- **Backend:** 1 Prisma model, 1 new service, 1 new route file, 1 modified file (`server/src/index.ts`)
- **Frontend:** 1 new component (`AiAnalysisTab.tsx`), 1 modified file (`StockDetail.tsx`)
- **Tab visibility:** EQUITY and ETF only (same condition as the Strategy tab)

---

## Data Model

```
AiAnalysis
  id          Int      PK autoincrement
  ticker      String   uppercase (e.g. "AAPL")
  timestamp   DateTime default now()
  llmProvider String   (e.g. "GPT-4o", "Claude 3.5 Sonnet")
  content     String   full markdown text
```

---

## File Map

| Action   | Path |
|----------|------|
| Modify   | `server/prisma/schema.prisma` |
| Create   | `server/src/services/aiAnalysisService.ts` |
| Create   | `server/src/routes/aiAnalysisRoutes.ts` |
| Modify   | `server/src/index.ts` |
| Create   | `client/src/components/AiAnalysisTab.tsx` |
| Modify   | `client/src/pages/StockDetail.tsx` |

---

## Task 1: Add AiAnalysis Prisma Model and Migrate

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add the model to the schema**

Append to `server/prisma/schema.prisma` (after the `NotificationTicker` model):

```prisma
model AiAnalysis {
  id          Int      @id @default(autoincrement())
  ticker      String
  timestamp   DateTime @default(now())
  llmProvider String
  content     String

  @@index([ticker])
}
```

- [ ] **Step 2: Run the migration**

```bash
cd server && npx prisma migrate dev --name add-ai-analysis
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify Prisma client is regenerated**

```bash
cd server && npx prisma generate
```

Expected output: `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat: add AiAnalysis model to Prisma schema"
```

---

## Task 2: Create aiAnalysisService

**Files:**
- Create: `server/src/services/aiAnalysisService.ts`

- [ ] **Step 1: Create the service file**

Create `server/src/services/aiAnalysisService.ts`:

```typescript
import prisma from '../lib/prisma';

export interface AiAnalysisSummary {
  id: number;
  ticker: string;
  timestamp: Date;
  llmProvider: string;
}

export interface AiAnalysisFull extends AiAnalysisSummary {
  content: string;
}

export async function listAiAnalyses(ticker: string): Promise<AiAnalysisSummary[]> {
  return prisma.aiAnalysis.findMany({
    where: { ticker: ticker.toUpperCase() },
    select: { id: true, ticker: true, timestamp: true, llmProvider: true },
    orderBy: { timestamp: 'desc' },
  });
}

export async function getAiAnalysis(id: number): Promise<AiAnalysisFull | null> {
  return prisma.aiAnalysis.findUnique({ where: { id } });
}

export async function createAiAnalysis(
  ticker: string,
  llmProvider: string,
  content: string,
): Promise<AiAnalysisFull> {
  return prisma.aiAnalysis.create({
    data: {
      ticker: ticker.toUpperCase(),
      llmProvider,
      content,
    },
  });
}

export async function deleteAiAnalysis(id: number): Promise<void> {
  await prisma.aiAnalysis.delete({ where: { id } });
}
```

- [ ] **Step 2: Build the server to check for TypeScript errors**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/aiAnalysisService.ts
git commit -m "feat: add aiAnalysisService with CRUD operations"
```

---

## Task 3: Create aiAnalysisRoutes

**Files:**
- Create: `server/src/routes/aiAnalysisRoutes.ts`

- [ ] **Step 1: Create the route file**

Create `server/src/routes/aiAnalysisRoutes.ts`:

```typescript
import { Router } from 'express';
import {
  listAiAnalyses,
  getAiAnalysis,
  createAiAnalysis,
  deleteAiAnalysis,
} from '../services/aiAnalysisService';

export const aiAnalysisRouter = Router();

aiAnalysisRouter.get('/:ticker/ai-analysis', async (req, res) => {
  try {
    const records = await listAiAnalyses(req.params.ticker);
    res.json(records);
  } catch (err) {
    console.error('[aiAnalysis] list error', err);
    res.status(502).json({ error: 'failed to list AI analyses' });
  }
});

aiAnalysisRouter.get('/:ticker/ai-analysis/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  try {
    const record = await getAiAnalysis(id);
    if (!record) { res.status(404).json({ error: 'not found' }); return; }
    res.json(record);
  } catch (err) {
    console.error('[aiAnalysis] get error', err);
    res.status(502).json({ error: 'failed to get AI analysis' });
  }
});

aiAnalysisRouter.post('/:ticker/ai-analysis', async (req, res) => {
  const { llmProvider, content } = req.body as { llmProvider?: unknown; content?: unknown };
  if (!llmProvider || typeof llmProvider !== 'string' || !llmProvider.trim()) {
    res.status(400).json({ error: 'llmProvider is required' });
    return;
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  try {
    const record = await createAiAnalysis(
      req.params.ticker,
      llmProvider.trim(),
      content.trim(),
    );
    res.status(201).json(record);
  } catch (err) {
    console.error('[aiAnalysis] create error', err);
    res.status(502).json({ error: 'failed to create AI analysis' });
  }
});

aiAnalysisRouter.delete('/:ticker/ai-analysis/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  try {
    await deleteAiAnalysis(id);
    res.status(204).end();
  } catch (err) {
    console.error('[aiAnalysis] delete error', err);
    res.status(502).json({ error: 'failed to delete AI analysis' });
  }
});
```

- [ ] **Step 2: Build the server to check for TypeScript errors**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/aiAnalysisRoutes.ts
git commit -m "feat: add AI analysis REST routes"
```

---

## Task 4: Register Routes in Server Entry Point

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add the import and router registration**

In `server/src/index.ts`, add the import after the existing route imports:

```typescript
import { aiAnalysisRouter } from './routes/aiAnalysisRoutes';
```

Then add the `app.use` line after the existing `/api/notifications` registration:

```typescript
app.use('/api/stocks', aiAnalysisRouter);
```

The relevant section of `index.ts` after the edit (lines 9–30 area) should look like:

```typescript
import { stockDetailRouter } from './routes/stockDetail';
import { overviewRouter } from './routes/overview';
import { strategyRouter } from './routes/strategyRoutes';
import { scannerRouter, notificationRouter } from './routes/scannerRoutes';
import { aiAnalysisRouter } from './routes/aiAnalysisRoutes';
import { initScheduler } from './services/scannerScheduler';

// ...

app.use('/api/stocks', stockSearchRouter);
app.use('/api/stocks', stockDetailRouter);
app.use('/api/stocks', aiAnalysisRouter);
app.use('/api/overview', overviewRouter);
app.use('/api/strategies',     strategyRouter);
app.use('/api/scanner',        scannerRouter);
app.use('/api/notifications',  notificationRouter);
```

- [ ] **Step 2: Build the server to check for TypeScript errors**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: register AI analysis routes on /api/stocks"
```

---

## Task 5: Create AiAnalysisTab Component

**Files:**
- Create: `client/src/components/AiAnalysisTab.tsx`

- [ ] **Step 1: Create the component file**

Create `client/src/components/AiAnalysisTab.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
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
    if (selectedId == null) {
      setSelectedRecord(null);
      return;
    }
    setContentLoading(true);
    fetch(`/api/stocks/${encodeURIComponent(ticker)}/ai-analysis/${selectedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AiAnalysisFull | null) => { if (data) setSelectedRecord(data); })
      .catch(() => {})
      .finally(() => setContentLoading(false));
  }, [selectedId, ticker]);

  const handleDelete = async (id: number) => {
    await fetch(`/api/stocks/${encodeURIComponent(ticker)}/ai-analysis/${id}`, {
      method: 'DELETE',
    });
    const next = records.filter((r) => r.id !== id);
    setRecords(next);
    if (selectedId === id) {
      const nextId = next.length > 0 ? next[0].id : null;
      setSelectedId(nextId);
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
    <div className="flex h-full min-h-0">
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
      <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4">
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
            <div className="prose prose-invert prose-sm max-w-none prose-h1:text-base prose-h1:text-blue-400 prose-h1:mt-0 prose-h1:mb-1 prose-h2:text-sm prose-h2:mt-4 prose-h2:mb-2 prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1">
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
```

- [ ] **Step 2: Verify TypeScript types in the client**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AiAnalysisTab.tsx
git commit -m "feat: add AiAnalysisTab split-pane component with add/delete modal"
```

---

## Task 6: Integrate AI Tab into StockDetail

**Files:**
- Modify: `client/src/pages/StockDetail.tsx`

The AI tab needs a full-height split-pane container (like the chart tab), so it gets its own sibling `div` rather than living inside the shared scrollable panel.

- [ ] **Step 1: Add the AiAnalysisTab import**

At the top of `client/src/pages/StockDetail.tsx`, add after the existing component imports (around line 7):

```tsx
import AiAnalysisTab from '../components/AiAnalysisTab';
```

- [ ] **Step 2: Extend the tab type union**

On line 408, change:

```tsx
const [tab, setTab] = useState<'chart' | 'fundamentals' | 'technicals' | 'analysis' | 'strategy' | 'news'>('chart');
```

to:

```tsx
const [tab, setTab] = useState<'chart' | 'fundamentals' | 'technicals' | 'analysis' | 'strategy' | 'ai' | 'news'>('chart');
```

- [ ] **Step 3: Add 'ai' to visibleTabs and the activeTab fallback**

On line 463, change:

```tsx
const visibleTabs = (['chart', 'fundamentals', 'technicals', 'analysis', 'strategy', 'news'] as const).filter((t) => {
  if (t === 'strategy') return strategyEligible;
  if (t === 'fundamentals' || t === 'analysis') return isStock;
  return true;
});
```

to:

```tsx
const visibleTabs = (['chart', 'fundamentals', 'technicals', 'analysis', 'strategy', 'ai', 'news'] as const).filter((t) => {
  if (t === 'strategy' || t === 'ai') return strategyEligible;
  if (t === 'fundamentals' || t === 'analysis') return isStock;
  return true;
});
```

On lines 468–472, change:

```tsx
const activeTab = (() => {
  if ((tab === 'fundamentals' || tab === 'analysis') && !isStock) return 'technicals';
  if (tab === 'strategy' && !strategyEligible) return 'technicals';
  return tab;
})();
```

to:

```tsx
const activeTab = (() => {
  if ((tab === 'fundamentals' || tab === 'analysis') && !isStock) return 'technicals';
  if ((tab === 'strategy' || tab === 'ai') && !strategyEligible) return 'technicals';
  return tab;
})();
```

- [ ] **Step 4: Add the AI tab full-height container**

After the closing `</div>` of the chart tab container (around line 651, the one that closes `<div className={`flex flex-1 min-h-0 ${activeTab === 'chart' ? '' : 'hidden'}`}>`), add a new sibling div for the AI tab:

```tsx
{/* AI tab — full-height split pane */}
<div className={`flex flex-1 min-h-0 ${activeTab === 'ai' ? '' : 'hidden'}`}>
  <AiAnalysisTab ticker={ticker} />
</div>
```

- [ ] **Step 5: Update the shared scrollable panel's hidden condition**

The shared panel (around line 654) currently hides when `activeTab === 'chart'`. Change it to also hide when `activeTab === 'ai'`:

```tsx
<div className={`px-5 py-4 overflow-y-auto flex-1 ${activeTab === 'chart' || activeTab === 'ai' ? 'hidden' : ''}`}>
```

- [ ] **Step 6: Verify TypeScript types in the client**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/StockDetail.tsx
git commit -m "feat: add AI tab to StockDetail for stocks and ETFs"
```

---

## Verification Checklist

After all tasks are done, manually verify the following flows with both the dev server running (`npm run dev` from repo root or individual `server` + `client` workspaces):

- [ ] Navigate to a stock (EQUITY) — "ai" tab is visible in the tab bar
- [ ] Navigate to an ETF — "ai" tab is visible
- [ ] Navigate to an index (^SPX) — "ai" tab is NOT visible
- [ ] On the AI tab with no records: left panel shows "No AI analyses yet" message
- [ ] Click "Add": modal opens with LLM Provider field and Content textarea
- [ ] Submit with empty fields: validation error shown, no network request made
- [ ] Submit valid data: record appears at top of left list, right pane shows its markdown
- [ ] Click a different record in the list: right pane updates to show that record's content
- [ ] Hover a list item: trash icon appears; click it — record is deleted and list updates
- [ ] Deleting the selected record: next record is auto-selected (or empty state shown)
- [ ] Add a second record: it appears at top (newest first)
- [ ] Reload page and navigate back to the stock — previously saved records persist
