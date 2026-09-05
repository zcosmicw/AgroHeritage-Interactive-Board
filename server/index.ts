// ============================================================
// Server Entry Point — Express + Socket.io
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './RoomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Serve built frontend in production
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

const rooms = new RoomManager(io);

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('room:create', (name: string, mode: '1p' | '2p', duration: any) => {
    rooms.createRoom(socket, name, mode, duration);
  });

  socket.on('room:join', (code: string, name: string) => {
    rooms.joinRoom(socket, code, name);
  });

  socket.on('game:action', (action: any) => {
    rooms.handleAction(socket, action);
  });

  socket.on('game:speedToggle', () => {
    rooms.handleSpeedToggle(socket);
  });

  socket.on('game:pause', () => {
    rooms.handlePause(socket);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    rooms.handleDisconnect(socket);
  });
});

const PORT = process.env.PORT || 8000;
httpServer.listen(PORT, () => {
  console.log(`🌾 Krishi Yuddh server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
});
