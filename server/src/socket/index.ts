import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';

let _io: SocketServer | null = null;

export function initSocket(httpServer: HttpServer): SocketServer {
  _io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  _io.on('connection', (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`[socket] Client disconnected: ${socket.id}`));
  });

  return _io;
}

export function getIo(): SocketServer {
  if (!_io) throw new Error('[socket] Not initialized — call initSocket first');
  return _io;
}
