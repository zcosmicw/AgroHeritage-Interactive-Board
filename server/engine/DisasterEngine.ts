// ============================================================
// Disaster Engine — Applies era-specific disaster effects
// ============================================================

import type {
  GameState,
  EraData,
  PlayerState,
  Plot,
} from '../../shared/types.js';

export class DisasterEngine {

  applyDisaster(state: GameState, era: EraData): void {
    const eraId = era.id;

    switch (eraId) {
      case 'ERA_1_DROUGHT_1965':
        this.applyDrought1965(state, era);
        break;
      case 'ERA_2_DECCAN_1972':
        this.applyDeccan1972(state, era);
        break;
      case 'ERA_3_RESERVOIR_1987':
        this.applyReservoir1987(state, era);
        break;
      case 'ERA_4_CYCLONE_1999':
        this.applyCyclone1999(state, era);
        break;
    }
  }

  private applyDrought1965(state: GameState, era: EraData): void {
    const m = era.disaster.mechanics;

    // Slash rainfall
    state.environment.rainfall *= m.rainfallMultiplier ?? 0.4;

    // Reduce water replenishment
    state.environment.aquiferRechargeRate *= m.waterReplenishmentMultiplier ?? 0.4;

    // Increase evaporation (soil moisture drain)
    state.environment.waterEvaporationRate += m.soilMoistureDrain ?? 2.5;

    for (const player of state.players) {
      // Food consumption increases 20% (heat stress)
      player.food -= player.food * 0.2;

      for (const plot of player.plots) {
        if (!plot.crop) continue;

        // High water-need crops lose 85% yield
        if (plot.crop.waterNeed > 2.0) {
          plot.growthProgress *= 0.15;
          if (plot.status === 'GROWING') {
            plot.status = 'WITHERED';
          }
        }

        // Drought-tolerant crops survive at reduced yield
        if (plot.crop.droughtTolerance > 0.70) {
          // These crops are hardy — they survive but at reduced output
          // (handled in yield calculation during harvest)
        } else if (plot.crop.droughtTolerance < 0.30) {
          // Low tolerance crops wither immediately
          if (plot.status === 'GROWING') {
            plot.status = 'WITHERED';
          }
        }

        // Drain plot water
        plot.waterLevel *= 0.3;
      }
    }

    // Aquifer drops significantly
    state.shared.aquifer *= 0.5;
  }

  private applyDeccan1972(state: GameState, era: EraData): void {
    const m = era.disaster.mechanics;

    // Groundwater collapse
    state.shared.aquifer *= 0.3;

    // Double well pump costs (handled in ActionHandler via era mechanics)

    for (const player of state.players) {
      // Cattle stress — immediate health hit
      if (player.cattle && player.cattle.alive) {
        player.cattle.health -= 30;
        if (player.cattle.health <= 0) {
          player.cattle.alive = false;
          player.cattle.health = 0;
        }
      }

      for (const plot of player.plots) {
        if (!plot.crop) continue;

        // Commercial crops suffer heavily
        if (plot.crop.category === 'COMMERCIAL') {
          plot.growthProgress *= 0.2;
          if (plot.status === 'GROWING' && Math.random() > 0.3) {
            plot.status = 'WITHERED';
          }
        }

        // Salinization from over-pumping
        if (Math.random() < (m.salinizationChance ?? 0.3)) {
          plot.salinity += 3;
        }

        // Water drain
        plot.waterLevel *= 0.4;
      }
    }
  }

  private applyReservoir1987(state: GameState, era: EraData): void {
    const m = era.disaster.mechanics;

    // Complete canal shutdown
    state.shared.canal = 0;
    state.environment.canalSupply = 0;
    state.environment.reservoirLevel = 0;

    for (const player of state.players) {
      for (const plot of player.plots) {
        if (!plot.crop) continue;

        // Fertilizer burn: chemical fert + low water = yield death
        if (plot.crop.chemFertNeed > 0 && plot.waterLevel < (m.fertilizerBurnThreshold ?? 30)) {
          plot.growthProgress = 0;
          plot.status = 'WITHERED';
          plot.soilHealth -= 20; // Chemical burn damages soil
        }

        // Organic matter buffer
        if (plot.organicMatter > 40) {
          // Extra survival ticks — crop doesn't die immediately
          plot.waterLevel += plot.organicMatter * (m.organicMatterBufferMultiplier ?? 0.3);
        }

        // High SHI bonus
        if (plot.soilHealth > (m.highSHIThreshold ?? 70)) {
          plot.waterLevel += 10; // Healthy soil retains moisture
        }

        // Commercial crops without water wither
        if (plot.crop.category === 'COMMERCIAL' && plot.waterLevel < 20) {
          plot.status = 'WITHERED';
        }
      }
    }

    // Aquifer stress
    state.shared.aquifer *= 0.6;
  }

  private applyCyclone1999(state: GameState, era: EraData): void {
    const m = era.disaster.mechanics;
    const salinitySpike = m.salinitySpike ?? { min: 12, max: 16 };

    for (const player of state.players) {
      // 70% chance cattle dies from flooding
      if (player.cattle && player.cattle.alive) {
        if (Math.random() < (m.cattleFloodDeathChance ?? 0.7)) {
          player.cattle.alive = false;
          player.cattle.health = 0;
        }
      }

      // Infrastructure damage — lose 50% cash
      const cashLoss = player.cash * ((m.infrastructureDamagePercent ?? 50) / 100);
      player.cash -= cashLoss;

      for (const plot of player.plots) {
        // Salinity spike
        const plotSalinity = salinitySpike.min + Math.random() * (salinitySpike.max - salinitySpike.min);

        // Bund protection reduces salinity by 40%
        if (plot.hasBund) {
          plot.salinity = plotSalinity * 0.6;
        } else {
          plot.salinity = plotSalinity;
          // Non-bunded plots are flooded
          plot.status = plot.crop ? 'FLOODED' : plot.status;
          plot.waterLevel = 100; // Flooded
        }

        if (!plot.crop) continue;

        // Salt tolerance check
        if (plot.crop.saltTolerance < plot.salinity) {
          // Immediate salt rot
          plot.status = 'WITHERED';
          plot.growthProgress = 0;
        } else if (plot.crop.id === 'pokkali_rice' && plot.salinity <= 15) {
          // Pokkali survives at 60% yield
          plot.growthProgress *= 0.6;
        }

        // Wind damage
        if (plot.crop.resilienceScore < 40 && !plot.hasBund) {
          plot.status = 'WITHERED';
        }
      }
    }

    // Flooding raises aquifer (too much water, not too little)
    state.shared.aquifer = 100;
    state.shared.canal = 100;

    // But environment becomes saline
    state.environment.salinityBaseline = salinitySpike.min;
  }
}
