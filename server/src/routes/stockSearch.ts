import { Router } from 'express';
import { searchStocks } from '../services/stockSearchService';

export const stockSearchRouter = Router();

stockSearchRouter.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) { res.json([]); return; }

  try {
    const results = await searchStocks(q);
    res.json(results);
  } catch {
    res.status(502).json({ error: 'search failed' });
  }
});
