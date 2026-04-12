import { useState, useEffect, useRef } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { Search, Bell, Settings } from 'lucide-react';

interface TopbarProps {
  onBellClick: () => void;
}

function useMarketClock() {
  const [time, setTime] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    function update() {
      const now = new Date();
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const h = et.getHours();
      const m = et.getMinutes();
      const day = et.getDay();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      setTime(`${h12}:${pad(m)} ${ampm} ET`);

      const isWeekend = day === 0 || day === 6;
      const mins = h * 60 + m;
      if (isWeekend) setStatus('CLOSED');
      else if (mins < 4 * 60) setStatus('CLOSED');
      else if (mins < 9 * 60 + 30) setStatus('PRE-MARKET');
      else if (mins < 16 * 60) setStatus('OPEN');
      else if (mins < 20 * 60) setStatus('AFTER-HOURS');
      else setStatus('CLOSED');
    }
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, []);

  return { time, status };
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'text-green-400',
  'PRE-MARKET': 'text-yellow-400',
  'AFTER-HOURS': 'text-orange-400',
  CLOSED: 'text-gray-500',
};

export default function Topbar({ onBellClick }: TopbarProps) {
  const navigate = useNavigate();
  const { time, status } = useMarketClock();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && query.trim()) {
      setDropdownOpen(false);
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
    if (e.key === 'Escape') {
      setDropdownOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <header className="h-12 flex items-center gap-4 px-4 border-b border-gray-800 bg-gray-950 shrink-0">
      {/* Logo */}
      <span className="text-blue-400 font-semibold text-[17.5px] whitespace-nowrap select-none">
        Alpha Scope
      </span>

      {/* Search — left of title, expands on focus */}
      <div className={`relative transition-all duration-200 ${focused ? 'w-[432px]' : 'w-60'}`}>
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropdownOpen(e.target.value.length > 0);
          }}
          onFocus={() => {
            setFocused(true);
            if (query.length > 0) setDropdownOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setTimeout(() => setDropdownOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search…"
          className="w-full bg-gray-900 border border-gray-700 rounded-md pl-8 pr-3 py-1.5 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40"
        />
        {dropdownOpen && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-gray-900 border border-gray-700 rounded-md shadow-xl z-50 py-1">
            <button
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
              onMouseDown={() => {
                navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                setDropdownOpen(false);
              }}
            >
              <span className="text-gray-500 mr-1">
                <Search size={12} className="inline mr-1" />
                Search for
              </span>
              <span className="text-blue-400 font-medium">"{query}"</span>
            </button>
          </div>
        )}
      </div>

      {/* Spacer pushes clock + bell to the right */}
      <div className="flex-1" />

      {/* Clock + status */}
      <div className="flex items-center gap-2 text-xs whitespace-nowrap">
        <span className="text-gray-400">{time}</span>
        {status && (
          <span className={`font-medium ${STATUS_COLOR[status] ?? 'text-gray-500'}`}>
            {status}
          </span>
        )}
      </div>

      {/* Notification bell */}
      <button
        onClick={onBellClick}
        className="relative p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={16} />
      </button>

      {/* Settings */}
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `p-1.5 rounded transition-colors ${isActive ? 'text-blue-400' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'}`
        }
        aria-label="Settings"
      >
        <Settings size={16} />
      </NavLink>
    </header>
  );
}
