// Skyhook Ridge — flight model and mission state.
// A light, honest model: throttle sets target speed, pitch trades speed for
// climb, bank turns the nose, and speed below stall sinks the aircraft. Three
// stages — take off from Ridge Runway, fly the six-ring course, land back on
// the same strip — with fuel, a clock and a score that rewards clean flying.
import { FLIGHT, MISSION, STEP } from './config.js';
import { onRunway, terrainHeight } from './terrain.js';

export const STAGE_TAKEOFF = 'takeoff';
export const STAGE_RINGS = 'rings';
export const STAGE_LANDING = 'landing';
export const STAGE_DONE = 'done';

export function createFlight(terrain) {
  return {
    terrain,
    x: 0,
    z: 210,
    alt: 0,
    heading: Math.PI,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    flaps: false,
    gear: true,
    fuel: 100,
    damage: 0,
    timeLeft: MISSION.timeLimit,
    time: 0,
    score: 0,
    stage: STAGE_TAKEOFF,
    ringIndex: 0,
    airborne: false,
    landed: false,
    crashed: false,
    failed: false,
    failReason: '',
    message: '',
    messageTime: 0,
    ringFlash: 0,
    verticalSpeed: 0,
    distanceFlown: 0,
  };
}

export function resetFlight(flight) {
  const fresh = createFlight(flight.terrain);
  Object.assign(flight, fresh);
}

export function knots(speed) {
  return speed * 1.944;
}

export function feet(alt) {
  return alt * 3.281;
}

function say(flight, text) {
  flight.message = text;
  flight.messageTime = 3.2;
}

function crash(flight, reason) {
  flight.crashed = true;
  flight.damage = MISSION.maxDamage;
  flight.failReason = reason;
  say(flight, reason);
}

function angleTo(flight, tx, tz) {
  return Math.atan2(tx - flight.x, tz - flight.z);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** One fixed step of flight. `input` carries pitch/roll/throttle intents. */
export function stepFlight(flight, input, dt) {
  if (flight.crashed || flight.landed || flight.failed) return;
  flight.time += dt;
  flight.timeLeft -= dt;
  if (flight.messageTime > 0) flight.messageTime -= dt;
  if (flight.ringFlash > 0) flight.ringFlash -= dt;
  if (flight.timeLeft <= 0) {
    flight.timeLeft = 0;
    flight.failed = true;
    flight.failReason = 'OUT OF TIME — the sortie clock ran out';
    say(flight, flight.failReason);
    return;
  }

  // Throttle, pitch and roll answer the sticks at once, at every speed.
  flight.throttle = Math.min(1, Math.max(0, flight.throttle + input.throttle * FLIGHT.throttleRate * dt));
  flight.pitch = Math.min(FLIGHT.maxPitchUp, Math.max(FLIGHT.maxPitchDown, flight.pitch + input.pitch * FLIGHT.pitchRate * dt));
  if (input.pitch === 0) flight.pitch += (0 - flight.pitch) * 0.35 * dt;
  flight.roll = Math.min(FLIGHT.maxRoll, Math.max(-FLIGHT.maxRoll, flight.roll + input.roll * FLIGHT.rollRate * dt));
  if (input.roll === 0) flight.roll += (0 - flight.roll) * 0.8 * dt;

  // Banked turn: the nose follows the bank, harder at speed. Banking right
  // (positive roll) turns the nose right, toward a larger heading.
  const rollRad = (flight.roll * Math.PI) / 180;
  const turnRate = Math.sin(rollRad) * (9.81 / Math.max(flight.speed, 12)) * FLIGHT.turnAuthority;
  flight.heading = wrapAngle(flight.heading + turnRate * dt);

  // Speed chases the throttle, with drag, flap/gear drag and a pitch trade.
  let target = 24 + flight.throttle * 78;
  if (flight.flaps) target -= 13;
  if (flight.gear && flight.airborne) target -= 7;
  flight.speed += (target - flight.speed) * 0.32 * dt;
  flight.speed -= Math.sin((flight.pitch * Math.PI) / 180) * 9 * dt;
  if (!flight.airborne) flight.speed -= flight.speed * FLIGHT.groundFriction * dt * 0.4;
  flight.speed = Math.max(0, Math.min(FLIGHT.maxSpeed, flight.speed));

  // Climb: pitch converts speed into vertical speed; below stall the nose sinks.
  let verticalSpeed = Math.sin((flight.pitch * Math.PI) / 180) * flight.speed * 0.92;
  if (flight.speed < FLIGHT.stallSpeed) verticalSpeed -= (FLIGHT.stallSpeed - flight.speed) * 1.4;
  if (!flight.airborne) verticalSpeed = 0;
  flight.verticalSpeed = verticalSpeed;

  const forwardX = Math.sin(flight.heading);
  const forwardZ = Math.cos(flight.heading);
  const stepDistance = flight.speed * dt;
  flight.x += forwardX * stepDistance;
  flight.z += forwardZ * stepDistance;
  flight.distanceFlown += stepDistance;

  // Liftoff: enough speed and a pulled nose leaves the runway, clearing the
  // graded strip by a couple of metres so the ground check cannot fire.
  if (!flight.airborne) {
    if (flight.speed >= FLIGHT.rotateSpeed && flight.pitch > 4) {
      flight.airborne = true;
      flight.alt = terrainHeight(flight.terrain, flight.x, flight.z) + 2;
      say(flight, 'AIRBORNE — gear up when you are ready (G)');
      if (flight.stage === STAGE_TAKEOFF) flight.stage = STAGE_RINGS;
    }
  } else {
    flight.alt += verticalSpeed * dt;
  }

  // Fuel burns with throttle; empty tanks mean a glide, not a flame-out crash.
  flight.fuel = Math.max(0, flight.fuel - flight.throttle * FLIGHT.fuelBurn * dt);
  if (flight.fuel <= 0 && flight.throttle > 0) {
    flight.throttle = 0;
    say(flight, 'FUEL EMPTY — gliding, find the runway');
  }

  const ground = terrainHeight(flight.terrain, flight.x, flight.z);
  const overRunway = onRunway(flight.terrain, flight.x, flight.z);

  // Ring course: fly through the glowing ring, centre-first.
  if (flight.stage === STAGE_RINGS && flight.airborne) {
    const ring = flight.terrain.rings[flight.ringIndex];
    if (ring) {
      const dx = flight.x - ring.x;
      const dy = flight.alt - ring.alt;
      const dz = flight.z - ring.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < MISSION.ringRadius) {
        flight.score += MISSION.ringScore;
        flight.ringIndex += 1;
        flight.ringFlash = 1.2;
        say(flight, `RING ${flight.ringIndex} OF 6 CLEARED  +${MISSION.ringScore}`);
        if (flight.ringIndex >= flight.terrain.rings.length) {
          flight.stage = STAGE_LANDING;
          say(flight, 'ALL RINGS CLEAR — RETURN TO RIDGE RUNWAY AND LAND');
        }
      }
    }
  }

  // Ground contact: a runway touchdown is judged, anything else is a crash.
  // Only the landing stage can end the sortie: touching the strip mid-course
  // is a touch-and-go, and the aircraft rolls on and lifts again.
  if (flight.airborne && flight.alt <= ground + 0.5) {
    flight.alt = Math.max(0, ground);
    const gentle = flight.gear && flight.verticalSpeed > -9 && flight.speed >= 22 && flight.speed <= 58 && Math.abs(flight.roll) < 14;
    if (overRunway && gentle) {
      if (flight.stage === STAGE_LANDING) {
        flight.landed = true;
        flight.stage = STAGE_DONE;
        const fuelBonus = Math.round(flight.fuel * MISSION.fuelBonusPerPoint);
        const timeBonus = Math.round(flight.timeLeft * MISSION.timeBonusPerSecond);
        flight.score += MISSION.landingScore + fuelBonus + timeBonus;
        say(flight, `TOUCHDOWN — SORTIE COMPLETE  +${MISSION.landingScore + fuelBonus + timeBonus}`);
      } else {
        flight.airborne = false;
        say(flight, 'TOUCH-AND-GO — back on the power');
      }
    } else if (overRunway && flight.gear && flight.speed > 58 && flight.stage === STAGE_LANDING) {
      crash(flight, 'OVERSHOT — too fast on the runway, ran off the strip');
    } else if (overRunway && !flight.gear) {
      crash(flight, 'BELLY LANDING — the gear was up');
    } else {
      crash(flight, ground > 8 ? 'TERRAIN STRIKE — flew into the ridge' : 'CRASHED — hit the ground short of the runway');
    }
    return;
  }
  if (!flight.airborne && flight.alt <= 0) flight.alt = 0;
  if (flight.alt < 0) flight.alt = 0;
}

/** Autopilot for the staged screenshot scenes: steer to a target point and altitude. */
export function autopilotInput(flight, targetX, targetZ, targetAlt, targetSpeed) {
  const desiredHeading = angleTo(flight, targetX, targetZ);
  const error = wrapAngle(desiredHeading - flight.heading);
  const rollTarget = Math.max(-55, Math.min(55, error * 90));
  const rollInput = Math.max(-1, Math.min(1, (rollTarget - flight.roll) / 22));
  const altError = targetAlt - flight.alt;
  const pitchTarget = Math.max(-20, Math.min(20, altError * 0.4));
  const pitchInput = Math.max(-1, Math.min(1, (pitchTarget - flight.pitch) / 9));
  const throttleInput = flight.speed < targetSpeed ? 1 : flight.speed > targetSpeed + 6 ? -1 : 0;
  return { pitch: pitchInput, roll: rollInput, throttle: throttleInput };
}
