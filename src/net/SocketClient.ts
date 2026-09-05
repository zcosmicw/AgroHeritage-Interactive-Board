// ============================================================
// Socket Client — Client-side Socket.io wrapper
// ============================================================

import { io, Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  GameState,
  EraData,
  DisasterConfig,
  GameDuration,
  GameAction,
  PlayerId,
} from '../../shared/types';

export class SocketClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  public playerId: PlayerId = 1;
  public roomCode: string = '';

  private stateCallbacks: ((state: GameState) => void)[] = [];
  private eraCallbacks: ((era: EraData) => void)[] = [];
  private disasterCallbacks: ((disaster: DisasterConfig) => void)[] = [];
  private gameOverCallbacks: ((state: GameState) => void)[] = [];
  private errorCallbacks: ((msg: string) => void)[] = [];
  private roomCreatedCallbacks: ((code: string) => void)[] = [];
  private roomJoinedCallbacks: ((playerId: PlayerId, state: GameState) => void)[] = [];
  private roomWaitingCallbacks: ((code: string) => void)[] = [];
  private playerLeftCallbacks: (() => void)[] = [];

  constructor() {
    // Connect to server (same origin in production, or localhost:8000 in dev)
    const url = window.location.hostname === 'localhost'
      ? 'http://localhost:8000'
      : window.location.origin;

    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }) as any;

    this.setupListeners();
  }

  private setupListeners(): void {
    this.socket.on('connect', () => {
      console.log('🔌 Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
    });

    this.socket.on('room:created', (code: string) => {
      this.roomCode = code;
      this.roomCreatedCallbacks.forEach(cb => cb(code));
    });

    this.socket.on('room:waiting', (code: string) => {
      this.roomCode = code;
      this.roomWaitingCallbacks.forEach(cb => cb(code));
    });

    this.socket.on('room:joined', (playerId: PlayerId, state: GameState) => {
      this.playerId = playerId;
      this.roomJoinedCallbacks.forEach(cb => cb(playerId, state));
    });

    this.socket.on('room:playerLeft', () => {
      this.playerLeftCallbacks.forEach(cb => cb());
    });

    this.socket.on('game:stateUpdate', (state: GameState) => {
      this.stateCallbacks.forEach(cb => cb(state));
    });

    this.socket.on('game:eraTransition', (era: EraData) => {
      this.eraCallbacks.forEach(cb => cb(era));
    });

    this.socket.on('game:disasterAlert', (disaster: DisasterConfig) => {
      this.disasterCallbacks.forEach(cb => cb(disaster));
    });

    this.socket.on('game:over', (state: GameState) => {
      this.gameOverCallbacks.forEach(cb => cb(state));
    });

    this.socket.on('error', (message: string) => {
      this.errorCallbacks.forEach(cb => cb(message));
    });
  }

  // --- Emitters ---

  createRoom(name: string, mode: '1p' | '2p', duration: GameDuration): void {
    this.socket.emit('room:create', name, mode, duration);
  }

  joinRoom(code: string, name: string): void {
    this.socket.emit('room:join', code, name);
  }

  sendAction(action: GameAction): void {
    this.socket.emit('game:action', action);
  }

  sendSpeedToggle(): void {
    this.socket.emit('game:speedToggle');
  }

  sendPause(): void {
    this.socket.emit('game:pause');
  }

  // --- Listeners ---

  onStateUpdate(cb: (state: GameState) => void): void { this.stateCallbacks.push(cb); }
  onEraTransition(cb: (era: EraData) => void): void { this.eraCallbacks.push(cb); }
  onDisasterAlert(cb: (disaster: DisasterConfig) => void): void { this.disasterCallbacks.push(cb); }
  onGameOver(cb: (state: GameState) => void): void { this.gameOverCallbacks.push(cb); }
  onError(cb: (msg: string) => void): void { this.errorCallbacks.push(cb); }
  onRoomCreated(cb: (code: string) => void): void { this.roomCreatedCallbacks.push(cb); }
  onRoomJoined(cb: (playerId: PlayerId, state: GameState) => void): void { this.roomJoinedCallbacks.push(cb); }
  onRoomWaiting(cb: (code: string) => void): void { this.roomWaitingCallbacks.push(cb); }
  onPlayerLeft(cb: () => void): void { this.playerLeftCallbacks.push(cb); }
}
