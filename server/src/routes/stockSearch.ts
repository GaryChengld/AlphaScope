import { Router } from 'express';
import { yf } from '../lib/yf';

export const stockSearchRouter = Router();

const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY']);

// GET /api/stocks/search?q=:query
stockSearchRouter.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.json([]);
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (yf.search as any)(q, {}, { validateResult: false }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = ((result.quotes ?? []) as any[])
      .filter((r) => ALLOWED_TYPES.has(r.quoteType ?? ''))
      .slice(0, 20)
      .map((r) => ({
        symbol: r.symbol as string,
        name: (r.shortname ?? r.longname ?? r.symbol) as string,
        type: r.quoteType as string,
        exchange: (r.exchange ?? null) as string | null,
      }));
    res.json(quotes);
  } catch {
    res.status(502).json({ error: 'search failed' });
  }
});
