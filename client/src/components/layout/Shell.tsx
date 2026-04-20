import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import RightPanel from './RightPanel';
import SearchModal from '../SearchModal';

export default function Shell() {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 overflow-hidden px-[10%]">
      <div className="flex flex-col flex-1 overflow-hidden bg-gray-950">
        <Topbar
          onBellClick={() => setRightPanelOpen((o) => !o)}
          onSearchClick={() => setSearchOpen(true)}
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
          <RightPanel open={rightPanelOpen} onClose={() => setRightPanelOpen(false)} />
        </div>
      </div>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
