import { Router, Request, Response } from 'express';
import { yf } from '../lib/yf';
import { prisma } from '../lib/prisma';

export const watchlistStocksRouter = Router({ mergeParams: true });

type Params = { id: string };

// GET /api/watchlists/:id/stocks — fetch tickers + live prices
watchlistStocksRouter.get('/', async (req: Request<Params>, res: Response) => {
  const watchlistId = Number(req.params.id);
  const stocks = await prisma.stock.findMany({
    where: { watchlistId },
    orderBy: { position: 'asc' },
  });

  if (stocks.length === 0) {
    res.json([]);
    return;
  }

  const tickers = stocks.map((s) => s.ticker);
  const priceMap: Record<string, { price: number | null; change: number | null; changePct: number | null }> = {};

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await (yf.quote as any)(tickers) as any[];
    const arr = Array.isArray(results) ? results : [results];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const q of arr as any[]) {
      priceMap[q.symbol] = {
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePct: q.regularMarketChangePercent ?? null,
      };
    }
  } catch {
    // price fetch failed — return stocks without prices
  }

  const enriched = stocks.map((s) => ({
    id: s.id,
    ticker: s.ticker,
    exchange: s.exchange,
    position: s.position,
    price: priceMap[s.ticker]?.price ?? null,
    change: priceMap[s.ticker]?.change ?? null,
    changePct: priceMap[s.ticker]?.changePct ?? null,
  }));

  res.json(enriched);
});

// POST /api/watchlists/:id/stocks — add ticker
watchlistStocksRouter.post('/', async (req: Request<Params>, res: Response) => {
  const watchlistId = Number(req.params.id);
  const { ticker, exchange } = req.body as { ticker: string; exchange?: string };
  if (!ticker?.trim()) {
    res.status(400).json({ error: 'ticker is required' });
    return;
  }
  const max = await prisma.stock.aggregate({
    where: { watchlistId },
    _max: { position: true },
  });
  const position = (max._max.position ?? -1) + 1;
  const stock = await prisma.stock.create({
    data: { ticker: ticker.trim().toUpperCase(), exchange, position, watchlistId },
  });
  res.status(201).json(stock);
});

// PATCH /api/watchlists/:id/stocks/reorder — must be before /:ticker
watchlistStocksRouter.patch('/reorder', async (_req: Request, res: Response) => {
  const { ids } = _req.body as { ids: number[] };
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids must be an array' });
    return;
  }
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.stock.update({ where: { id }, data: { position: index } })
    )
  );
  res.json({ ok: true });
});

// DELETE /api/watchlists/:id/stocks/:ticker — remove ticker
watchlistStocksRouter.delete('/:ticker', async (req: Request<Params & { ticker: string }>, res: Response) => {
  const watchlistId = Number(req.params.id);
  const ticker = req.params.ticker.toUpperCase();
  await prisma.stock.deleteMany({ where: { watchlistId, ticker } });
  res.json({ ok: true });
});
