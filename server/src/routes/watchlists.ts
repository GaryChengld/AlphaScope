import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const watchlistsRouter = Router();

// GET /api/watchlists — list all, ordered by position
watchlistsRouter.get('/', async (_req, res) => {
  const watchlists = await prisma.watchlist.findMany({
    orderBy: { position: 'asc' },
  });
  res.json(watchlists);
});

// POST /api/watchlists — create new watchlist
watchlistsRouter.post('/', async (req, res) => {
  const { name, description } = req.body as { name: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const maxPos = await prisma.watchlist.aggregate({ _max: { position: true } });
  const position = (maxPos._max.position ?? -1) + 1;
  const watchlist = await prisma.watchlist.create({
    data: { name: name.trim(), description, position },
  });
  res.status(201).json(watchlist);
});

// PATCH /api/watchlists/reorder — update positions (must be before /:id)
watchlistsRouter.patch('/reorder', async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids must be an array' });
    return;
  }
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.watchlist.update({ where: { id }, data: { position: index } })
    )
  );
  res.json({ ok: true });
});

// PATCH /api/watchlists/:id — rename watchlist
watchlistsRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body as { name: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const watchlist = await prisma.watchlist.update({
    where: { id },
    data: { name: name.trim() },
  });
  res.json(watchlist);
});

// DELETE /api/watchlists/:id — delete watchlist (cascades stocks)
watchlistsRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  await prisma.watchlist.delete({ where: { id } });
  res.json({ ok: true });
});
