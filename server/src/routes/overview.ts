import { Router, Request, Response } from 'express';
import { getMarketIndicators, getSectorPrices } from '../services/overviewService';

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
