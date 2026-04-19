import { getLivePrices } from './stockService';

// ─── Market Indicators ─────────────────────────────────────────────────────────

const MARKET_TICKERS = ['^GSPC', '^NDX', '^IXIC', '^DJI', '^VIX', 'DX-Y.NYB', '^TNX', 'CL=F'];

const MARKET_LABELS: Record<string, string> = {
  '^GSPC':    'S&P 500',
  '^NDX':     'Nasdaq 100',
  '^IXIC':    'Nasdaq Comp',
  '^DJI':     'Dow Jones',
  '^VIX':     'VIX',
  'DX-Y.NYB': 'US Dollar',
  '^TNX':     '10Y Yield',
  'CL=F':     'Crude Oil',
};

export interface MarketIndicator {
  ticker: string;
  label: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
}

export async function getMarketIndicators(): Promise<MarketIndicator[]> {
  const prices = await getLivePrices(MARKET_TICKERS);
  return MARKET_TICKERS.map((ticker) => ({
    ticker,
    label: MARKET_LABELS[ticker],
    price: prices[ticker]?.price ?? null,
    change: prices[ticker]?.change ?? null,
    changePct: prices[ticker]?.changePct ?? null,
  }));
}

// ─── Sector Prices ─────────────────────────────────────────────────────────────

const SECTOR_TICKERS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLC', 'XLY', 'XLP', 'XLRE', 'XLB', 'XLU'];

const SECTOR_NAMES: Record<string, string> = {
  XLK:  'Technology',
  XLF:  'Financials',
  XLE:  'Energy',
  XLV:  'Health Care',
  XLI:  'Industrials',
  XLC:  'Communication Services',
  XLY:  'Consumer Discretionary',
  XLP:  'Consumer Staples',
  XLRE: 'Real Estate',
  XLB:  'Materials',
  XLU:  'Utilities',
};

export interface SectorPrice {
  ticker: string;
  name: string;
  changePct: number | null;
}

export async function getSectorPrices(): Promise<SectorPrice[]> {
  const prices = await getLivePrices(SECTOR_TICKERS);
  return SECTOR_TICKERS.map((ticker) => ({
    ticker,
    name: SECTOR_NAMES[ticker],
    changePct: prices[ticker]?.changePct ?? null,
  }));
}
