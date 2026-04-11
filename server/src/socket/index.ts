import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';

export function initSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`[socket] Client disconnected: ${socket.id}`));
  });

  return io;
}
