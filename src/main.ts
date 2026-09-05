// ============================================================
// Krishi Yuddh — कृषि युद्ध  |  Client Entry Point
// ============================================================

import './styles/main.css';
import { SocketClient } from './net/SocketClient';
import { InputManager } from './input/InputManager';
import { Renderer } from './ui/Renderer';
import type { GameDuration } from '../shared/types';

// --- Initialize ---
const client = new SocketClient();
const renderer = new Renderer();
let inputManager: InputManager | null = null;

// --- State ---
let selectedMode: '1p' | '2p' = '1p';
let selectedDuration: GameDuration = 'quick';

// --- DOM Elements ---
const btnMode1P = document.getElementById('btn-mode-1p')!;
const btnMode2P = document.getElementById('btn-mode-2p')!;
const btnCreate = document.getElementById('btn-create')!;
const btnJoin = document.getElementById('btn-join')!;
const inputName = document.getElementById('input-name') as HTMLInputElement;
const inputRoomCode = document.getElementById('input-room-code') as HTMLInputElement;
const waitingState = document.getElementById('waiting-state')!;
const roomCodeDisplay = document.getElementById('room-code-display')!;
const btnPlayAgain = document.getElementById('btn-play-again')!;

const durationBtns: Record<GameDuration, HTMLElement> = {
  demo: document.getElementById('btn-duration-demo')!,
  quick: document.getElementById('btn-duration-quick')!,
  full: document.getElementById('btn-duration-full')!,
};

// --- Lobby Logic ---

// Mode selection
btnMode1P.addEventListener('click', () => {
  selectedMode = '1p';
  btnMode1P.classList.add('selected');
  btnMode2P.classList.remove('selected');
});

btnMode2P.addEventListener('click', () => {
  selectedMode = '2p';
  btnMode2P.classList.add('selected');
  btnMode1P.classList.remove('selected');
});

// Duration selection
Object.entries(durationBtns).forEach(([dur, btn]) => {
  btn.addEventListener('click', () => {
    selectedDuration = dur as GameDuration;
    Object.values(durationBtns).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// Create game
btnCreate.addEventListener('click', () => {
  const name = inputName.value.trim() || 'Farmer';
  client.createRoom(name, selectedMode, selectedDuration);
  btnCreate.disabled = true;
  btnCreate.textContent = 'Creating...';
});

// Join game
btnJoin.addEventListener('click', () => {
  const code = inputRoomCode.value.trim().toUpperCase();
  const name = inputName.value.trim() || 'Farmer';
  if (code.length < 5) {
    alert('Please enter a valid 5-character room code');
    return;
  }
  client.joinRoom(code, name);
  (btnJoin as HTMLButtonElement).disabled = true;
});

// Play again
btnPlayAgain.addEventListener('click', () => {
  renderer.showScreen('screen-lobby');
  btnCreate.disabled = false;
  btnCreate.textContent = 'Create Game';
  (btnJoin as HTMLButtonElement).disabled = false;
  waitingState.classList.remove('visible');
  if (inputManager) {
    inputManager.unbind();
    inputManager = null;
  }
});

// --- Socket Events ---

// Room created (waiting for player 2 in 2P mode)
client.onRoomCreated((code) => {
  if (selectedMode === '2p') {
    waitingState.classList.add('visible');
    roomCodeDisplay.textContent = code;
  }
});

// Room waiting
client.onRoomWaiting((code) => {
  waitingState.classList.add('visible');
  roomCodeDisplay.textContent = code;
});

// Game starts — both players joined
client.onRoomJoined((playerId, state) => {
  console.log(`🎮 Joined as Player ${playerId}`);

  // Switch to game screen
  renderer.showScreen('screen-game');

  // Bind input for this player
  inputManager = new InputManager(client, playerId);
  inputManager.bind();

  // Initial render
  renderer.render(state);
});

// State updates — render every tick
client.onStateUpdate((state) => {
  renderer.render(state);
});

// Era transition
client.onEraTransition((era) => {
  renderer.showEraTransition(era);
});

// Disaster alert
client.onDisasterAlert((disaster) => {
  renderer.showCrisisModal(disaster);
});

// Game over
client.onGameOver((state) => {
  renderer.renderGameOver(state);
  if (inputManager) {
    inputManager.unbind();
    inputManager = null;
  }
});

// Player left
client.onPlayerLeft(() => {
  alert('Your opponent has disconnected!');
});

// Errors
client.onError((msg) => {
  alert(`Error: ${msg}`);
  btnCreate.disabled = false;
  btnCreate.textContent = 'Create Game';
  (btnJoin as HTMLButtonElement).disabled = false;
});

// --- Key 1 context-sensitivity ---
// Override the default PREP_SOIL action to intelligently pick PREP or SOW
// based on current plot state by listening to the latest game state
let latestState: import('../shared/types').GameState | null = null;
client.onStateUpdate((state) => { latestState = state; });

// Patch the input handler for contextual key 1 behavior
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (!latestState || !inputManager) return;

  const key = e.key.toLowerCase();
  const playerId = client.playerId;

  // Only for the action keys (1 for P1, 7 for P2)
  const isActionKey = (playerId === 1 && key === '1') || (playerId === 2 && key === '7');
  if (!isActionKey) return;

  const player = latestState.players[playerId - 1];
  if (!player) return;

  const currentPlot = player.plots[player.cursorPosition];
  if (!currentPlot) return;

  e.preventDefault();
  e.stopPropagation();

  if (currentPlot.status === 'EMPTY' || currentPlot.status === 'WITHERED') {
    client.sendAction({ playerId, type: 'PREP_SOIL' });
  } else if (currentPlot.status === 'PREPPED') {
    client.sendAction({ playerId, type: 'SOW_SEED' });
  } else if (currentPlot.status === 'READY') {
    client.sendAction({ playerId, type: 'HARVEST' });
  }
}, true); // Use capture phase to override InputManager
