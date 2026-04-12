import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Shell from './components/layout/Shell';
import Overview from './pages/Overview';
import SearchResults from './pages/SearchResults';
import StockDetail from './pages/StockDetail';
import Scanner from './pages/Scanner';
import Settings from './pages/Settings';
import { WatchlistProvider } from './context/WatchlistContext';

export default function App() {
  return (
    <BrowserRouter>
      <WatchlistProvider>
      <Routes>
        <Route path="/" element={<Shell />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="search" element={<SearchResults />} />
          <Route path="stock/:ticker" element={<StockDetail />} />
          <Route path="scanner" element={<Scanner />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      </WatchlistProvider>
    </BrowserRouter>
  );
}
