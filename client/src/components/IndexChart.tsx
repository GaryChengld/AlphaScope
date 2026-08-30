import { useEffect, useLayoutEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { RSI } from 'technicalindicators';

// lightweight-charts has no timezone option — shift intraday UTC timestamps to
// NY wall-clock time so the axis reads "09:30" instead of "13:30".
const NY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

function toNYTimestamp(utcSeconds: number): UTCTimestamp {
  const parts = NY_FMT.formatToParts(new Date(utcSeconds * 1000));
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0');
  return Math.floor(
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) / 1000
  ) as UTCTimestamp;
}

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
  /** Whether the chart's tab is currently visible. When it flips true the chart
   *  re-measures its container — it may have been created while `display:none`
   *  (zero width) inside an inactive tab. Defaults to true. */
  active?: boolean;
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

export default function IndexChart({ ticker, period, active = true }: IndexChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      ...CHART_OPTS,
      width: el.clientWidth,
      height: el.clientHeight,
    });
    chartRef.current = chart;

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
      // Skip zero-size notifications (fired when the tab is hidden via
      // `display:none`) so the chart is never locked to a 0-width canvas.
      const w = el.clientWidth, h = el.clientHeight;
      if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
    });
    observer.observe(el);

    const loadData = (fitContent: boolean) =>
      fetch(`/api/stocks/${encodeURIComponent(ticker)}/history?period=${period}`)
        .then((r) => r.ok ? r.json() : [])
        .then((data: Candle[]) => {
          if (data.length === 0) return;
          const mapped = data.map((c) => ({
            ...c,
            time: typeof c.time === 'number' ? toNYTimestamp(c.time) : c.time,
          }));
          candleSeries.setData(mapped);

          volumeSeries.setData(mapped.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? '#4ade8033' : '#f8717133',
          })));

          const closes = mapped.map((c) => c.close);
          const rsiValues = RSI.calculate({ period: 14, values: closes });
          const rsiData = mapped.slice(mapped.length - rsiValues.length).map((c, i) => ({
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
      chartRef.current = null;
    };
  }, [ticker, period]);

  // When the tab becomes visible, re-measure the container. If the chart was
  // created while the tab was hidden (display:none → zero width), the
  // ResizeObserver's show notification isn't reliably delivered; this guarantees
  // a correct full-width fit. useLayoutEffect applies it before paint (no flash).
  useLayoutEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    const chart = chartRef.current;
    if (!el || !chart) return;
    const w = el.clientWidth, h = el.clientHeight;
    if (w > 0 && h > 0) {
      chart.applyOptions({ width: w, height: h });
      chart.timeScale().fitContent();
    }
  }, [active, ticker, period]);

  return <div ref={containerRef} className="w-full h-full" />;
}
