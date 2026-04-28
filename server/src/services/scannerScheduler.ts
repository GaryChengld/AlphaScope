import cron from 'node-cron';
import { triggerScan } from './scannerService';
import { isMarketDay } from '../lib/marketCalendar';

const SCAN_TIMES = ['0 10 * * 1-5', '0 12 * * 1-5', '0 14 * * 1-5', '0 16 * * 1-5'];

export function initScheduler(): void {
  for (const expression of SCAN_TIMES) {
    cron.schedule(expression, () => {
      const now = new Date();
      if (!isMarketDay(now)) {
        console.log(`[scheduler] ${now.toISOString()} — not a market day, scan skipped`);
        return;
      }
      console.log(`[scheduler] ${now.toISOString()} — triggering scheduled scan`);
      if (!triggerScan()) {
        console.log('[scheduler] scan already in progress, skipped');
      }
    }, { timezone: 'America/New_York' });
  }
  console.log('[scheduler] Scanner scheduled at 10:00, 12:00, 14:00, 16:00 ET on market days');
}
