import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { triggerScan } from '../services/scannerService';

export const scannerRouter = Router();
export const notificationRouter = Router();

scannerRouter.post('/run', (_req, res) => {
  if (!triggerScan()) {
    return res.status(409).json({ error: 'Scan already in progress' });
  }
  res.status(202).json({ message: 'Scan started' });
});

notificationRouter.get('/', async (_req, res) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const notifications = await prisma.notification.findMany({
    where:   { date: { gte: cutoffDate } },
    orderBy: { createdAt: 'desc' },
    include: { tickers: { orderBy: { score: 'desc' } } },
  });
  res.json(notifications);
});

notificationRouter.patch('/:id/read', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const updated = await prisma.notification.update({
      where:   { id },
      data:    { read: true },
      include: { tickers: true },
    });
    res.json(updated);
  } catch {
    res.status(404).json({ error: 'Notification not found' });
  }
});

notificationRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    await prisma.notification.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Notification not found' });
  }
});
