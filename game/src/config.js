// Skyhook Ridge — tuning constants for the whole game.
// One place for every number a designer would reach for: the playfield size,
// the flight model's limits, the mission clock and the scoring table.
export const FIELD = { width: 1280, height: 800 };
export const STEP = 1 / 60;
export const BEST_KEY = 'skyhook-ridge-best';
export const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const MONO = '"Cascadia Mono", "SF Mono", Consolas, monospace';

export const FLIGHT = {
  minSpeed: 0,
  maxSpeed: 105,
  stallSpeed: 27,
  rotateSpeed: 36,
  cruiseSpeed: 62,
  maxPitchUp: 28,
  maxPitchDown: -22,
  maxRoll: 65,
  pitchRate: 26,
  rollRate: 75,
  turnAuthority: 2.2,
  throttleRate: 0.55,
  fuelBurn: 0.11,
  groundFriction: 0.35,
};

export const MISSION = {
  timeLimit: 360,
  ringRadius: 38,
  ringScore: 250,
  landingScore: 500,
  fuelBonusPerPoint: 4,
  timeBonusPerSecond: 2,
  maxDamage: 100,
};

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7fb2dd',
  skyLow: '#cfe6f2',
  seaDeep: '#14506e',
  seaShallow: '#2e7d9e',
  sand: '#d9c08a',
  grass: '#5d8f4a',
  forest: '#3c6b34',
  rock: '#8a8378',
  snow: '#eef2f5',
  cityRoof: '#5a6b7d',
  cityGlass: '#9fd8e8',
  runway: '#3a3f46',
  runwayLine: '#f2f2e8',
  ringNext: '#ffb02e',
  ringLater: '#7fb7ff',
  ringDone: '#37d67a',
  panel: '#20242b',
  panelEdge: '#3a4048',
  gaugeFace: '#10151c',
  gaugeLit: '#8ef0b2',
  gaugeWarn: '#ffb02e',
  gaugeBad: '#ff5a4e',
  hudText: '#eaf6ff',
  hudDim: '#a8c4d6',
};
