import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Search, Bell, Settings } from 'lucide-react';

interface TopbarProps {
  onBellClick: () => void;
  onSearchClick: () => void;
  unreadCount?: number;
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

export default function Topbar({ onBellClick, onSearchClick, unreadCount }: TopbarProps) {
  const { time, status } = useMarketClock();

  return (
    <header className="h-16 flex items-center gap-4 px-4 border-b border-gray-800 bg-gray-800 shrink-0">
      {/* Logo */}
      <Link to="/overview" className="text-blue-400 font-semibold text-[17.5px] whitespace-nowrap hover:text-blue-300 transition-colors">
        Alpha Scope
      </Link>

      {/* Search button */}
      <button
        onClick={onSearchClick}
        className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors"
        aria-label="Search"
      >
        <Search size={16} />
      </button>

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
        {(unreadCount ?? 0) > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5 leading-none">
            {unreadCount! > 99 ? '99+' : unreadCount}
          </span>
        )}
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
