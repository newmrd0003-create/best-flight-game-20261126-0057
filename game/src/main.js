// Boot and the one loop: input is read every frame, the flight advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and game over. C toggles the chase and cockpit cameras.
//
// ?seed=N fixes the world. ?shot=takeoff|rings|landing|coast (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { createFlight, resetFlight, stepFlight } from './flight.js';
import { ACTION_CAMERA, ACTION_CONFIRM, ACTION_FLAPS, ACTION_GEAR, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const terrain = createTerrain(seed);
const flight = createFlight(terrain);
const renderer = createRenderer(canvas);
const audio = createAudio();
const random = createRandom(seed);
void random;

let view = 'chase';

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

// Exposed for play-testing: the live flight state and screen.
window.__game = { flight, terrain, get screen() { return screen; }, get view() { return view; } };

let screen = SCREEN_TITLE;

function runShot(name) {
  const scene = stageShot(name, flight);
  screen = scene.screen;
  let painted = 0;
  function paint() {
    renderer.draw(flight, terrain, screen, scene.best, view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let lastRing = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.ensure();
    resetFlight(flight);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Throttle up with Shift, rotate at 70 knots.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (flight.score > best) {
      best = flight.score;
      saveBest(best);
    }
    announce(flight.landed ? `Sortie complete. Score ${flight.score}.` : `Crashed. ${flight.failReason}`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_FLAPS) {
        flight.flaps = !flight.flaps;
        audio.click();
      }
      if (actions & ACTION_GEAR) {
        flight.gear = !flight.gear;
        audio.click();
      }
      if (actions & ACTION_CAMERA) {
        view = view === 'chase' ? 'cockpit' : 'chase';
        audio.click();
      }
    }
  }

  function handleClick() {
    const click = input.takeClick();
    if (!click) return;
    audio.ensure();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
      startGame();
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    // The throttle lever on the cockpit panel answers the mouse.
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / 1280;
    const scaleY = rect.height / 800;
    const fx = click.x / scaleX;
    const fy = click.y / scaleY;
    const panelY = 800 - 168;
    if (fx >= 740 && fx <= 780 && fy >= panelY + 66 && fy <= panelY + 138) {
      flight.throttle = Math.max(0, Math.min(1, 1 - (fy - (panelY + 70)) / 56));
      audio.click();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // Idle drift on the title screen: the Kestrel waits on the runway.
      flight.time += STEP;
      return;
    }
    const dir = input.direction();
    stepFlight(flight, dir, STEP);
    if (flight.ringIndex !== lastRing) {
      lastRing = flight.ringIndex;
      audio.ringChime();
    }
    if (flight.crashed) {
      audio.thud();
      endGame();
    } else if (flight.landed) {
      audio.ringChime();
      endGame();
    } else if (flight.failed) {
      endGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClick();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    audio.update(flight.throttle, flight.speed, flight.airborne);
    renderer.draw(flight, terrain, screen, best, view);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Skyhook Ridge. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
