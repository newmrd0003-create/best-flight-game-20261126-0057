// The screenshot scenes behind ?shot=takeoff|rings|landing|coast. Each one flies
// the real rules forward from a fresh flight for a fixed number of steps,
// steered by the same autopilot a careful pilot would use (bank toward the
// next waypoint, pitch for its altitude, throttle for its speed), so the frame
// is what a short sortie really looks like and the same seed always gives the
// same frame.
import { STEP } from './config.js';
import { autopilotInput, resetFlight, stepFlight, STAGE_LANDING, STAGE_RINGS } from './flight.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;

/** Fly one step toward a waypoint, handling gear and flaps like a pilot would. */
function flyToward(flight, tx, tz, talt, tspeed, landing) {
  if (!flight.airborne) {
    const input = { pitch: flight.speed > 34 ? 1 : 0, roll: 0, throttle: 1 };
    stepFlight(flight, input, SAMPLE);
    return;
  }
  // Climb-out: straight ahead and up until clear of the home island's ridge.
  if (!landing && flight.alt < 100) {
    stepFlight(flight, { pitch: 1, roll: 0, throttle: 1 }, SAMPLE);
    return;
  }
  if (landing) {
    flight.gear = true;
    flight.flaps = true;
  } else if (flight.alt > 40) {
    flight.gear = false;
    flight.flaps = false;
  }
  // Slow down for the ring: a tight turn at 60 m/s has a 300 m radius and
  // can never line up on a 38 m ring.
  const dist = Math.hypot(tx - flight.x, tz - flight.z);
  const speed = landing || dist < 500 ? 42 : tspeed;
  const input = autopilotInput(flight, tx, tz, talt, speed);
  stepFlight(flight, input, SAMPLE);
}

function distanceTo(flight, tx, tz) {
  return Math.hypot(flight.x - tx, flight.z - tz);
}

/**
 * Line-following aim: project the aircraft onto the course line from `from`
 * to `to`, then aim 120 m ahead of that projection (never past `to` + 60 m).
 * Chasing the ring's bearing alone flies a pursuit curve that passes beside
 * the ring; following the line converges onto it. The lookahead is short on
 * purpose: a far aim is chased from the side and the aircraft is still
 * off-line when it reaches the ring.
 */
function lineAim(flight, from, to, alt) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const along = (flight.x - from.x) * ux + (flight.z - from.z) * uz;
  const aimAlong = Math.min(along + 120, len + 60);
  return { x: from.x + ux * aimAlong, z: from.z + uz * aimAlong, alt };
}

/** Aim for ring `index` by following the course line into it. */
function ringAim(flight, index) {
  const rings = flight.terrain.rings;
  const ring = rings[index];
  const prev = index === 0 ? { x: 0, z: 280 } : rings[index - 1];
  return lineAim(flight, prev, ring, ring.alt);
}

/** Takeoff: full throttle down Ridge Runway, rotating just as the strip runs out. */
function stageTakeoff(flight) {
  resetFlight(flight);
  for (let i = 0; i < 4.6 / STEP; i += 1) {
    stepFlight(flight, { pitch: flight.speed > 34 ? 1 : 0, roll: 0, throttle: 1 }, STEP);
  }
  return { screen: SCREEN_PLAY, best: 0 };
}

/** Mid-course: through ring 1, closing on ring 2 over the harbour city. */
function stageRings(flight) {
  resetFlight(flight);
  let guard = 0;
  while (guard < 150 / STEP) {
    guard += 1;
    const aim = ringAim(flight, flight.ringIndex);
    flyToward(flight, aim.x, aim.z, aim.alt, 55, false);
    if (flight.crashed) break;
    if (flight.ringIndex >= 1 && distanceTo(flight, flight.terrain.rings[1].x, flight.terrain.rings[1].z) < 380) break;
    // If the pilot circles a ring too long, move the course on (shot only).
    if (flight.ringIndex === 0 && guard > 55 / STEP) {
      flight.ringIndex = 1;
      flight.stage = STAGE_RINGS;
    }
  }
  return { screen: SCREEN_PLAY, best: flight.score };
}

/** Final approach: gear down, flaps down, Ridge Runway filling the windscreen. */
function stageLanding(flight) {
  resetFlight(flight);
  let guard = 0;
  let phase = 0;
  while (guard < 320 / STEP) {
    guard += 1;
    if (phase === 0 && flight.stage === STAGE_LANDING) phase = 1;
    if (phase === 0) {
      const aim = ringAim(flight, flight.ringIndex);
      flyToward(flight, aim.x, aim.z, aim.alt, 55, false);
      if (flight.crashed) break;
      if (flight.ringIndex < flight.terrain.rings.length && guard > 50 / STEP && flight.ringIndex < 6) {
        // Shot staging: keep the course moving if a ring is missed.
        const ringNow = flight.terrain.rings[flight.ringIndex];
        if (ringNow && distanceTo(flight, ringNow.x, ringNow.z) > 900) {
          flight.ringIndex += 1;
          if (flight.ringIndex >= flight.terrain.rings.length) flight.stage = STAGE_LANDING;
        }
      }
    } else if (phase === 1) {
      // Enroute to the start of the final line, at a safe altitude.
      flyToward(flight, 0, 1200, 120, 55, false);
      if (flight.crashed) break;
      if (distanceTo(flight, 0, 1200) < 300) phase = 2;
    } else {
      // Final approach: follow the centreline all the way down the strip,
      // so the aim keeps advancing instead of stopping at the threshold.
      // Stay high until lined up — the island's slopes are higher than a
      // low, off-centreline approach.
      const cross = Math.abs(flight.x);
      const glide = Math.max(0, (flight.z + 280) * 0.09);
      // Flare: over the strip, aim at the tarmac itself for a touchdown.
      const targetAlt = flight.z < 250 ? 0 : glide;
      const aim = lineAim(flight, { x: 0, z: 1200 }, { x: 0, z: -280 }, cross > 30 ? Math.max(70, targetAlt) : targetAlt);
      flyToward(flight, aim.x, aim.z, aim.alt, 42, true);
      if (flight.crashed || flight.landed) break;
      if (flight.alt < 75 && flight.z > 350 && flight.z < 700) break;
    }
  }
  return { screen: SCREEN_PLAY, best: flight.score };
}

/** Low coastal pass: ring 5 ahead, the lighthouse rock and the green isle below. */
function stageCoast(flight) {
  resetFlight(flight);
  flight.ringIndex = 4;
  flight.stage = STAGE_RINGS;
  let guard = 0;
  while (guard < 150 / STEP) {
    guard += 1;
    const aim = ringAim(flight, 4);
    flyToward(flight, aim.x, aim.z, aim.alt, 55, false);
    if (flight.crashed) break;
    if (distanceTo(flight, flight.terrain.rings[4].x, flight.terrain.rings[4].z) < 420 && flight.airborne) break;
  }
  return { screen: SCREEN_PLAY, best: flight.score };
}

/**
 * Set `flight` to the named scene (takeoff, rings, landing or coast; any other
 * name is the title) and return the screen to draw over it.
 */
export function stageShot(name, flight) {
  if (name === 'takeoff') return stageTakeoff(flight);
  if (name === 'rings') return stageRings(flight);
  if (name === 'landing') return stageLanding(flight);
  if (name === 'coast') return stageCoast(flight);
  resetFlight(flight);
  return { screen: SCREEN_TITLE, best: 0 };
}
