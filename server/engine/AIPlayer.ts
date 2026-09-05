// ============================================================
// AI Player — Basic opponent for 1-player mode
// ============================================================

import type { GameState, GameAction, PlayerId } from '../../shared/types.js';
import type { GameEngine } from './GameEngine.js';

export class AIPlayer {
  private playerId: PlayerId = 2;
  private tickCounter: number = 0;
  private actionCooldown: number = 0;
  private lastAction: string = '';

  constructor(private engine: GameEngine) {}

  tick(delta: number): void {
    this.tickCounter++;
    this.actionCooldown -= delta;

    if (this.actionCooldown > 0) return;

    // AI acts every 2-3 seconds
    this.actionCooldown = 2 + Math.random();

    const state = this.engine.getState();
    if (state.phase === 'GAME_OVER' || state.phase === 'LOBBY') return;

    const player = state.players[this.playerId - 1];
    if (!player) return;

    const action = this.decideAction(state);
    if (action) {
      this.engine.dispatchAction(this.playerId, action);
    }
  }

  private decideAction(state: GameState): GameAction | null {
    const player = state.players[this.playerId - 1];
    const era = state.currentEra;
    if (!player || !era) return null;

    const currentPlot = player.plots[player.cursorPosition];

    // Priority 1: Harvest ready crops
    const readyPlot = player.plots.find(p => p.status === 'READY');
    if (readyPlot) {
      if (player.cursorPosition !== readyPlot.id) {
        return this.moveTo(player.cursorPosition, readyPlot.id);
      }
      return { playerId: this.playerId, type: 'HARVEST' };
    }

    // Priority 2: Irrigate dry growing crops
    const dryPlot = player.plots.find(p => p.status === 'GROWING' && p.waterLevel < 25);
    if (dryPlot && player.cash > 15) {
      if (player.cursorPosition !== dryPlot.id) {
        return this.moveTo(player.cursorPosition, dryPlot.id);
      }
      // AI prefers pumping (greedy, depletes aquifer)
      return { playerId: this.playerId, type: 'PUMP_WATER' };
    }

    // Priority 3: Sow seeds on prepped plots
    const preppedPlot = player.plots.find(p => p.status === 'PREPPED');
    if (preppedPlot) {
      if (player.cursorPosition !== preppedPlot.id) {
        return this.moveTo(player.cursorPosition, preppedPlot.id);
      }
      // AI picks highest-yield crop (greedy strategy)
      const bestCropIdx = this.findHighestYieldCrop(era.availableCrops, player.cash);
      if (bestCropIdx >= 0) {
        player.selectedCropIndex = bestCropIdx;
        return { playerId: this.playerId, type: 'SOW_SEED' };
      }
    }

    // Priority 4: Prep empty/withered plots
    const emptyPlot = player.plots.find(p => p.status === 'EMPTY' || p.status === 'WITHERED');
    if (emptyPlot && player.cash > 20) {
      if (player.cursorPosition !== emptyPlot.id) {
        return this.moveTo(player.cursorPosition, emptyPlot.id);
      }
      return { playerId: this.playerId, type: 'PREP_SOIL' };
    }

    // Priority 5: Apply chemical fertilizer (AI doesn't use organic — suboptimal strategy)
    const growingPlot = player.plots.find(
      p => p.status === 'GROWING' && p.fertilizerType !== 'chemical' && p.growthProgress < 70
    );
    if (growingPlot && player.cash > 25) {
      if (player.cursorPosition !== growingPlot.id) {
        return this.moveTo(player.cursorPosition, growingPlot.id);
      }
      return {
        playerId: this.playerId,
        type: 'APPLY_FERTILIZER',
        payload: { fertilizerType: 'chemical' },
      };
    }

    // Default: irrigate a random growing plot
    const anyGrowing = player.plots.find(p => p.status === 'GROWING' && p.waterLevel < 50);
    if (anyGrowing && player.cash > 15) {
      if (player.cursorPosition !== anyGrowing.id) {
        return this.moveTo(player.cursorPosition, anyGrowing.id);
      }
      return { playerId: this.playerId, type: 'PUMP_WATER' };
    }

    return null;
  }

  private moveTo(from: number, to: number): GameAction {
    const fromCol = from % 3, fromRow = Math.floor(from / 3);
    const toCol = to % 3, toRow = Math.floor(to / 3);

    let direction: 'up' | 'down' | 'left' | 'right';
    if (toRow < fromRow) direction = 'up';
    else if (toRow > fromRow) direction = 'down';
    else if (toCol < fromCol) direction = 'left';
    else direction = 'right';

    return {
      playerId: this.playerId,
      type: 'MOVE_CURSOR',
      payload: { direction },
    };
  }

  private findHighestYieldCrop(crops: any[], cash: number): number {
    let bestIdx = -1;
    let bestYield = 0;

    for (let i = 0; i < crops.length; i++) {
      const crop = crops[i];
      if (crop.seedCost <= cash && crop.baseYield > bestYield) {
        bestYield = crop.baseYield;
        bestIdx = i;
      }
    }

    return bestIdx;
  }
}
