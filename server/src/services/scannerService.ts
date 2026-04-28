import { prisma } from '../lib/prisma';
import { getIo } from '../socket/index';
import { listStrategies, runStrategy, toMarkdown } from './strategy/strategyService';

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
  runScan()
    .then(summary => console.log('[scanner] scan complete:', summary))
    .catch(err    => console.error('[scanner] scan error:', err))
    .finally(()   => { _scanning = false; });
  return true;
}

async function runScan(): Promise<ScanSummary> {
  const rows      = await prisma.stock.findMany({ select: { ticker: true } });
  const tickers   = [...new Set(rows.map(r => r.ticker))].filter(t => !t.startsWith('^'));
  const strategies = listStrategies();
  const date      = new Date().toISOString().slice(0, 10);

  let created = 0, skipped = 0, errors = 0;

  for (const strategy of strategies) {
    for (const ticker of tickers) {
      try {
        const result = await runStrategy(ticker, strategy.id);
        if (!result.mandatoryPass) continue;

        let notification = await prisma.notification.findUnique({
          where: { strategyId_date: { strategyId: strategy.id, date } },
        });
        if (!notification) {
          notification = await prisma.notification.create({
            data: { strategyId: strategy.id, strategyName: strategy.name, date },
          });
        }

        const existing = await prisma.notificationTicker.findUnique({
          where: { notificationId_ticker: { notificationId: notification.id, ticker } },
        });
        if (existing) { skipped++; continue; }

        const markdown = toMarkdown(result);
        await prisma.notificationTicker.create({
          data: { notificationId: notification.id, ticker, score: result.totalScore, markdown },
        });
        created++;

        const full = await prisma.notification.findUnique({
          where: { id: notification.id },
          include: { tickers: { orderBy: { score: 'desc' } } },
        });
        getIo().emit('notification:update', full);
      } catch {
        errors++;
      }
    }
  }

  return { created, skipped, errors };
}
