import { yf } from '../lib/yf';

const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY']);

export interface StockSearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string | null;
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (yf.search as any)(query, {}, { validateResult: false }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((result.quotes ?? []) as any[])
    .filter((r) => ALLOWED_TYPES.has(r.quoteType ?? ''))
    .slice(0, 20)
    .map((r) => ({
      symbol:   r.symbol   as string,
      name:     (r.shortname ?? r.longname ?? r.symbol) as string,
      type:     r.quoteType as string,
      exchange: (r.exchange ?? null) as string | null,
    }));
}
