export default function Overview() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-6 mb-6">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">SPX</span>
          <div className="text-2xl font-semibold text-gray-100">5,832</div>
          <div className="text-sm text-green-400">▲ +23.4 (+0.40%)</div>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">SPY</span>
          <div className="text-2xl font-semibold text-gray-100">583.21</div>
          <div className="text-sm text-green-400">▲ +2.31 (+0.40%)</div>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">QQQ</span>
          <div className="text-2xl font-semibold text-gray-100">497.44</div>
          <div className="text-sm text-green-400">▲ +4.12 (+0.83%)</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Chart placeholder */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-4 h-80 flex items-center justify-center">
          <span className="text-gray-600 text-sm">SPX Chart — lightweight-charts</span>
        </div>

        {/* Sector heatmap placeholder */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sectors</h3>
          {[
            { name: 'XLK', change: +1.2 },
            { name: 'XLF', change: -0.3 },
            { name: 'XLE', change: +0.8 },
            { name: 'XLV', change: +0.2 },
            { name: 'XLI', change: +0.5 },
            { name: 'XLC', change: -0.1 },
            { name: 'XLY', change: +0.9 },
            { name: 'XLP', change: -0.4 },
            { name: 'XLRE', change: +0.3 },
            { name: 'XLB', change: +0.6 },
            { name: 'XLU', change: -0.2 },
          ].map(({ name, change }) => (
            <div key={name} className="flex items-center gap-2 mb-2">
              <span className="w-10 text-xs font-medium text-gray-300">{name}</span>
              <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                <div
                  className={`h-full rounded-sm ${change >= 0 ? 'bg-green-500/60' : 'bg-red-500/60'}`}
                  style={{ width: `${Math.min(Math.abs(change) * 40 + 10, 100)}%` }}
                />
              </div>
              <span className={`text-xs w-12 text-right ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {change >= 0 ? '+' : ''}{change.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
