import { subDate, today } from '../lib/dateUtils';

export interface NewsArticle {
  headline: string;
  source: string;
  url: string;
  datetime: number;
  summary: string;
  image: string | null;
}

export async function getStockNews(ticker: string): Promise<NewsArticle[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${subDate(7)}&to=${today()}&token=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await resp.json() as any[]).slice(0, 10).map((a) => ({
    headline: a.headline,
    source:   a.source,
    url:      a.url,
    datetime: a.datetime,
    summary:  a.summary,
    image:    a.image || null,
  }));
}
