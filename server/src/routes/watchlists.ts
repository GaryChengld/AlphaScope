import { Router } from 'express';
import {
  listWatchlists, createWatchlist, renameWatchlist,
  deleteWatchlist, reorderWatchlists, getWatchlistMembership,
} from '../services/watchlistService';

export const watchlistsRouter = Router();

watchlistsRouter.get('/', async (_req, res) => {
  res.json(await listWatchlists());
});

// GET /api/watchlists/membership?ticker=AAPL → [1, 3] (watchlist IDs containing the ticker)
watchlistsRouter.get('/membership', async (req, res) => {
  const ticker = String(req.query.ticker ?? '').trim();
  if (!ticker) { res.json([]); return; }
  res.json(await getWatchlistMembership(ticker));
});

watchlistsRouter.post('/', async (req, res) => {
  const { name, description } = req.body as { name: string; description?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  res.status(201).json(await createWatchlist(name, description));
});

watchlistsRouter.patch('/reorder', async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids)) { res.status(400).json({ error: 'ids must be an array' }); return; }
  await reorderWatchlists(ids);
  res.json({ ok: true });
});

watchlistsRouter.patch('/:id', async (req, res) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  res.json(await renameWatchlist(Number(req.params.id), name));
});

watchlistsRouter.delete('/:id', async (req, res) => {
  await deleteWatchlist(Number(req.params.id));
  res.json({ ok: true });
});
