import { prisma } from '../lib/prisma';

export interface AiAnalysisSummary {
  id: number;
  ticker: string;
  timestamp: Date;
  llmProvider: string;
}

export interface AiAnalysisFull extends AiAnalysisSummary {
  content: string;
}

export async function listAiAnalyses(ticker: string): Promise<AiAnalysisSummary[]> {
  return prisma.aiAnalysis.findMany({
    where: { ticker: ticker.toUpperCase() },
    select: { id: true, ticker: true, timestamp: true, llmProvider: true },
    orderBy: { timestamp: 'desc' },
  });
}

export async function getAiAnalysis(id: number): Promise<AiAnalysisFull | null> {
  return prisma.aiAnalysis.findUnique({ where: { id } });
}

export async function createAiAnalysis(
  ticker: string,
  llmProvider: string,
  content: string,
): Promise<AiAnalysisFull> {
  return prisma.aiAnalysis.create({
    data: {
      ticker: ticker.toUpperCase(),
      llmProvider,
      content,
    },
  });
}

export async function deleteAiAnalysis(id: number): Promise<void> {
  await prisma.aiAnalysis.delete({ where: { id } });
}
