import { Router } from 'express';
import { listStrategies, loadStrategy, runStrategy, toMarkdown } from '../services/strategy/strategyService';

export const strategyRouter = Router();

strategyRouter.get('/', (_req, res) => {
  try {
    res.json(listStrategies());
  } catch (err) {
    console.error('[strategies] list error', err);
    res.status(500).json({ error: 'failed to list strategies' });
  }
});

strategyRouter.get('/:strategyId/evaluate/:ticker', async (req, res) => {
  const { strategyId, ticker } = req.params;
  try {
    loadStrategy(strategyId); // validate existence + enabled before fetching data
  } catch {
    return res.status(404).json({ error: 'unknown strategy' });
  }
  try {
    const result = await runStrategy(ticker, strategyId);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(toMarkdown(result));
  } catch (err) {
    console.error(`[strategies] evaluate error ${strategyId}/${ticker}`, err);
    res.status(502).json({ error: 'failed to evaluate strategy' });
  }
});
