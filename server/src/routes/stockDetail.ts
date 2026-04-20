import { Router } from 'express';
import { getStockSummary, getStockCandles, getStockAnalysis } from '../services/stockService';
import { getStockNews } from '../services/newsService';

export const stockDetailRouter = Router();

stockDetailRouter.get('/:ticker/summary', async (req, res) => {
  try {
    const data = await getStockSummary(req.params.ticker);
    res.json(data);
  } catch (err) {
    console.error('[stockDetail] summary error', err);
    res.status(502).json({ error: 'failed to fetch summary' });
  }
});

stockDetailRouter.get('/:ticker/history', async (req, res) => {
  const period = String(req.query.period ?? '1D');
  try {
    const candles = await getStockCandles(req.params.ticker, period);
    res.json(candles);
  } catch (err) {
    console.error('[stockDetail] history error', err);
    res.status(502).json({ error: 'failed to fetch history' });
  }
});

stockDetailRouter.get('/:ticker/news', async (req, res) => {
  try {
    const articles = await getStockNews(req.params.ticker);
    res.json(articles);
  } catch (err) {
    console.error('[stockDetail] news error', err);
    res.json([]);
  }
});

stockDetailRouter.get('/:ticker/analysis', async (req, res) => {
  try {
    const data = await getStockAnalysis(req.params.ticker);
    res.json(data);
  } catch (err) {
    console.error('[stockDetail] analysis error', err);
    res.status(502).json({ error: 'failed to fetch analysis' });
  }
});
