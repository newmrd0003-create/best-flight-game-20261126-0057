// Skyhook Ridge — the world: one archipelago the pilot can recognise at a glance.
// A flat main island holds the runway and a little harbour city; around it sit a
// snowy volcano, a forested peak, a low green isle and a lighthouse rock. Every
// island, building, cloud and ring is placed from the seed, so the same seed
// rebuilds the same world.
import { createRandom, range } from './random.js';

// Islands: centre, radius, peak height, kind (drives the colour bands).
const ISLANDS = [
  { x: 0, z: 0, radius: 720, peak: 55, kind: 'home' },
  { x: -880, z: -620, radius: 520, peak: 235, kind: 'volcano' },
  { x: 860, z: -520, radius: 470, peak: 150, kind: 'peak' },
  { x: 760, z: 720, radius: 420, peak: 95, kind: 'green' },
  { x: -720, z: 640, radius: 400, peak: 165, kind: 'peak' },
  { x: 40, z: -1080, radius: 360, peak: 265, kind: 'volcano' },
];

// The runway: a flat strip on the home island, heading 180 (south, -z).
export const RUNWAY = {
  x: 0,
  zFrom: -280,
  zTo: 280,
  halfWidth: 13,
  headingDeg: 180,
};

export const RING_COURSE = [
  { x: 320, z: -420, alt: 130 },
  { x: 720, z: -260, alt: 165 },
  { x: 640, z: 430, alt: 185 },
  { x: 60, z: 760, alt: 150 },
  { x: -560, z: 520, alt: 175 },
  { x: -720, z: -240, alt: 160 },
];

export const LIGHTHOUSE = { x: -520, z: 430, base: 0 };

export function createTerrain(seed) {
  const random = createRandom(seed);
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    clouds.push({
      x: range(random, -1600, 1600),
      z: range(random, -1600, 1600),
      alt: range(random, 230, 340),
      size: range(random, 60, 150),
    });
  }
  const city = [];
  for (let i = 0; i < 26; i += 1) {
    city.push({
      x: range(random, 180, 520),
      z: range(random, -160, 260),
      w: range(random, 14, 30),
      d: range(random, 14, 30),
      h: range(random, 12, 46),
    });
  }
  const trees = [];
  for (let i = 0; i < 90; i += 1) {
    const angle = random() * Math.PI * 2;
    const dist = range(random, 180, 640);
    trees.push({ x: Math.cos(angle) * dist, z: Math.sin(angle) * dist, size: range(random, 4, 9) });
  }
  return { islands: ISLANDS, clouds, city, trees, rings: RING_COURSE, runway: RUNWAY, lighthouse: LIGHTHOUSE };
}

/** Ground height in metres at (x, z); below 0 is sea. */
export function terrainHeight(terrain, x, z) {
  let height = 0;
  for (let i = 0; i < terrain.islands.length; i += 1) {
    const island = terrain.islands[i];
    const dx = x - island.x;
    const dz = z - island.z;
    const d = Math.sqrt(dx * dx + dz * dz) / island.radius;
    if (d < 1.6) height += island.peak * Math.exp(-d * d * 2.4);
  }
  // Gentle rolling bumps so the grass is never a flat disc.
  height += 2.5 * Math.sin(x * 0.011 + 1.7) * Math.cos(z * 0.013 - 0.6);
  height += 1.5 * Math.sin(x * 0.031 - z * 0.017);
  // The runway strip is graded flat: no bump may poke through the tarmac.
  const r = terrain.runway;
  if (Math.abs(x - r.x) < 70 && z > r.zFrom - 70 && z < r.zTo + 70) {
    const edge = Math.min((70 - Math.abs(x - r.x)) / 70, 1);
    height *= 1 - edge * 0.99;
  }
  return height;
}

export function onRunway(terrain, x, z) {
  const r = terrain.runway;
  return Math.abs(x - r.x) <= r.halfWidth + 6 && z >= r.zFrom - 10 && z <= r.zTo + 10;
}

export function groundColour(height, kind) {
  if (height < 4) return '#d9c08a';
  if (height < 34) return '#5d8f4a';
  if (height < 80) return '#3c6b34';
  if (height < 150) return '#8a8378';
  if (kind === 'volcano') return '#5c4a42';
  return '#eef2f5';
}
