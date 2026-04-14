import { Router, Request, Response } from 'express';
import {
  getStocksWithPrices, addStock, removeStock, reorderStocks,
} from '../services/watchlistService';

export const watchlistStocksRouter = Router({ mergeParams: true });

type Params = { id: string };

watchlistStocksRouter.get('/', async (req: Request<Params>, res: Response) => {
  res.json(await getStocksWithPrices(Number(req.params.id)));
});

watchlistStocksRouter.post('/', async (req: Request<Params>, res: Response) => {
  const { ticker, exchange } = req.body as { ticker: string; exchange?: string };
  if (!ticker?.trim()) { res.status(400).json({ error: 'ticker is required' }); return; }
  res.status(201).json(await addStock(Number(req.params.id), ticker, exchange));
});

watchlistStocksRouter.patch('/reorder', async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids)) { res.status(400).json({ error: 'ids must be an array' }); return; }
  await reorderStocks(ids);
  res.json({ ok: true });
});

watchlistStocksRouter.delete('/:ticker', async (req: Request<Params & { ticker: string }>, res: Response) => {
  await removeStock(Number(req.params.id), req.params.ticker);
  res.json({ ok: true });
});
