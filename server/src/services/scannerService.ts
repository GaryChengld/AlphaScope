import { prisma } from '../lib/prisma';
import { getIo } from '../socket/index';
import { listStrategies, runStrategy, toMarkdown } from './strategy/strategyService';
import type { ScanCache } from './strategy/strategyContext';
import { yf } from '../lib/yf';

export interface ScanSummary {
  created: number;
  skipped: number;
  errors:  number;
}

let _scanning = false;

export function isScanRunning(): boolean {
  return _scanning;
}

// Fire-and-forget: returns false immediately if a scan is already in progress.
export function triggerScan(): boolean {
  if (_scanning) return false;
  _scanning = true;
  getIo().emit('scanner:started');
  runScan()
    .then(summary => {
      console.log('[scanner] scan complete:', summary);
      getIo().emit('scanner:complete', summary);
    })
    .catch(err => {
      console.error('[scanner] scan error:', err);
      getIo().emit('scanner:complete', { created: 0, skipped: 0, errors: 1 });
    })
    .finally(() => { _scanning = false; });
  return true;
}

async function filterScannable(raw: string[]): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = await (yf.quote as any)(raw) as any[];
    const arr: any[] = Array.isArray(quotes) ? quotes : [quotes];
    const indexSymbols = new Set(
      arr.filter(q => q.quoteType === 'INDEX').map(q => q.symbol as string),
    );
    return raw.filter(t => !indexSymbols.has(t));
  } catch {
    // If the batch quote fails, fall back to the ^ prefix heuristic only
    return raw;
  }
}

async function runScan(): Promise<ScanSummary> {
  // Each scan starts from a clean slate — wipe all prior notifications
  // (NotificationTicker rows cascade-delete) so the panel only ever shows the
  // most recent run's results.
  await prisma.notification.deleteMany();

  const rows       = await prisma.stock.findMany({ select: { ticker: true } });
  const rawTickers = [...new Set(rows.map(r => r.ticker))].filter(t => !t.startsWith('^'));
  const tickers    = await filterScannable(rawTickers);
  const strategies = listStrategies();
  const date       = new Date().toISOString().slice(0, 10);

  const scanCache: ScanCache = new Map();
  let created = 0, skipped = 0, errors = 0;

  for (const strategy of strategies) {
    // Tickers already recorded in any previous scan run for this strategy today
    const priorRows = await prisma.notificationTicker.findMany({
      where: { notification: { strategyId: strategy.id, date } },
      select: { ticker: true },
    });
    const seenToday = new Set(priorRows.map(r => r.ticker));

    // Evaluate every ticker and collect new passes for this scan run
    const newPasses: { ticker: string; score: number; markdown: string }[] = [];

    for (const ticker of tickers) {
      try {
        const result = await runStrategy(ticker, strategy.id, scanCache);
        if (!result.mandatoryPass) continue;
        if (seenToday.has(ticker)) { skipped++; continue; }
        newPasses.push({ ticker, score: result.totalScore, markdown: toMarkdown(result) });
      } catch {
        errors++;
      }
      await new Promise(r => setTimeout(r, 800));
    }

    // Skip creating a notification if nothing new qualified
    if (newPasses.length === 0) continue;

    const notification = await prisma.notification.create({
      data: {
        strategyId:   strategy.id,
        strategyName: strategy.name,
        date,
        tickers: { create: newPasses },
      },
      include: { tickers: { orderBy: { score: 'desc' } } },
    });

    created += newPasses.length;
    getIo().emit('notification:update', notification);
  }

  return { created, skipped, errors };
}
