import { Router } from 'express';
import {
  listAiAnalyses,
  getAiAnalysis,
  createAiAnalysis,
  deleteAiAnalysis,
} from '../services/aiAnalysisService';

export const aiAnalysisRouter = Router();

aiAnalysisRouter.get('/:ticker/ai-analysis', async (req, res) => {
  try {
    const records = await listAiAnalyses(req.params.ticker);
    res.json(records);
  } catch (err) {
    console.error('[aiAnalysis] list error', err);
    res.status(502).json({ error: 'failed to list AI analyses' });
  }
});

aiAnalysisRouter.get('/:ticker/ai-analysis/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  try {
    const record = await getAiAnalysis(id);
    if (!record) { res.status(404).json({ error: 'not found' }); return; }
    res.json(record);
  } catch (err) {
    console.error('[aiAnalysis] get error', err);
    res.status(502).json({ error: 'failed to get AI analysis' });
  }
});

aiAnalysisRouter.post('/:ticker/ai-analysis', async (req, res) => {
  const { llmProvider, content } = req.body as { llmProvider?: unknown; content?: unknown };
  if (!llmProvider || typeof llmProvider !== 'string' || !llmProvider.trim()) {
    res.status(400).json({ error: 'llmProvider is required' });
    return;
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  try {
    const record = await createAiAnalysis(
      req.params.ticker,
      llmProvider.trim(),
      content.trim(),
    );
    res.status(201).json(record);
  } catch (err) {
    console.error('[aiAnalysis] create error', err);
    res.status(502).json({ error: 'failed to create AI analysis' });
  }
});

aiAnalysisRouter.delete('/:ticker/ai-analysis/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  try {
    await deleteAiAnalysis(id);
    res.status(204).end();
  } catch (err) {
    console.error('[aiAnalysis] delete error', err);
    res.status(502).json({ error: 'failed to delete AI analysis' });
  }
});
