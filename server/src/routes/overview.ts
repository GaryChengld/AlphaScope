import { Router, Request, Response } from 'express';
import { getMarketIndicators, getSectorPrices } from '../services/overviewService';
import { getEconomicEvents, getEarningsForWeek } from '../services/calendarService';

export const overviewRouter = Router();

overviewRouter.get('/markets', async (_req: Request, res: Response) => {
  try {
    const data = await getMarketIndicators();
    res.json(data);
  } catch (err) {
    console.error('[overview] /markets error:', err);
    res.status(502).json({ error: 'Failed to fetch market indicators' });
  }
});

overviewRouter.get('/sectors', async (_req: Request, res: Response) => {
  try {
    const data = await getSectorPrices();
    res.json(data);
  } catch (err) {
    console.error('[overview] /sectors error:', err);
    res.status(502).json({ error: 'Failed to fetch sector prices' });
  }
});

overviewRouter.get('/economic', async (req: Request, res: Response) => {
  const from = String(req.query.from ?? '');
  const to   = String(req.query.to   ?? '');
  try {
    res.json(await getEconomicEvents(from, to));
  } catch (err) {
    console.error('[overview] economic error', err);
    res.status(502).json({ error: 'failed to fetch economic events' });
  }
});

overviewRouter.get('/earnings', async (req: Request, res: Response) => {
  const from = String(req.query.from ?? '');
  const to   = String(req.query.to   ?? '');
  try {
    res.json(await getEarningsForWeek(from, to));
  } catch (err) {
    console.error('[overview] earnings error', err);
    res.status(502).json({ error: 'failed to fetch earnings' });
  }
});
