// ============================================================
// Action Handler — Validates and applies player actions
// ============================================================

import type {
  GameState,
  PlayerId,
  GameAction,
  PlayerState,
  Plot,
  CropConfig,
} from '../../shared/types.js';
import type { GameEngine } from './GameEngine.js';

export function dispatchAction(
  state: GameState,
  playerId: PlayerId,
  action: GameAction,
  engine: GameEngine
): void {
  if (state.phase === 'GAME_OVER' || state.phase === 'LOBBY') return;

  const player = state.players[playerId - 1];
  if (!player) return;

  switch (action.type) {
    case 'MOVE_CURSOR':
      handleMoveCursor(player, action.payload?.direction);
      break;
    case 'PREP_SOIL':
      handlePrepSoil(player, state, engine);
      break;
    case 'SOW_SEED':
      handleSowSeed(player, state, engine);
      break;
    case 'IRRIGATE':
      handleIrrigate(player, state, engine);
      break;
    case 'PUMP_WATER':
      handlePumpWater(player, state, engine);
      break;
    case 'APPLY_FERTILIZER':
      handleApplyFertilizer(player, action.payload?.fertilizerType, engine);
      break;
    case 'HARVEST':
      handleHarvest(player, state, engine);
      break;
    case 'BUILD_BUND':
      handleBuildBund(player, engine);
      break;
    case 'APPLY_COMPOST':
      handleApplyCompost(player, engine);
      break;
    case 'CYCLE_CROP':
      handleCycleCrop(player, state);
      break;
    case 'SELECT_CROP':
      if (action.payload?.cropId && state.currentEra) {
        const idx = state.currentEra.availableCrops.findIndex(c => c.id === action.payload!.cropId);
        if (idx >= 0) player.selectedCropIndex = idx;
      }
      break;
  }
}

function handleMoveCursor(player: PlayerState, direction?: string): void {
  if (!direction) return;
  const pos = player.cursorPosition;
  // 2×3 grid layout: 
  // 0 1 2
  // 3 4 5
  const col = pos % 3;
  const row = Math.floor(pos / 3);

  switch (direction) {
    case 'up':    if (row > 0) player.cursorPosition = pos - 3; break;
    case 'down':  if (row < 1) player.cursorPosition = pos + 3; break;
    case 'left':  if (col > 0) player.cursorPosition = pos - 1; break;
    case 'right': if (col < 2) player.cursorPosition = pos + 1; break;
  }
}

function handlePrepSoil(player: PlayerState, state: GameState, engine: GameEngine): void {
  const plot = player.plots[player.cursorPosition];
  if (!plot || plot.status !== 'EMPTY' && plot.status !== 'WITHERED') return;

  // If cattle are dead, prep takes longer (we just add a delay effect — for now, instant)
  const cattleDead = player.cattle && !player.cattle.alive;
  const cost = cattleDead ? 20 : 10;

  if (player.cash < cost) {
    engine.addEvent(player.id, '💰 Not enough cash to prepare soil!', 'warning');
    return;
  }

  player.cash -= cost;
  plot.status = 'PREPPED';
  plot.crop = null;
  plot.growthProgress = 0;
  plot.fertilizerType = 'none';
  engine.addEvent(player.id, `🌱 Plot ${plot.id + 1} prepared for sowing`, 'info');
}

function handleSowSeed(player: PlayerState, state: GameState, engine: GameEngine): void {
  const plot = player.plots[player.cursorPosition];
  if (!plot || plot.status !== 'PREPPED') {
    engine.addEvent(player.id, '⚠️ Prepare the soil first!', 'warning');
    return;
  }

  const era = state.currentEra;
  if (!era) return;

  const crop = era.availableCrops[player.selectedCropIndex];
  if (!crop) return;

  if (player.cash < crop.seedCost) {
    engine.addEvent(player.id, `💰 Not enough cash for ${crop.name} seeds (₹${crop.seedCost})!`, 'warning');
    return;
  }

  player.cash -= crop.seedCost;
  plot.crop = { ...crop };
  plot.status = 'GROWING';
  plot.growthProgress = 0;
  engine.addEvent(player.id, `🌱 Sowed ${crop.name} (${crop.hindiName}) on plot ${plot.id + 1}`, 'info');
}

function handleIrrigate(player: PlayerState, state: GameState, engine: GameEngine): void {
  const plot = player.plots[player.cursorPosition];
  if (!plot) return;

  // Use canal water (free but limited by supply)
  const available = state.shared.canal * 0.1;
  if (available < 5) {
    engine.addEvent(player.id, '🚰 Canal water too low! Try pumping groundwater.', 'warning');
    return;
  }

  const amount = Math.min(20, available);
  plot.waterLevel = Math.min(100, plot.waterLevel + amount);
  state.shared.canal -= amount;
  plot.lastIrrigatedAt = state.elapsedSeconds;
  engine.addEvent(player.id, `💧 Irrigated plot ${plot.id + 1} from canal (+${amount.toFixed(0)})`, 'info');
}

function handlePumpWater(player: PlayerState, state: GameState, engine: GameEngine): void {
  const plot = player.plots[player.cursorPosition];
  if (!plot) return;

  // Pump from shared aquifer
  const era = state.currentEra;
  const pumpCostMultiplier = era?.disaster?.mechanics?.wellPumpCostMultiplier ?? 1;
  const cost = 15 * pumpCostMultiplier;

  if (player.cash < cost) {
    engine.addEvent(player.id, '💰 Not enough cash for pump operation!', 'warning');
    return;
  }

  if (state.shared.aquifer < 5) {
    engine.addEvent(player.id, '🏜️ Aquifer is depleted! No groundwater available.', 'warning');
    return;
  }

  player.cash -= cost;
  const amount = Math.min(25, state.shared.aquifer * 0.15);
  plot.waterLevel = Math.min(100, plot.waterLevel + amount);
  state.shared.aquifer -= amount * 0.8; // Pumping depletes aquifer
  plot.lastIrrigatedAt = state.elapsedSeconds;

  // Salinization risk check
  const salinizationChance = era?.disaster?.mechanics?.salinizationChance ?? 0;
  if (salinizationChance > 0 && Math.random() < salinizationChance) {
    plot.salinity += 2;
    engine.addEvent(player.id, `⚠️ Plot ${plot.id + 1} salinization risk! Salinity: ${plot.salinity.toFixed(1)} dS/m`, 'warning');
  }

  engine.addEvent(player.id, `🔧 Pumped groundwater to plot ${plot.id + 1} (+${amount.toFixed(0)}, cost ₹${cost})`, 'info');
}

function handleApplyFertilizer(player: PlayerState, type: 'organic' | 'chemical' | undefined, engine: GameEngine): void {
  const plot = player.plots[player.cursorPosition];
  if (!plot || !plot.crop) return;

  const fertType = type ?? (plot.fertilizerType === 'chemical' ? 'organic' : 'chemical');
  const cost = fertType === 'chemical' ? 25 : 15;

  if (player.cash < cost) {
    engine.addEvent(player.id, '💰 Not enough cash for fertilizer!', 'warning');
    return;
  }

  player.cash -= cost;
  plot.fertilizerType = fertType;

  if (fertType === 'organic') {
    plot.organicMatter = Math.min(100, plot.organicMatter + 15);
    plot.soilHealth = Math.min(100, plot.soilHealth + 3);
    engine.addEvent(player.id, `🌿 Applied organic compost to plot ${plot.id + 1}`, 'info');
  } else {
    // Chemical fertilizer boosts growth but degrades soil
    plot.growthProgress = Math.min(100, plot.growthProgress + 10);
    engine.addEvent(player.id, `🧪 Applied chemical fertilizer to plot ${plot.id + 1}`, 'info');
  }
}

function handleHarvest(player: PlayerState, state: GameState, engine: GameEngine): void {
  const plot = player.plots[player.cursorPosition];
  if (!plot || plot.status !== 'READY' || !plot.crop) {
    engine.addEvent(player.id, '⚠️ Nothing to harvest here!', 'warning');
    return;
  }

  const crop = plot.crop;

  // Calculate yield
  let yieldAmount = crop.baseYield;

  // Soil health multiplier
  yieldAmount *= (0.5 + plot.soilHealth / 200);

  // Water stress penalty
  if (plot.waterLevel < 20) {
    yieldAmount *= 0.5;
  }

  // Disaster penalties
  if (state.disasterActive && state.currentEra) {
    const penalties = state.currentEra.disaster.mechanics.yieldPenalties;
    if (penalties) {
      const penaltyRate = penalties[crop.category] ?? 0.5;
      yieldAmount *= penaltyRate;
    }
  }

  // Calculate earnings
  const marketPrice = state.market[crop.id]?.current ?? crop.baseYield * 0.3;
  const earnings = Math.round((yieldAmount / 100) * marketPrice);

  player.cash += earnings;
  player.food += Math.round(yieldAmount * 0.3); // 30% kept as food
  player.score += Math.round(yieldAmount);

  engine.addEvent(
    player.id,
    `🌾 Harvested ${crop.name}! Yield: ${Math.round(yieldAmount)}, Earned: ₹${earnings}`,
    'harvest'
  );

  // Reset plot
  plot.status = 'EMPTY';
  plot.crop = null;
  plot.growthProgress = 0;
  plot.fertilizerType = 'none';
}

function handleBuildBund(player: PlayerState, engine: GameEngine): void {
  const plot = player.plots[player.cursorPosition];
  if (!plot) return;

  if (plot.hasBund) {
    engine.addEvent(player.id, '⚠️ This plot already has a bund!', 'warning');
    return;
  }

  const cost = 30;
  if (player.cash < cost) {
    engine.addEvent(player.id, '💰 Not enough cash to build a bund (₹30)!', 'warning');
    return;
  }

  player.cash -= cost;
  plot.hasBund = true;
  engine.addEvent(player.id, `🧱 Built protective bund on plot ${plot.id + 1}`, 'info');
}

function handleApplyCompost(player: PlayerState, engine: GameEngine): void {
  const plot = player.plots[player.cursorPosition];
  if (!plot) return;

  const cost = 10;
  if (player.cash < cost) {
    engine.addEvent(player.id, '💰 Not enough cash for compost (₹10)!', 'warning');
    return;
  }

  player.cash -= cost;
  plot.organicMatter = Math.min(100, plot.organicMatter + 20);
  plot.soilHealth = Math.min(100, plot.soilHealth + 5);
  engine.addEvent(player.id, `🌿 Applied organic compost to plot ${plot.id + 1}`, 'info');
}

function handleCycleCrop(player: PlayerState, state: GameState): void {
  if (!state.currentEra) return;
  const totalCrops = state.currentEra.availableCrops.length;
  player.selectedCropIndex = (player.selectedCropIndex + 1) % totalCrops;
}
