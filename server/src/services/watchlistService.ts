import { prisma } from '../lib/prisma';
import { getLivePrices } from './stockService';

// ─── Watchlists ───────────────────────────────────────────────────────────────

export function listWatchlists() {
  return prisma.watchlist.findMany({ orderBy: { position: 'asc' } });
}

export async function createWatchlist(name: string, description?: string) {
  const max = await prisma.watchlist.aggregate({ _max: { position: true } });
  const position = (max._max.position ?? -1) + 1;
  return prisma.watchlist.create({ data: { name: name.trim(), description, position } });
}

export function renameWatchlist(id: number, name: string) {
  return prisma.watchlist.update({ where: { id }, data: { name: name.trim() } });
}

export function deleteWatchlist(id: number) {
  return prisma.watchlist.delete({ where: { id } });
}

export async function reorderWatchlists(ids: number[]) {
  await prisma.$transaction(
    ids.map((id, index) => prisma.watchlist.update({ where: { id }, data: { position: index } })),
  );
}

// ─── Membership ──────────────────────────────────────────────────────────────

export async function getWatchlistMembership(ticker: string): Promise<number[]> {
  const rows = await prisma.stock.findMany({
    where: { ticker: ticker.toUpperCase() },
    select: { watchlistId: true },
  });
  return rows.map((r) => r.watchlistId);
}

// ─── Stocks ───────────────────────────────────────────────────────────────────

export async function getStocksWithPrices(watchlistId: number) {
  const stocks = await prisma.stock.findMany({
    where: { watchlistId },
    orderBy: { position: 'asc' },
  });

  if (stocks.length === 0) return [];

  let priceMap: Awaited<ReturnType<typeof getLivePrices>> = {};
  try {
    priceMap = await getLivePrices(stocks.map((s) => s.ticker));
  } catch {
    // return stocks without prices on failure
  }

  return stocks.map((s) => ({
    id:        s.id,
    ticker:    s.ticker,
    exchange:  s.exchange,
    position:  s.position,
    price:     priceMap[s.ticker]?.price     ?? null,
    change:    priceMap[s.ticker]?.change    ?? null,
    changePct: priceMap[s.ticker]?.changePct ?? null,
  }));
}

export async function addStock(watchlistId: number, ticker: string, exchange?: string) {
  const max = await prisma.stock.aggregate({
    where: { watchlistId },
    _max: { position: true },
  });
  const position = (max._max.position ?? -1) + 1;
  return prisma.stock.create({
    data: { ticker: ticker.trim().toUpperCase(), exchange, position, watchlistId },
  });
}

export function removeStock(watchlistId: number, ticker: string) {
  return prisma.stock.deleteMany({ where: { watchlistId, ticker: ticker.toUpperCase() } });
}

export async function reorderStocks(ids: number[]) {
  await prisma.$transaction(
    ids.map((id, index) => prisma.stock.update({ where: { id }, data: { position: index } })),
  );
}
