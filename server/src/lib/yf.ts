import YahooFinance from 'yahoo-finance2';

export const yf = new YahooFinance({
  suppressNotices: ['ripHistorical'],
  logger: {
    info:  () => {},
    debug: () => {},
    dir:   () => {},
    warn:  console.warn,
    error: console.error,
  },
});

