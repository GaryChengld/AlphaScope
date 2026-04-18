import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, type UTCTimestamp } from 'lightweight-charts';
import { RSI } from 'technicalindicators';

interface Candle {
  time: UTCTimestamp | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndexChartProps {
  ticker: string;
  period: string;
}

const CHART_OPTS = {
  layout: {
    background: { type: ColorType.Solid, color: '#030712' },
    textColor: '#9ca3af',
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: '#1f2937' },
    horzLines: { color: '#1f2937' },
  },
  crosshair: { mode: 1 as const },
  rightPriceScale: { borderColor: '#374151' },
  timeScale: { borderColor: '#374151', timeVisible: true },
};

export default function IndexChart({ ticker, period }: IndexChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      ...CHART_OPTS,
      width: el.clientWidth,
      height: el.clientHeight,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#4ade80', downColor: '#f87171',
      borderUpColor: '#4ade80', borderDownColor: '#f87171',
      wickUpColor: '#4ade80', wickDownColor: '#f87171',
    });

    // Volume histogram overlaid on candle pane with its own scale
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // RSI in pane 1 (second pane)
    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#a78bfa',
      lineWidth: 1,
      priceScaleId: 'right',
    }, 1);

    // 75% / 25% pane split
    const panes = chart.panes();
    if (panes.length >= 2) {
      panes[0].setStretchFactor(3);
      panes[1].setStretchFactor(1);
    }

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);

    const loadData = (fitContent: boolean) =>
      fetch(`/api/stocks/${encodeURIComponent(ticker)}/history?period=${period}`)
        .then((r) => r.ok ? r.json() : [])
        .then((data: Candle[]) => {
          if (data.length === 0) return;
          candleSeries.setData(data);

          volumeSeries.setData(data.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? '#4ade8033' : '#f8717133',
          })));

          const closes = data.map((c) => c.close);
          const rsiValues = RSI.calculate({ period: 14, values: closes });
          const rsiData = data.slice(data.length - rsiValues.length).map((c, i) => ({
            time: c.time,
            value: rsiValues[i],
          }));
          rsiSeries.setData(rsiData);

          if (fitContent) chart.timeScale().fitContent();
        })
        .catch(() => {});

    loadData(true);
    const timer = setInterval(() => loadData(false), 30_000);

    return () => {
      clearInterval(timer);
      observer.disconnect();
      chart.remove();
    };
  }, [ticker, period]);

  return <div ref={containerRef} className="w-full h-full" />;
}
