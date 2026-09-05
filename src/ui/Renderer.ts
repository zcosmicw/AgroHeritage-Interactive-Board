// ============================================================
// Renderer — Main UI renderer, subscribes to state updates
// ============================================================

import type { GameState, PlayerState, Plot, EraData, DisasterConfig, CropConfig } from '../../shared/types';

// Crop emoji mapping
const CROP_ICONS: Record<string, string> = {
  bajra: '🌾', ragi: '🌿', jowar: '🌽', wheat_local: '🌾',
  hybrid_paddy: '🍚', sugarcane: '🎋', tur_dal: '🫘', groundnut: '🥜',
  cotton: '🧶', arhar_tur: '🫘', hyv_wheat: '🌾', hyv_rice: '🍚',
  cotton_hybrid: '🧶', pokkali_rice: '🍚', standard_paddy: '🍚',
  coconut: '🥥', betel_vine: '🌿', vegetables: '🥬',
};

const STATUS_LABELS: Record<string, string> = {
  EMPTY: '⬜ Empty', PREPPED: '🟫 Prepped', GROWING: '🌱 Growing',
  READY: '✅ Ready!', WITHERED: '💀 Withered', FLOODED: '🌊 Flooded',
};

export class Renderer {
  private lastEventCount: number = 0;
  private weatherParticlesCreated: boolean = false;
  private lastDisasterState: boolean = false;
  private eraTransitionTimeout: ReturnType<typeof setTimeout> | null = null;
  private crisisTimeout: ReturnType<typeof setTimeout> | null = null;

  render(state: GameState): void {
    this.renderTopBar(state);
    this.renderPlayer(state, state.players[0], 'p1');
    this.renderPlayer(state, state.players[1], 'p2');
    this.renderCenterPanel(state);
    this.renderBottomBar(state);
    this.renderWeatherEffects(state);
  }

  private renderTopBar(state: GameState): void {
    const era = state.currentEra;
    const eraEl = document.getElementById('topbar-era');
    const timerEl = document.getElementById('topbar-timer');
    const progressEl = document.getElementById('topbar-progress');

    if (eraEl && era) {
      eraEl.textContent = `Era ${state.currentEraIndex + 1}: ${era.name} (${era.year})`;
    }

    if (timerEl) {
      const remaining = Math.max(0, state.eraTotalSeconds - state.eraElapsedSeconds);
      timerEl.textContent = this.formatTime(remaining);
      if (remaining < 30) {
        timerEl.style.color = 'var(--color-crisis-red)';
      } else {
        timerEl.style.color = '';
      }
    }

    if (progressEl) {
      const progress = (state.eraElapsedSeconds / state.eraTotalSeconds) * 100;
      progressEl.style.width = `${Math.min(100, progress)}%`;
    }
  }

  private renderPlayer(state: GameState, player: PlayerState, prefix: string): void {
    // Name & Score
    const nameEl = document.getElementById(`${prefix}-name`);
    const scoreEl = document.getElementById(`${prefix}-score`);
    if (nameEl) nameEl.textContent = player.name + (player.isAI ? ' 🤖' : '');
    if (scoreEl) scoreEl.textContent = player.score.toLocaleString();

    // Plots
    this.renderPlots(player, prefix);

    // Resources
    this.renderResources(player, prefix);

    // Crop selector
    this.renderCropSelector(state, player, prefix);
  }

  private renderPlots(player: PlayerState, prefix: string): void {
    const container = document.getElementById(`${prefix}-plots`);
    if (!container) return;

    // Build/update plot cells
    if (container.children.length !== 6) {
      container.innerHTML = '';
      for (let i = 0; i < 6; i++) {
        const cell = document.createElement('div');
        cell.className = 'plot-cell';
        cell.id = `${prefix}-plot-${i}`;
        cell.innerHTML = `
          <div class="plot-cell__bund-badge" style="display:none">🧱</div>
          <div class="plot-cell__water-bar"><div class="plot-cell__water-fill"></div></div>
          <div class="plot-cell__crop-icon"></div>
          <div class="plot-cell__crop-name"></div>
          <div class="plot-cell__status-label"></div>
          <div class="plot-cell__progress"></div>
        `;
        container.appendChild(cell);
      }
    }

    for (let i = 0; i < 6; i++) {
      const plot = player.plots[i];
      const cell = container.children[i] as HTMLElement;
      if (!cell || !plot) continue;

      // Status class
      cell.className = `plot-cell status-${plot.status.toLowerCase()}`;
      if (player.cursorPosition === i) {
        cell.classList.add('cursor');
      }

      // Bund badge
      const bundEl = cell.querySelector('.plot-cell__bund-badge') as HTMLElement;
      if (bundEl) bundEl.style.display = plot.hasBund ? 'block' : 'none';

      // Water bar
      const waterFill = cell.querySelector('.plot-cell__water-fill') as HTMLElement;
      if (waterFill) waterFill.style.height = `${Math.min(100, plot.waterLevel)}%`;

      // Crop icon & name
      const iconEl = cell.querySelector('.plot-cell__crop-icon') as HTMLElement;
      const nameEl = cell.querySelector('.plot-cell__crop-name') as HTMLElement;
      const statusEl = cell.querySelector('.plot-cell__status-label') as HTMLElement;

      if (plot.crop) {
        if (iconEl) iconEl.textContent = CROP_ICONS[plot.crop.id] || '🌱';
        if (nameEl) nameEl.textContent = plot.crop.hindiName || plot.crop.name;
      } else {
        if (iconEl) iconEl.textContent = plot.status === 'PREPPED' ? '🟫' : '';
        if (nameEl) nameEl.textContent = '';
      }

      if (statusEl) statusEl.textContent = STATUS_LABELS[plot.status] || plot.status;

      // Growth progress bar
      const progressEl = cell.querySelector('.plot-cell__progress') as HTMLElement;
      if (progressEl) {
        progressEl.style.width = `${plot.growthProgress}%`;
        if (plot.status === 'READY') {
          progressEl.style.background = 'var(--color-wheat-gold)';
        } else {
          progressEl.style.background = 'var(--color-harvest-green)';
        }
      }
    }
  }

  private renderResources(player: PlayerState, prefix: string): void {
    const container = document.getElementById(`${prefix}-resources`);
    if (!container) return;

    const gauges = [
      { icon: '🍞', label: 'Food', value: player.food, max: 200, cls: 'food' },
      { icon: '💰', label: 'Cash', value: player.cash, max: 2000, cls: 'cash' },
      { icon: '💧', label: 'Water', value: player.water, max: 100, cls: 'water' },
      { icon: '🌱', label: 'SHI', value: player.soilHealthIndex, max: 100, cls: 'soil' },
    ];

    if (container.children.length !== gauges.length) {
      container.innerHTML = gauges.map(g => `
        <div class="gauge">
          <span class="gauge__icon">${g.icon}</span>
          <span class="gauge__label">${g.label}</span>
          <div class="gauge__bar">
            <div class="gauge__fill ${g.cls}" style="width: 0%"></div>
          </div>
          <span class="gauge__value">0</span>
        </div>
      `).join('');
    }

    gauges.forEach((g, i) => {
      const gauge = container.children[i] as HTMLElement;
      if (!gauge) return;
      const fill = gauge.querySelector('.gauge__fill') as HTMLElement;
      const value = gauge.querySelector('.gauge__value') as HTMLElement;
      const pct = Math.min(100, (g.value / g.max) * 100);
      if (fill) fill.style.width = `${pct}%`;
      if (value) {
        if (g.cls === 'cash') {
          value.textContent = `₹${Math.round(g.value)}`;
        } else {
          value.textContent = `${Math.round(g.value)}`;
        }
      }
    });
  }

  private renderCropSelector(state: GameState, player: PlayerState, prefix: string): void {
    const container = document.getElementById(`${prefix}-crop-selector`);
    if (!container || !state.currentEra) return;

    const crops = state.currentEra.availableCrops;
    const selected = crops[player.selectedCropIndex];
    if (!selected) return;

    container.innerHTML = `
      <div class="crop-selector__title">Selected Seed</div>
      <div class="crop-selector__current">
        <span>${CROP_ICONS[selected.id] || '🌱'}</span>
        <div>
          <div class="crop-selector__name">${selected.name}</div>
          <div class="crop-selector__hindi">${selected.hindiName}</div>
          <div class="crop-selector__stats">
            <span class="crop-selector__category ${selected.category.toLowerCase()}">${selected.category}</span>
            <span>💰₹${selected.seedCost}</span>
            <span>💧${selected.waterNeed}</span>
            <span>📊${selected.baseYield}</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderCenterPanel(state: GameState): void {
    // Disaster alert
    const alertEl = document.getElementById('disaster-alert');
    const alertNameEl = document.getElementById('disaster-name');
    const alertDescEl = document.getElementById('disaster-desc');

    if (alertEl) {
      if (state.disasterActive && state.currentEra) {
        alertEl.classList.add('active');
        if (alertNameEl) alertNameEl.textContent = state.currentEra.disaster.name;
        if (alertDescEl) alertDescEl.textContent = state.currentEra.disaster.triggerDescription;

        // Show crisis modal on first disaster activation
        if (!this.lastDisasterState && state.disasterActive) {
          this.showCrisisModal(state.currentEra.disaster);
        }
      } else {
        alertEl.classList.remove('active');
      }
    }
    this.lastDisasterState = state.disasterActive;

    // Shared resources
    this.renderSharedResources(state);

    // Market prices
    this.renderMarketPrices(state);

    // Event log
    this.renderEventLog(state);
  }

  private renderSharedResources(state: GameState): void {
    const container = document.getElementById('shared-resources');
    if (!container) return;

    const resources = [
      { icon: '🏔️', label: 'Aquifer', value: state.shared.aquifer, max: 100, cls: 'water' },
      { icon: '🚰', label: 'Canal', value: state.shared.canal, max: 100, cls: 'water' },
    ];

    container.innerHTML = resources.map(r => `
      <div class="gauge">
        <span class="gauge__icon">${r.icon}</span>
        <span class="gauge__label">${r.label}</span>
        <div class="gauge__bar">
          <div class="gauge__fill ${r.cls}" style="width: ${Math.min(100, (r.value / r.max) * 100)}%"></div>
        </div>
        <span class="gauge__value">${Math.round(r.value)}</span>
      </div>
    `).join('');
  }

  private renderMarketPrices(state: GameState): void {
    const container = document.getElementById('market-prices');
    if (!container) return;

    const entries = Object.entries(state.market);
    container.innerHTML = entries.map(([cropId, price]) => `
      <div class="market-row">
        <span class="market-row__name">${CROP_ICONS[cropId] || ''} ${cropId}</span>
        <span class="market-row__price">₹${price.current.toFixed(0)}/q</span>
      </div>
    `).join('');
  }

  private renderEventLog(state: GameState): void {
    const container = document.getElementById('event-log');
    if (!container) return;

    // Only update if new events
    if (state.events.length === this.lastEventCount) return;

    const newEvents = state.events.slice(this.lastEventCount);
    this.lastEventCount = state.events.length;

    for (const evt of newEvents) {
      const item = document.createElement('div');
      item.className = `event-log__item ${evt.type}`;
      item.textContent = evt.message;
      container.appendChild(item);
    }

    // Auto-scroll
    container.scrollTop = container.scrollHeight;

    // Trim old DOM events
    while (container.children.length > 30) {
      container.removeChild(container.firstChild!);
    }
  }

  private renderBottomBar(state: GameState): void {
    const elapsedEl = document.getElementById('bottombar-elapsed');
    const speedEl = document.getElementById('bottombar-speed');
    const eraEl = document.getElementById('bottombar-era');
    const roomEl = document.getElementById('bottombar-room');
    const cattleEl = document.getElementById('bottombar-cattle');

    if (elapsedEl) elapsedEl.textContent = this.formatTime(state.elapsedSeconds);
    if (speedEl) speedEl.textContent = `${state.speedMultiplier}x`;
    if (eraEl) eraEl.textContent = `${state.currentEraIndex + 1}/4`;
    if (roomEl) roomEl.textContent = state.roomCode;

    // Cattle status (from P1)
    if (cattleEl) {
      const p1Cattle = state.players[0].cattle;
      if (p1Cattle) {
        cattleEl.innerHTML = p1Cattle.alive
          ? `🐄 Cattle: <span style="color: var(--color-harvest-green)">${Math.round(p1Cattle.health)}%</span>`
          : `🐄 Cattle: <span style="color: var(--color-crisis-red)">Dead</span>`;
      } else {
        cattleEl.textContent = '';
      }
    }
  }

  private renderWeatherEffects(state: GameState): void {
    if (!this.weatherParticlesCreated) {
      this.createWeatherParticles();
      this.weatherParticlesCreated = true;
    }

    const dustEl = document.getElementById('weather-dust');
    const rainEl = document.getElementById('weather-rain');

    if (!state.currentEra) return;

    // Drought eras: show dust
    if (dustEl) {
      const isDrought = state.environment.rainfall < 0.6;
      dustEl.classList.toggle('active', isDrought && state.disasterActive);
    }

    // Cyclone era: show rain
    if (rainEl) {
      const isRain = state.environment.rainfall > 2.0;
      rainEl.classList.toggle('active', isRain);
    }
  }

  private createWeatherParticles(): void {
    const dustContainer = document.getElementById('weather-dust');
    const rainContainer = document.getElementById('weather-rain');

    if (dustContainer) {
      for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'dust-particle';
        p.style.left = `${Math.random() * -20}%`;
        p.style.top = `${Math.random() * 100}%`;
        p.style.animationDuration = `${3 + Math.random() * 5}s`;
        p.style.animationDelay = `${Math.random() * 5}s`;
        p.style.width = `${2 + Math.random() * 3}px`;
        p.style.height = p.style.width;
        dustContainer.appendChild(p);
      }
    }

    if (rainContainer) {
      for (let i = 0; i < 60; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = `${Math.random() * 100}%`;
        drop.style.animationDuration = `${0.4 + Math.random() * 0.3}s`;
        drop.style.animationDelay = `${Math.random() * 2}s`;
        drop.style.height = `${15 + Math.random() * 15}px`;
        rainContainer.appendChild(drop);
      }
    }
  }

  // --- Overlays ---

  showEraTransition(era: EraData): void {
    const el = document.getElementById('era-transition');
    const yearEl = document.getElementById('era-year');
    const nameEl = document.getElementById('era-name');
    const regionEl = document.getElementById('era-region');
    const contextEl = document.getElementById('era-context');

    if (el) {
      if (yearEl) yearEl.textContent = era.year;
      if (nameEl) nameEl.textContent = era.name;
      if (regionEl) regionEl.textContent = era.region;
      if (contextEl) contextEl.textContent = era.historicalContext;

      el.classList.add('active');

      if (this.eraTransitionTimeout) clearTimeout(this.eraTransitionTimeout);
      this.eraTransitionTimeout = setTimeout(() => {
        el.classList.remove('active');
      }, 4000);
    }
  }

  showCrisisModal(disaster: DisasterConfig): void {
    const el = document.getElementById('crisis-modal');
    const iconEl = document.getElementById('crisis-icon');
    const titleEl = document.getElementById('crisis-title');
    const descEl = document.getElementById('crisis-desc-text');

    if (el) {
      // Determine icon based on disaster name
      let icon = '⚠️';
      if (disaster.name.includes('सूखा') || disaster.name.includes('Drought')) icon = '🏜️';
      if (disaster.name.includes('चक्रवात') || disaster.name.includes('Cyclone')) icon = '🌪️';
      if (disaster.name.includes('भूजल') || disaster.name.includes('Groundwater')) icon = '🕳️';
      if (disaster.name.includes('जलाशय') || disaster.name.includes('Reservoir')) icon = '🏗️';

      if (iconEl) iconEl.textContent = icon;
      if (titleEl) titleEl.textContent = disaster.name;
      if (descEl) descEl.textContent = disaster.triggerDescription;

      el.classList.add('active');

      if (this.crisisTimeout) clearTimeout(this.crisisTimeout);
      this.crisisTimeout = setTimeout(() => {
        el.classList.remove('active');
      }, 4000);
    }
  }

  // --- Screens ---

  showScreen(screenId: string): void {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
  }

  // --- Game Over ---

  renderGameOver(state: GameState): void {
    const winnerEl = document.getElementById('gameover-winner');
    const scoresEl = document.getElementById('gameover-scores');
    const lessonEl = document.getElementById('gameover-lesson-text');

    const p1 = state.players[0];
    const p2 = state.players[1];
    const winner = p1.score >= p2.score ? p1 : p2;
    const loser = p1.score >= p2.score ? p2 : p1;

    if (winnerEl) {
      winnerEl.textContent = `🏆 ${winner.name} wins with ${winner.score.toLocaleString()} points!`;
    }

    if (scoresEl) {
      scoresEl.innerHTML = [p1, p2].map(player => {
        const isWinner = player.id === winner.id;
        return `
          <div class="score-card ${isWinner ? 'winner' : ''}">
            <div class="score-card__name">${player.name}</div>
            <div class="score-card__total">${player.score.toLocaleString()}</div>
            <div class="score-card__breakdown">
              <div class="score-card__row">
                <span class="score-card__row-label">💰 Cash</span>
                <span class="score-card__row-value">₹${Math.round(player.cash)}</span>
              </div>
              <div class="score-card__row">
                <span class="score-card__row-label">🍞 Food Buffer</span>
                <span class="score-card__row-value">${Math.round(player.food)}</span>
              </div>
              <div class="score-card__row">
                <span class="score-card__row-label">🌱 Soil Health</span>
                <span class="score-card__row-value">${Math.round(player.soilHealthIndex)}</span>
              </div>
              <div class="score-card__row">
                <span class="score-card__row-label">🐄 Cattle</span>
                <span class="score-card__row-value">${player.cattle ? (player.cattle.alive ? '✅ Alive' : '❌ Dead') : 'N/A'}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    if (lessonEl) {
      lessonEl.textContent = 'Through India\'s worst agricultural crises — from the 1965 Great Drought to the 1999 Super Cyclone — indigenous crops like Bajra, Ragi, and Jowar consistently outperformed commercial varieties. Sustainable farming practices — organic composting, soil health preservation, and water conservation — proved to be the winning strategy. The Green Revolution brought high yields but at the cost of resilience. True farming wisdom lies in working with nature, not against it.';
    }

    this.showScreen('screen-gameover');
  }

  // --- Utility ---

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
