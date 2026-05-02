import { useEffect, useRef } from 'react';

const PERIOD_TO_INTERVAL: Record<string, string> = {
  '15m': '15',
  '30m': '30',
  '1H':  '60',
  '2H':  '120',
  '4H':  '240',
  '1D':  'D',
  '1W':  'W',
  '1M':  'M',
};

interface TradingViewChartProps {
  symbol: string;
  period: string;
}

export default function TradingViewChart({ symbol, period }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    const interval = PERIOD_TO_INTERVAL[period] ?? 'D';
    const tvSymbol = /\.TO$/i.test(symbol)
      ? `TSX:${symbol.replace(/\.TO$/i, '')}`
      : symbol;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval,
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      hide_side_toolbar: true,
      allow_symbol_change: false,
      calendar: false,
      studies: ['RSI@tv-basicstudies'],
      support_host: 'https://www.tradingview.com',
    });

    container.appendChild(script);

    return () => {
      if (container) container.innerHTML = '';
    };
  }, [symbol, period]);

  return (
    <div className="tradingview-widget-container h-full w-full" ref={containerRef}>
      <div className="tradingview-widget-container__widget h-full w-full" />
    </div>
  );
}
