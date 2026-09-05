// ============================================================
// Game Engine — Core Server-Side Game Loop
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  GameState,
  PlayerState,
  Plot,
  EraData,
  GameDuration,
  PlayerId,
  GameAction,
  GameEvent,
  EnvironmentState,
  SharedResources,
  MarketPrice,
  CattleState,
  CropConfig,
} from '../../shared/types.js';
import { DURATION_CONFIG } from '../../shared/types.js';
import { dispatchAction } from './ActionHandler.js';
import { DisasterEngine } from './DisasterEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GameEngine {
  public state: GameState;
  private eraData: EraData[];
  private lastTick: number;
  private disasterEngine: DisasterEngine;
  private duration: GameDuration;
  private eventIdCounter: number = 0;

  constructor(duration: GameDuration, roomCode: string) {
    this.duration = duration;
    this.eraData = this.loadAllEras();
    this.disasterEngine = new DisasterEngine();
    this.lastTick = Date.now();
    this.state = this.initializeState(duration, roomCode);
  }

  private loadAllEras(): EraData[] {
    const dataDir = path.join(__dirname, '../data');
    const files = [
      'era1_1965_drought.json',
      'era2_1972_deccan.json',
      'era3_1987_reservoir.json',
      'era4_1999_cyclone.json',
    ];
    return files.map((f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8')));
  }

  private initializeState(duration: GameDuration, roomCode: string): GameState {
    const config = DURATION_CONFIG[duration];
    const era = this.eraData[0];
    const totalSeconds = config.totalMinutes * 60;
    const eraTotalSeconds = config.eraMinutes * 60;

    return {
      phase: 'PREP',
      currentEraIndex: 0,
      currentEra: era,
      players: [
        this.createPlayer(1, 'Player 1', era),
        this.createPlayer(2, 'Player 2', era),
      ],
      shared: {
        aquifer: era.startingResources.sharedAquifer ?? 70,
        canal: era.startingResources.sharedCanal ?? 60,
      },
      environment: this.createEnvironment(era),
      market: this.createMarket(era),
      elapsedSeconds: 0,
      totalSeconds,
      eraElapsedSeconds: 0,
      eraTotalSeconds,
      disasterActive: false,
      disasterCountdown: eraTotalSeconds * 0.65, // disaster at ~65% of era
      speedMultiplier: 1,
      isPaused: false,
      roomCode,
      events: [],
    };
  }

  private createPlayer(id: PlayerId, name: string, era: EraData): PlayerState {
    const res = era.startingResources;
    return {
      id,
      name,
      cash: res.playerCash ?? 500,
      food: res.playerFood ?? 80,
      water: res.playerWater ?? 60,
      soilHealthIndex: res.playerSoilHealth ?? 70,
      plots: this.createPlots(res.playerSoilHealth ?? 70),
      cursorPosition: 0,
      selectedCropIndex: 0,
      score: 0,
      cattle: res.cattle
        ? { ...res.cattle }
        : null,
      isAI: false,
    };
  }

  private createPlots(soilHealth: number): Plot[] {
    const plots: Plot[] = [];
    for (let i = 0; i < 6; i++) {
      plots.push({
        id: i,
        status: 'EMPTY',
        crop: null,
        growthProgress: 0,
        waterLevel: 40,
        soilHealth: soilHealth,
        salinity: 0,
        organicMatter: 30,
        hasBund: false,
        fertilizerType: 'none',
        lastIrrigatedAt: 0,
      });
    }
    return plots;
  }

  private createEnvironment(era: EraData): EnvironmentState {
    const env = era.environment;
    return {
      rainfall: env.baseRainfall ?? 1.0,
      temperature: env.baseTemperature ?? 35,
      waterEvaporationRate: env.waterEvaporationRate ?? 1.0,
      aquiferRechargeRate: env.aquiferRechargeRate ?? 1.0,
      canalSupply: env.canalSupply ?? 0.5,
      reservoirLevel: env.reservoirLevel ?? 0.5,
      windSpeed: env.windSpeed ?? 10,
      salinityBaseline: env.salinityBaseline ?? 1.0,
    };
  }

  private createMarket(era: EraData): Record<string, MarketPrice> {
    const market: Record<string, MarketPrice> = {};
    if (era.marketPrices) {
      for (const [cropId, priceData] of Object.entries(era.marketPrices)) {
        market[cropId] = {
          base: priceData.base,
          volatility: priceData.volatility,
          current: priceData.base,
        };
      }
    }
    return market;
  }

  setPlayerName(playerId: PlayerId, name: string): void {
    const idx = playerId - 1;
    this.state.players[idx].name = name;
  }

  setPlayerAI(playerId: PlayerId, isAI: boolean): void {
    const idx = playerId - 1;
    this.state.players[idx].isAI = isAI;
  }

  tick(): void {
    if (this.state.isPaused || this.state.phase === 'GAME_OVER') return;

    const now = Date.now();
    const rawDelta = (now - this.lastTick) / 1000;
    const delta = rawDelta * this.state.speedMultiplier;
    this.lastTick = now;

    // Update timers
    this.state.elapsedSeconds += delta;
    this.state.eraElapsedSeconds += delta;

    // Check disaster countdown
    if (!this.state.disasterActive) {
      this.state.disasterCountdown -= delta;
      if (this.state.disasterCountdown <= 0) {
        this.triggerDisaster();
      }
    }

    // Update environment
    this.updateEnvironment(delta);

    // Update each player's plots
    for (const player of this.state.players) {
      this.updatePlayer(player, delta);
    }

    // Update shared resources
    this.updateSharedResources(delta);

    // Update market prices
    this.updateMarketPrices(delta);

    // Check era transition
    if (this.state.eraElapsedSeconds >= this.state.eraTotalSeconds) {
      this.transitionEra();
    }

    // Check game over
    if (this.state.elapsedSeconds >= this.state.totalSeconds) {
      this.endGame();
    }

    // Trim old events (keep last 20)
    if (this.state.events.length > 20) {
      this.state.events = this.state.events.slice(-20);
    }
  }

  private updateEnvironment(delta: number): void {
    // Natural rainfall variation
    const env = this.state.environment;
    const era = this.state.currentEra;
    if (!era) return;

    // Slight random fluctuation in rainfall
    const baseRainfall = era.environment.baseRainfall ?? 1.0;
    env.rainfall = baseRainfall + (Math.random() - 0.5) * 0.1;
    env.rainfall = Math.max(0, Math.min(5, env.rainfall));
  }

  private updatePlayer(player: PlayerState, delta: number): void {
    // Food consumption: 0.5 units per second (family needs to eat)
    player.food -= 0.5 * delta;
    if (player.food < 0) {
      player.food = 0;
      // Starvation penalty — lose score
      player.score -= 2 * delta;
    }

    // Cattle management
    if (player.cattle && player.cattle.alive) {
      this.updateCattle(player, delta);
    }

    // Update each plot
    for (const plot of player.plots) {
      this.updatePlot(plot, player, delta);
    }

    // Calculate aggregate SHI
    const totalSH = player.plots.reduce((sum, p) => sum + p.soilHealth, 0);
    player.soilHealthIndex = totalSH / player.plots.length;
  }

  private updateCattle(player: PlayerState, delta: number): void {
    const cattle = player.cattle!;
    // Cattle consume fodder and water
    const fodderCost = cattle.fodderNeedPerMin * delta / 60;
    const waterCost = cattle.waterNeedPerMin * delta / 60;

    // Fodder comes from food supply
    if (player.food >= fodderCost) {
      player.food -= fodderCost;
    } else {
      cattle.health -= 15 * delta; // Starving
    }

    // Water comes from player's water supply
    if (player.water >= waterCost) {
      player.water -= waterCost;
    } else {
      cattle.health -= 15 * delta; // Dehydrating
    }

    cattle.health = Math.max(0, Math.min(100, cattle.health));

    if (cattle.health <= 0) {
      cattle.alive = false;
      this.addEvent(player.id, '🐄 Your cattle has died! Plowing will take 2x longer.', 'death');
    }
  }

  private updatePlot(plot: Plot, player: PlayerState, delta: number): void {
    const env = this.state.environment;

    // Water evaporation
    plot.waterLevel -= env.waterEvaporationRate * 0.3 * delta;
    plot.waterLevel = Math.max(0, Math.min(100, plot.waterLevel));

    // Natural rainfall adds water
    if (env.rainfall > 0.5) {
      plot.waterLevel += env.rainfall * 0.2 * delta;
      plot.waterLevel = Math.min(100, plot.waterLevel);
    }

    // Soil health natural decay
    if (plot.fertilizerType === 'chemical') {
      plot.soilHealth -= 0.15 * delta; // Chemical fert degrades soil
    }
    // Organic matter slowly improves soil
    if (plot.organicMatter > 40) {
      plot.soilHealth += 0.03 * delta;
    }
    plot.soilHealth = Math.max(0, Math.min(100, plot.soilHealth));

    // Crop growth
    if (plot.status === 'GROWING' && plot.crop) {
      const crop = plot.crop;
      const waterOk = plot.waterLevel > crop.waterNeed * 10;
      const saltOk = plot.salinity <= crop.saltTolerance;

      if (waterOk && saltOk) {
        // Growth speed based on water and soil health
        const growthRate = (100 / crop.growthTimeSeconds) * delta;
        const soilMultiplier = 0.5 + (plot.soilHealth / 200); // 0.5–1.0
        plot.growthProgress += growthRate * soilMultiplier;

        if (plot.growthProgress >= 100) {
          plot.growthProgress = 100;
          plot.status = 'READY';
          this.addEvent(player.id, `🌾 ${crop.name} is ready to harvest!`, 'harvest');
        }
      } else if (!saltOk) {
        // Salt damage
        plot.status = 'WITHERED';
        this.addEvent(player.id, `☠️ ${crop.name} died from salt damage (${plot.salinity.toFixed(1)} dS/m)`, 'death');
      } else if (plot.waterLevel <= 0) {
        // Check drought tolerance
        if (Math.random() > crop.droughtTolerance) {
          plot.status = 'WITHERED';
          this.addEvent(player.id, `🏜️ ${crop.name} withered from drought!`, 'death');
        }
      }
    }

    // Withered crops decay
    if (plot.status === 'WITHERED') {
      plot.organicMatter += 0.05 * delta; // Dead crop becomes organic matter
    }
  }

  private updateSharedResources(delta: number): void {
    const env = this.state.environment;

    // Aquifer recharge from rainfall
    this.state.shared.aquifer += env.aquiferRechargeRate * env.rainfall * 0.1 * delta;
    this.state.shared.aquifer = Math.max(0, Math.min(100, this.state.shared.aquifer));

    // Canal replenishment from reservoir
    this.state.shared.canal = env.canalSupply * env.reservoirLevel * 100;
    this.state.shared.canal = Math.max(0, Math.min(100, this.state.shared.canal));
  }

  private updateMarketPrices(delta: number): void {
    // Market prices fluctuate slightly each tick
    for (const [cropId, price] of Object.entries(this.state.market)) {
      const change = (Math.random() - 0.5) * price.volatility * 0.1;
      price.current = Math.max(price.base * 0.6, Math.min(price.base * 1.8, price.current + change));
    }
  }

  private triggerDisaster(): void {
    this.state.disasterActive = true;
    this.state.phase = 'CALAMITY';

    const era = this.state.currentEra;
    if (!era) return;

    this.addEvent(null, `⚠️ ${era.disaster.name} — ${era.disaster.triggerDescription}`, 'disaster');

    // Apply disaster effects via DisasterEngine
    this.disasterEngine.applyDisaster(this.state, era);
  }

  private transitionEra(): void {
    const nextIndex = this.state.currentEraIndex + 1;
    if (nextIndex >= this.eraData.length) {
      this.endGame();
      return;
    }

    this.state.currentEraIndex = nextIndex;
    const era = this.eraData[nextIndex];
    this.state.currentEra = era;
    this.state.phase = 'ERA_TRANSITION';
    this.state.eraElapsedSeconds = 0;
    this.state.disasterActive = false;

    const config = DURATION_CONFIG[this.duration];
    this.state.eraTotalSeconds = config.eraMinutes * 60;
    this.state.disasterCountdown = this.state.eraTotalSeconds * 0.65;

    // Update environment
    this.state.environment = this.createEnvironment(era);

    // Update market
    this.state.market = this.createMarket(era);

    // Update shared resources (blend with current)
    this.state.shared.aquifer = Math.min(100,
      this.state.shared.aquifer * 0.5 + (era.startingResources.sharedAquifer ?? 70) * 0.5
    );
    this.state.shared.canal = era.startingResources.sharedCanal ?? 60;

    // Give players era-specific starting resources (blended)
    for (const player of this.state.players) {
      player.cash += era.startingResources.playerCash * 0.3; // 30% bonus cash for new era
      player.food = Math.max(player.food, era.startingResources.playerFood * 0.5);
      player.water = Math.max(player.water, era.startingResources.playerWater * 0.5);

      // Cattle for eras that have them
      if (era.startingResources.cattle && !player.cattle) {
        player.cattle = { ...era.startingResources.cattle };
      }

      // Reset cursor and selected crop
      player.selectedCropIndex = 0;
    }

    this.addEvent(null, `📜 Era ${nextIndex + 1}: ${era.name} (${era.year}) — ${era.region}`, 'info');

    // After a short delay, transition to PREP phase
    setTimeout(() => {
      if (this.state.phase === 'ERA_TRANSITION') {
        this.state.phase = 'PREP';
      }
    }, 3000);
  }

  private endGame(): void {
    this.state.phase = 'GAME_OVER';

    // Calculate final scores
    for (const player of this.state.players) {
      this.calculateFinalScore(player);
    }
  }

  private calculateFinalScore(player: PlayerState): void {
    let score = 0;

    // Cash component (30%)
    score += player.cash * 0.3;

    // Food buffer (20%)
    score += player.food * 2;

    // Soil Health Index (25%)
    score += player.soilHealthIndex * 5;

    // Heritage bonus — survived with indigenous crops (15%)
    const indigenousCrops = player.plots.filter(
      p => p.crop && p.crop.category === 'INDIGENOUS' && p.status !== 'WITHERED'
    ).length;
    score += indigenousCrops * 50;

    // Aquifer conservation bonus (10%)
    score += this.state.shared.aquifer * 2;

    // Cattle alive bonus
    if (player.cattle && player.cattle.alive) {
      score += 100;
    }

    player.score = Math.round(score);
  }

  dispatchAction(playerId: PlayerId, action: GameAction): void {
    dispatchAction(this.state, playerId, action, this);
  }

  addEvent(playerId: PlayerId | null, message: string, type: GameEvent['type']): void {
    this.state.events.push({
      id: `evt_${++this.eventIdCounter}`,
      timestamp: this.state.elapsedSeconds,
      playerId,
      message,
      type,
    });
  }

  getState(): GameState {
    return this.state;
  }

  toggleSpeed(): void {
    const speeds = [1, 2, 4];
    const idx = speeds.indexOf(this.state.speedMultiplier);
    this.state.speedMultiplier = speeds[(idx + 1) % speeds.length];
  }

  togglePause(): void {
    this.state.isPaused = !this.state.isPaused;
    if (!this.state.isPaused) {
      this.lastTick = Date.now(); // Reset tick to avoid time jump
    }
  }
}
