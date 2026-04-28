import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import RightPanel from './RightPanel';
import SearchModal from '../SearchModal';
import socket from '../../lib/socket';

interface NotificationTicker {
  id: number;
  ticker: string;
  score: number;
  markdown: string;
  addedAt: string;
}

export interface Notification {
  id: number;
  strategyId: string;
  strategyName: string;
  date: string;
  read: boolean;
  createdAt: string;
  tickers: NotificationTicker[];
}

export default function Shell() {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(setNotifications)
      .catch(() => {});
  }, []);

  useEffect(() => {
    socket.connect();
    socket.on('notification:update', (updated: Notification) => {
      setNotifications(prev => {
        const idx = prev.findIndex(n => n.id === updated.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [updated, ...prev];
      });
    });
    return () => {
      socket.off('notification:update');
      socket.disconnect();
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  };

  const deleteNotification = async (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 overflow-hidden px-[10%]">
      <div className="flex flex-col flex-1 overflow-hidden bg-gray-950">
        <Topbar
          onBellClick={() => setRightPanelOpen((o) => !o)}
          onSearchClick={() => setSearchOpen(true)}
          unreadCount={unreadCount}
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
          <RightPanel
            open={rightPanelOpen}
            onClose={() => setRightPanelOpen(false)}
            notifications={notifications}
            onMarkRead={markAsRead}
            onDelete={deleteNotification}
          />
        </div>
      </div>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
