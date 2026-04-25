import dotenv from 'dotenv';
// dotenv must load before any other imports that read process.env
// npm workspace scripts set cwd to server/, so dotenv finds server/.env automatically
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { initSocket } from './socket/index';
import { healthRouter } from './routes/health';
import { watchlistsRouter } from './routes/watchlists';
import { watchlistStocksRouter } from './routes/watchlistStocks';
import { stockSearchRouter } from './routes/stockSearch';
import { stockDetailRouter } from './routes/stockDetail';
import { overviewRouter } from './routes/overview';
import { strategyRouter } from './routes/strategyRoutes';

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use('/api/health', healthRouter);
app.use('/api/watchlists', watchlistsRouter);
app.use('/api/watchlists/:id/stocks', watchlistStocksRouter);
app.use('/api/stocks', stockSearchRouter);
app.use('/api/stocks', stockDetailRouter);
app.use('/api/overview', overviewRouter);
app.use('/api/strategies', strategyRouter);

initSocket(httpServer);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[server] Alpha Scope server running on http://localhost:${PORT}`);
});
