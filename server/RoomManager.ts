// ============================================================
// Room Manager — Manages game rooms and matchmaking
// ============================================================

import type { Server, Socket } from 'socket.io';
import type { GameDuration, GameAction, PlayerId } from '../shared/types.js';
import { GameRoom } from './GameRoom.js';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();

  constructor(private io: Server) {}

  createRoom(socket: Socket, playerName: string, mode: '1p' | '2p', duration: GameDuration): void {
    const code = this.generateCode();
    const room = new GameRoom(code, mode, duration);
    room.addPlayer(socket, playerName, 1);
    this.rooms.set(code, room);
    this.socketToRoom.set(socket.id, code);
    socket.join(code);

    console.log(`[Room ${code}] Created by "${playerName}" (mode: ${mode}, duration: ${duration})`);

    if (mode === '1p') {
      room.addAIPlayer();
      socket.emit('room:created', code);
      room.startGame();
    } else {
      socket.emit('room:created', code);
      socket.emit('room:waiting', code);
    }
  }

  joinRoom(socket: Socket, code: string, playerName: string): void {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      socket.emit('error', `Room "${normalizedCode}" not found`);
      return;
    }

    if (room.isFull()) {
      socket.emit('error', 'Room is full');
      return;
    }

    room.addPlayer(socket, playerName, 2);
    this.socketToRoom.set(socket.id, normalizedCode);
    socket.join(normalizedCode);

    console.log(`[Room ${normalizedCode}] "${playerName}" joined`);

    room.startGame();
  }

  handleAction(socket: Socket, action: GameAction): void {
    const code = this.socketToRoom.get(socket.id);
    if (!code) return;

    const room = this.rooms.get(code);
    if (!room) return;

    // Determine which player this socket is (1 or 2)
    room.handleAction(action.playerId, action);
  }

  handleSpeedToggle(socket: Socket): void {
    const code = this.socketToRoom.get(socket.id);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    room.handleSpeedToggle();
  }

  handlePause(socket: Socket): void {
    const code = this.socketToRoom.get(socket.id);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    room.handlePause();
  }

  handleDisconnect(socket: Socket): void {
    const code = this.socketToRoom.get(socket.id);
    if (!code) return;

    const room = this.rooms.get(code);
    if (!room) return;

    const removedId = room.removePlayer(socket);
    this.socketToRoom.delete(socket.id);

    console.log(`[Room ${code}] Player disconnected`);

    if (room.isEmpty()) {
      room.stop();
      this.rooms.delete(code);
      console.log(`[Room ${code}] Destroyed (empty)`);
    } else {
      // Notify remaining player
      this.io.to(code).emit('room:playerLeft');
    }
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
    let code: string;
    do {
      code = '';
      for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }
}
