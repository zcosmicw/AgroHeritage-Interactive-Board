// ============================================================
// Game Room — Wraps a GameEngine instance per room
// ============================================================

import type { Socket } from 'socket.io';
import type { GameDuration, PlayerId, GameAction } from '../shared/types.js';
import { GameEngine } from './engine/GameEngine.js';
import { AIPlayer } from './engine/AIPlayer.js';

export class GameRoom {
  public code: string;
  public mode: '1p' | '2p';
  private duration: GameDuration;
  private engine: GameEngine | null = null;
  private sockets: Map<PlayerId, Socket> = new Map();
  private playerNames: Map<PlayerId, string> = new Map();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private aiPlayer: AIPlayer | null = null;
  private aiTickInterval: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number = 0;

  constructor(code: string, mode: '1p' | '2p', duration: GameDuration) {
    this.code = code;
    this.mode = mode;
    this.duration = duration;
  }

  addPlayer(socket: Socket, name: string, playerId: PlayerId): void {
    this.sockets.set(playerId, socket);
    this.playerNames.set(playerId, name);
  }

  addAIPlayer(): void {
    this.playerNames.set(2, 'AI Farmer 🤖');
  }

  isFull(): boolean {
    if (this.mode === '1p') return this.sockets.size >= 1;
    return this.sockets.size >= 2;
  }

  getPlayerCount(): number {
    return this.sockets.size;
  }

  startGame(): void {
    this.engine = new GameEngine(this.duration, this.code);

    // Set player names
    for (const [id, name] of this.playerNames) {
      this.engine.setPlayerName(id, name);
    }

    // Set AI flag
    if (this.mode === '1p') {
      this.engine.setPlayerAI(2, true);
      this.aiPlayer = new AIPlayer(this.engine);
    }

    // Emit initial state to all players
    const state = this.engine.getState();
    for (const [playerId, socket] of this.sockets) {
      socket.emit('room:joined', playerId, state);
    }

    // Start game loop — 20 ticks/sec
    this.lastTickTime = Date.now();
    this.tickInterval = setInterval(() => {
      if (!this.engine) return;
      this.engine.tick();
      this.broadcast('game:stateUpdate', this.engine.getState());

      // Check for era transitions
      const state = this.engine.getState();
      if (state.phase === 'ERA_TRANSITION' && state.currentEra) {
        this.broadcast('game:eraTransition', state.currentEra);
      }
      if (state.phase === 'CALAMITY' && state.currentEra) {
        this.broadcast('game:disasterAlert', state.currentEra.disaster);
      }
      if (state.phase === 'GAME_OVER') {
        this.broadcast('game:over', state);
        this.stop();
      }
    }, 50); // 50ms = 20 ticks/sec

    // AI tick — every 100ms for smoother AI decisions
    if (this.aiPlayer) {
      this.aiTickInterval = setInterval(() => {
        if (!this.aiPlayer || !this.engine) return;
        this.aiPlayer.tick(0.1);
      }, 100);
    }
  }

  handleAction(playerId: PlayerId, action: GameAction): void {
    if (!this.engine) return;
    this.engine.dispatchAction(playerId, action);
  }

  handleSpeedToggle(): void {
    if (!this.engine) return;
    this.engine.toggleSpeed();
  }

  handlePause(): void {
    if (!this.engine) return;
    this.engine.togglePause();
  }

  removePlayer(socket: Socket): PlayerId | null {
    for (const [id, s] of this.sockets) {
      if (s.id === socket.id) {
        this.sockets.delete(id);
        return id;
      }
    }
    return null;
  }

  private broadcast(event: string, data: any): void {
    for (const [, socket] of this.sockets) {
      socket.emit(event, data);
    }
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.aiTickInterval) {
      clearInterval(this.aiTickInterval);
      this.aiTickInterval = null;
    }
  }

  isEmpty(): boolean {
    return this.sockets.size === 0;
  }
}
