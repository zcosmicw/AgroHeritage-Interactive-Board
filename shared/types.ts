// ============================================================
// Krishi Yuddh — Shared Types (Client + Server)
// ============================================================

// --- Enums ---

export type GamePhase = 'LOBBY' | 'PREP' | 'CALAMITY' | 'ERA_TRANSITION' | 'GAME_OVER';

export type CropCategory = 'INDIGENOUS' | 'COMMERCIAL';

export type GameDuration = 'demo' | 'quick' | 'full';

export type PlayerId = 1 | 2;

export type ActionType =
  | 'MOVE_CURSOR'
  | 'PREP_SOIL'
  | 'SOW_SEED'
  | 'IRRIGATE'
  | 'PUMP_WATER'
  | 'APPLY_FERTILIZER'
  | 'HARVEST'
  | 'BUILD_BUND'
  | 'APPLY_COMPOST'
  | 'SELECT_CROP'
  | 'CYCLE_CROP';

// --- Crop ---

export interface CropConfig {
  id: string;
  name: string;
  hindiName: string;
  category: CropCategory;
  seedCost: number;
  waterNeed: number;
  chemFertNeed: number;
  baseYield: number;
  resilienceScore: number;
  growthTimeSeconds: number;
  saltTolerance: number;
  droughtTolerance: number;
  historicalNote: string;
}

// --- Plot ---

export type PlotStatus = 'EMPTY' | 'PREPPED' | 'SOWN' | 'GROWING' | 'READY' | 'WITHERED' | 'FLOODED';

export interface Plot {
  id: number;
  status: PlotStatus;
  crop: CropConfig | null;
  growthProgress: number;       // 0–100
  waterLevel: number;           // 0–100
  soilHealth: number;           // 0–100
  salinity: number;             // dS/m
  organicMatter: number;        // 0–100
  hasBund: boolean;
  fertilizerType: 'none' | 'organic' | 'chemical';
  lastIrrigatedAt: number;
}

// --- Player State ---

export interface CattleState {
  alive: boolean;
  health: number;
  fodderNeedPerMin: number;
  waterNeedPerMin: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  cash: number;
  food: number;
  water: number;
  soilHealthIndex: number;      // Aggregate SHI across plots
  plots: Plot[];
  cursorPosition: number;       // 0–5 for 2×3 grid
  selectedCropIndex: number;    // index into era's availableCrops
  score: number;
  cattle: CattleState | null;
  isAI: boolean;
}

// --- Environment ---

export interface EnvironmentState {
  rainfall: number;
  temperature: number;
  waterEvaporationRate: number;
  aquiferRechargeRate: number;
  canalSupply: number;
  reservoirLevel: number;
  windSpeed: number;
  salinityBaseline: number;
}

// --- Shared Resources ---

export interface SharedResources {
  aquifer: number;
  canal: number;
}

// --- Market ---

export interface MarketPrice {
  base: number;
  volatility: number;
  current: number;
}

// --- Disaster ---

export interface DisasterConfig {
  name: string;
  triggerDescription: string;
  mechanics: Record<string, any>;
}

// --- Era Data (loaded from JSON) ---

export interface EraData {
  id: string;
  name: string;
  year: string;
  region: string;
  historicalContext: string;
  duration: {
    prepMinutes: number;
    calamityMinutes: number;
    totalMinutes: number;
  };
  environment: Record<string, number>;
  startingResources: Record<string, any>;
  availableCrops: CropConfig[];
  disaster: DisasterConfig;
  marketPrices: Record<string, { base: number; volatility: number }>;
}

// --- Game State ---

export interface GameState {
  phase: GamePhase;
  currentEraIndex: number;
  currentEra: EraData | null;
  players: [PlayerState, PlayerState];
  shared: SharedResources;
  environment: EnvironmentState;
  market: Record<string, MarketPrice>;
  elapsedSeconds: number;
  totalSeconds: number;
  eraElapsedSeconds: number;
  eraTotalSeconds: number;
  disasterActive: boolean;
  disasterCountdown: number;     // seconds until disaster hits
  speedMultiplier: number;
  isPaused: boolean;
  roomCode: string;
  events: GameEvent[];
}

// --- Game Events (for UI display) ---

export interface GameEvent {
  id: string;
  timestamp: number;
  playerId: PlayerId | null;
  message: string;
  type: 'info' | 'warning' | 'disaster' | 'harvest' | 'death';
}

// --- Actions ---

export interface GameAction {
  playerId: PlayerId;
  type: ActionType;
  payload?: {
    direction?: 'up' | 'down' | 'left' | 'right';
    plotIndex?: number;
    cropId?: string;
    fertilizerType?: 'organic' | 'chemical';
  };
}

// --- Socket Events ---

export interface ServerToClientEvents {
  'room:created': (roomCode: string) => void;
  'room:joined': (playerId: PlayerId, state: GameState) => void;
  'room:playerLeft': () => void;
  'room:waiting': (roomCode: string) => void;
  'game:stateUpdate': (state: GameState) => void;
  'game:eraTransition': (era: EraData) => void;
  'game:disasterAlert': (disaster: DisasterConfig) => void;
  'game:over': (finalState: GameState) => void;
  'error': (message: string) => void;
}

export interface ClientToServerEvents {
  'room:create': (playerName: string, mode: '1p' | '2p', duration: GameDuration) => void;
  'room:join': (roomCode: string, playerName: string) => void;
  'game:action': (action: GameAction) => void;
  'game:speedToggle': () => void;
  'game:pause': () => void;
}

// --- Duration configs ---

export const DURATION_CONFIG: Record<GameDuration, { totalMinutes: number; eraMinutes: number }> = {
  demo: { totalMinutes: 6, eraMinutes: 1.5 },
  quick: { totalMinutes: 12, eraMinutes: 3 },
  full: { totalMinutes: 60, eraMinutes: 15 },
};
