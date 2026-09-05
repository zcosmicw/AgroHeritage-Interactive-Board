// ============================================================
// Input Manager — Keyboard → Socket action sender
// ============================================================

import type { SocketClient } from '../net/SocketClient';
import type { PlayerId, GameAction, ActionType } from '../../shared/types';

export class InputManager {
  private boundHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private client: SocketClient,
    private playerId: PlayerId
  ) {}

  bind(): void {
    this.boundHandler = (e: KeyboardEvent) => this.handleKey(e);
    window.addEventListener('keydown', this.boundHandler);
  }

  unbind(): void {
    if (this.boundHandler) {
      window.removeEventListener('keydown', this.boundHandler);
      this.boundHandler = null;
    }
  }

  private handleKey(e: KeyboardEvent): void {
    // Don't capture when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const key = e.key.toLowerCase();
    let action: GameAction | null = null;

    // Player 1 controls (always active for P1)
    if (this.playerId === 1) {
      action = this.getP1Action(key);
    }

    // Player 2 controls (only active for P2)
    if (this.playerId === 2) {
      action = this.getP2Action(key, e);
    }

    // Shared controls
    if (!action) {
      if (key === ' ' || key === 'space') {
        e.preventDefault();
        this.client.sendPause();
        return;
      }
      if (key === 't') {
        this.client.sendSpeedToggle();
        return;
      }
    }

    if (action) {
      e.preventDefault();
      this.client.sendAction(action);
    }
  }

  private getP1Action(key: string): GameAction | null {
    const pid: PlayerId = 1;

    switch (key) {
      case 'w': return { playerId: pid, type: 'MOVE_CURSOR', payload: { direction: 'up' } };
      case 's': return { playerId: pid, type: 'MOVE_CURSOR', payload: { direction: 'down' } };
      case 'a': return { playerId: pid, type: 'MOVE_CURSOR', payload: { direction: 'left' } };
      case 'd': return { playerId: pid, type: 'MOVE_CURSOR', payload: { direction: 'right' } };
      case '1': return this.getContextualAction(pid);
      case '2': return { playerId: pid, type: 'PUMP_WATER' };
      case '3': return { playerId: pid, type: 'APPLY_FERTILIZER' };
      case '4': return { playerId: pid, type: 'HARVEST' };
      case 'q': return { playerId: pid, type: 'CYCLE_CROP' };
      case 'e': return { playerId: pid, type: 'BUILD_BUND' };
      case 'r': return { playerId: pid, type: 'APPLY_COMPOST' };
      default: return null;
    }
  }

  private getP2Action(key: string, e: KeyboardEvent): GameAction | null {
    const pid: PlayerId = 2;

    switch (key) {
      case 'arrowup':    return { playerId: pid, type: 'MOVE_CURSOR', payload: { direction: 'up' } };
      case 'arrowdown':  return { playerId: pid, type: 'MOVE_CURSOR', payload: { direction: 'down' } };
      case 'arrowleft':  return { playerId: pid, type: 'MOVE_CURSOR', payload: { direction: 'left' } };
      case 'arrowright': return { playerId: pid, type: 'MOVE_CURSOR', payload: { direction: 'right' } };
      case '7': return this.getContextualAction(pid);
      case '8': return { playerId: pid, type: 'PUMP_WATER' };
      case '9': return { playerId: pid, type: 'APPLY_FERTILIZER' };
      case '0': return { playerId: pid, type: 'HARVEST' };
      case 'u': return { playerId: pid, type: 'CYCLE_CROP' };
      case 'i': return { playerId: pid, type: 'BUILD_BUND' };
      case 'o': return { playerId: pid, type: 'APPLY_COMPOST' };
      default: return null;
    }
  }

  // Key 1 (P1) or Key 7 (P2): Context-sensitive — prep soil if empty, sow if prepped
  private getContextualAction(playerId: PlayerId): GameAction {
    // The server will validate, so we send PREP_SOIL and let it decide
    // We alternate between PREP and SOW on the client side for UX
    return { playerId, type: 'PREP_SOIL' };
  }
}
