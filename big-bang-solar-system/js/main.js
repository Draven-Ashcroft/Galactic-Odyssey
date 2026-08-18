/**
 * main.js
 * ------------------------------------------------------------------
 * Composition root. This file's only job is to:
 *   1. Set up the Three.js renderer and a fixed-timestep-free
 *      animation loop (via THREE.Clock).
 *   2. Instantiate every core module and wire them together through
 *      constructor injection (nobody reaches for a global singleton).
 *   3. Translate "ui:*" intent events into actual state/controller
 *      calls — this is the one place UI intent becomes simulation
 *      change, keeping UIManager itself free of simulation logic.
 *
 * No scientific or scene-specific logic belongs in this file.
 */
import * as THREE from 'three';

import { EventBus } from './core/EventBus.js';
import { SimulationState } from './core/SimulationState.js';
import { CameraManager } from './core/CameraManager.js';
import { SceneManager } from './core/SceneManager.js';
import { CosmicTimeController } from './core/CosmicTimeController.js';
import { EpochStateMachine } from './core/EpochStateMachine.js';
import { UIManager } from './core/UIManager.js';
import { EPOCHS } from './data/epochs.js';

function bootstrap() {
  const canvas = document.getElementById('scene-canvas');
  const viewport = document.getElementById('viewport');

  // --- Renderer -----------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);

  // --- Core modules ---------------------------------------------------
  const eventBus = new EventBus();
  const simulationState = new SimulationState(eventBus);
  const cameraManager = new CameraManager(viewport);
  const sceneManager = new SceneManager();
  const cosmicTimeController = new CosmicTimeController({ eventBus, simulationState });
  const stateMachine = new EpochStateMachine({
    eventBus,
    simulationState,
    sceneManager,
    cameraManager,
    cosmicTimeController,
  });
  const uiManager = new UIManager(eventBus); // eslint-disable-line no-unused-vars

  // --- Translate UI intent events into state/controller changes -------
  eventBus.on('ui:play-toggle', () => {
    simulationState.set({ isPlaying: !simulationState.isPlaying });
  });
  eventBus.on('ui:speed-change', ({ speed }) => {
    simulationState.set({ playbackSpeed: speed });
  });
  eventBus.on('ui:next-epoch', () => stateMachine.next());
  eventBus.on('ui:prev-epoch', () => stateMachine.previous());
  eventBus.on('ui:seek-epoch', ({ index }) => stateMachine.goToEpoch(index));

  // --- Resize -----------------------------------------------------------
  window.addEventListener('resize', () => {
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    cameraManager.onResize();
  });

  // --- Generic canvas tap detection --------------------------------------
  // Raw input, not a UI-widget intent — deliberately NOT scene-specific
  // logic (no raycasting, no knowledge of what's clickable happens here).
  // Any scene MAY subscribe to "input:canvas-tap" and do its own picking
  // with context.camera; most scenes ignore it entirely. 'click' (not
  // 'pointerdown') so this fires identically for mouse clicks and touch
  // taps without a separate mobile code path.
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    eventBus.emit('input:canvas-tap', { ndcX, ndcY });
  });

  // --- Kick off at the first epoch, paused, so the user presses Play --
  stateMachine.goToEpoch(0);
  simulationState.set({ isPlaying: false });

  // --- Animation loop -----------------------------------------------
  const clock = new THREE.Clock();
  function tick() {
    const deltaTime = clock.getDelta();
    cosmicTimeController.update(deltaTime);
    sceneManager.update(deltaTime, {
      epoch: EPOCHS[simulationState.currentEpochIndex],
      state: simulationState.snapshot(),
      camera: cameraManager.camera,
      eventBus,
    });
    renderer.render(sceneManager.scene, cameraManager.camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

bootstrap();
