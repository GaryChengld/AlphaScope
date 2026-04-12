export default function Settings() {
  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-lg font-semibold text-gray-100 mb-6">Settings</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-200">AI Provider</div>
            <div className="text-xs text-gray-500 mt-0.5">Model used for stock analysis</div>
          </div>
          <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
            <option>Gemini</option>
            <option>OpenAI</option>
            <option>Claude</option>
          </select>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-200">Market Data Refresh</div>
            <div className="text-xs text-gray-500 mt-0.5">Interval for live price updates</div>
          </div>
          <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
            <option>5s</option>
            <option>15s</option>
            <option>30s</option>
            <option>1m</option>
          </select>
        </div>
      </div>
    </div>
  );
}
