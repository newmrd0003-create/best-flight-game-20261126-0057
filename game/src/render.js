// Skyhook Ridge — drawing only: the flight state and the current screen in,
// pixels out. A small chase camera projects the archipelago (sea, islands,
// harbour city, runway, rings, clouds) with a perspective divide; the Kestrel
// K-7 is painted as a built aircraft in the frame; the cockpit panel and the
// HUD carry the lit instruments the pilot actually flies by.
import { FIELD, FONT, MONO, PALETTE } from './config.js';
import { feet, knots, STAGE_DONE, STAGE_LANDING, STAGE_RINGS, STAGE_TAKEOFF } from './flight.js';
import { groundColour, terrainHeight } from './terrain.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const FOCAL = 640;
const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = FIELD.width;
  const H = FIELD.height;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();

  function text(value, x, y, size, color, align, font) {
    ctx.font = `${size}px ${font || FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function box(x, y, w, h, color, alpha) {
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }

  function roundedPanel(x, y, w, h, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // --- 3D camera -----------------------------------------------------------
  // Chase: behind and above the Kestrel. Cockpit: at the nose, looking out
  // over the panel — the aircraft itself leaves the frame.
  function camera(flight, view) {
    const fx = Math.sin(flight.heading);
    const fz = Math.cos(flight.heading);
    if (view === 'cockpit') {
      const cam = { x: flight.x + fx * 3, y: flight.alt + 1.4, z: flight.z + fz * 3 };
      const look = { x: flight.x + fx * 70, y: Math.max(0.5, flight.alt - 2), z: flight.z + fz * 70 };
      let fwd = { x: look.x - cam.x, y: look.y - cam.y, z: look.z - cam.z };
      const len = Math.hypot(fwd.x, fwd.y, fwd.z);
      fwd = { x: fwd.x / len, y: fwd.y / len, z: fwd.z / len };
      const right = { x: fwd.z, y: 0, z: -fwd.x };
      const up = {
        x: fwd.y * right.z - fwd.z * right.y,
        y: fwd.z * right.x - fwd.x * right.z,
        z: fwd.x * right.y - fwd.y * right.x,
      };
      return { cam, fwd, right, up };
    }
    const cam = {
      x: flight.x - fx * 20,
      y: flight.alt + 7.5,
      z: flight.z - fz * 20,
    };
    const look = { x: flight.x + fx * 70, y: Math.max(2, flight.alt - 4), z: flight.z + fz * 70 };
    let fwd = { x: look.x - cam.x, y: look.y - cam.y, z: look.z - cam.z };
    const len = Math.hypot(fwd.x, fwd.y, fwd.z);
    fwd = { x: fwd.x / len, y: fwd.y / len, z: fwd.z / len };
    let right = { x: fwd.z, y: 0, z: -fwd.x };
    const rl = Math.hypot(right.x, right.z) || 1;
    right = { x: right.x / rl, y: 0, z: right.z / rl };
    const up = {
      x: fwd.y * right.z - fwd.z * right.y,
      y: fwd.z * right.x - fwd.x * right.z,
      z: fwd.x * right.y - fwd.y * right.x,
    };
    return { cam, fwd, right, up };
  }

  function project(cam, px, py, pz) {
    const dx = px - cam.cam.x;
    const dy = py - cam.cam.y;
    const dz = pz - cam.cam.z;
    const cz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
    if (cz < 2) return null;
    const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
    const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
    return {
      x: W / 2 + (cx / cz) * FOCAL,
      y: H * 0.44 - (cy / cz) * FOCAL,
      z: cz,
    };
  }

  function drawSky(flight, cam) {
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H * 0.56);
    // Sun, placed by heading so it stays put in the world as you turn.
    const sunAz = 2.4;
    const rel = wrapAngle(sunAz - flight.heading);
    const sx = W / 2 + Math.sin(rel) * FOCAL * 1.4;
    const sy = H * 0.15 - Math.cos(rel) * 40;
    if (sx > -80 && sx < W + 80) {
      const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
      glow.addColorStop(0, 'rgba(255, 246, 200, 0.95)');
      glow.addColorStop(0.25, 'rgba(255, 230, 150, 0.55)');
      glow.addColorStop(1, 'rgba(255, 230, 150, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 95, sy - 95, 190, 190);
      ctx.fillStyle = '#fff7d6';
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, TAU);
      ctx.fill();
    }
    void cam;
  }

  function horizonY(cam) {
    const p = project(cam, cam.cam.x + cam.fwd.x * 4000, 0, cam.cam.z + cam.fwd.z * 4000);
    return p ? p.y : H * 0.44;
  }

  function drawSea(horizon) {
    const grad = ctx.createLinearGradient(0, horizon, 0, H);
    grad.addColorStop(0, PALETTE.seaShallow);
    grad.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon, W, H - horizon);
    // Sun glitter on the water.
    ctx.fillStyle = 'rgba(255, 240, 190, 0.18)';
    for (let i = 0; i < 26; i += 1) {
      const x = ((i * 173 + 60) % 1280);
      const y = horizon + 30 + ((i * 97) % 300);
      ctx.fillRect(x, y, 34 + (i % 3) * 12, 2);
    }
  }

  function drawRidgeLayer(heading, offset, baseY, amp, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-4, H);
    ctx.lineTo(-4, baseY);
    for (let x = 0; x <= W; x += 32) {
      const n = Math.sin((x + offset) * 0.006 + heading * 2.1) * 0.6 + Math.sin((x + offset) * 0.017 + 1.3) * 0.4;
      ctx.lineTo(x, baseY - Math.max(0, n) * amp);
    }
    ctx.lineTo(W + 4, baseY);
    ctx.lineTo(W + 4, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawIsland(terrain, cam, island) {
    const dx = island.x - cam.cam.x;
    const dz = island.z - cam.cam.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2600) return;
    const segments = 16;
    const rings = [0, 0.35, 0.6, 0.85, 1.0];
    const grid = [];
    for (let r = 0; r < rings.length; r += 1) {
      const row = [];
      for (let s = 0; s <= segments; s += 1) {
        const a = (s / segments) * TAU;
        const rad = rings[r] * island.radius;
        const x = island.x + Math.cos(a) * rad;
        const z = island.z + Math.sin(a) * rad;
        const y = rings[r] === 0 ? island.peak * 1.02 : Math.max(0, terrainHeight(terrain, x, z));
        row.push({ p: project(cam, x, y, z), h: y });
      }
      grid.push(row);
    }
    for (let r = 0; r < rings.length - 1; r += 1) {
      for (let s = 0; s < segments; s += 1) {
        const a = grid[r][s];
        const b = grid[r][s + 1];
        const c = grid[r + 1][s + 1];
        const d = grid[r + 1][s];
        if (!a.p || !b.p || !c.p || !d.p) continue;
        const hAvg = (a.h + b.h + c.h + d.h) / 4;
        ctx.fillStyle = groundColour(hAvg, island.kind);
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(c.p.x, c.p.y);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(c.p.x, c.p.y);
        ctx.lineTo(d.p.x, d.p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Crater cap on the volcanoes.
    if (island.kind === 'volcano') {
      const top = project(cam, island.x, island.peak * 1.02, island.z);
      if (top && top.z < 2400) {
        ctx.fillStyle = '#3a2c26';
        ctx.beginPath();
        ctx.ellipse(top.x, top.y, 26 * (FOCAL / top.z) * 0.4 + 4, 10 * (FOCAL / top.z) * 0.4 + 2, 0, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawCity(terrain, cam) {
    for (let i = 0; i < terrain.city.length; i += 1) {
      const b = terrain.city[i];
      const ground = terrainHeight(terrain, b.x, b.z);
      const base = project(cam, b.x, ground, b.z);
      if (!base || base.z > 1500 || base.x < -60 || base.x > W + 60) continue;
      const scale = FOCAL / base.z;
      const w = b.w * scale;
      const h = b.h * scale;
      const d = b.d * scale * 0.5;
      ctx.fillStyle = '#4a5a6c';
      ctx.beginPath();
      ctx.moveTo(base.x - w / 2, base.y);
      ctx.lineTo(base.x - w / 2 + d, base.y - h);
      ctx.lineTo(base.x + w / 2 + d, base.y - h);
      ctx.lineTo(base.x + w / 2, base.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.cityGlass;
      ctx.fillRect(base.x - w / 2 + 2, base.y - h + 4, w - 4, 5);
      ctx.fillStyle = PALETTE.cityRoof;
      ctx.beginPath();
      ctx.moveTo(base.x - w / 2 + d, base.y - h);
      ctx.lineTo(base.x + w / 2 + d, base.y - h);
      ctx.lineTo(base.x + w / 2, base.y - h + d * 0.4);
      ctx.lineTo(base.x - w / 2, base.y - h + d * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRunway(terrain, cam) {
    const r = terrain.runway;
    // Drawn in short strips so a strip behind the camera is skipped instead
    // of dropping the whole runway.
    for (let z = r.zFrom; z < r.zTo; z += 40) {
      const z2 = Math.min(z + 40, r.zTo);
      const corners = [
        project(cam, r.x - r.halfWidth, 0.4, z),
        project(cam, r.x + r.halfWidth, 0.4, z),
        project(cam, r.x + r.halfWidth, 0.4, z2),
        project(cam, r.x - r.halfWidth, 0.4, z2),
      ];
      if (corners.some((p) => !p)) continue;
      ctx.fillStyle = PALETTE.runway;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.fill();
    }
    // Centreline dashes and edge lines.
    ctx.strokeStyle = PALETTE.runwayLine;
    ctx.lineWidth = 2;
    for (let z = r.zFrom + 20; z < r.zTo - 10; z += 40) {
      const a = project(cam, r.x, 0.6, z);
      const b = project(cam, r.x, 0.6, z + 20);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    const e1a = project(cam, r.x - r.halfWidth + 1.5, 0.6, r.zFrom);
    const e1b = project(cam, r.x - r.halfWidth + 1.5, 0.6, r.zTo);
    const e2a = project(cam, r.x + r.halfWidth - 1.5, 0.6, r.zFrom);
    const e2b = project(cam, r.x + r.halfWidth - 1.5, 0.6, r.zTo);
    if (e1a && e1b && e2a && e2b) {
      ctx.beginPath();
      ctx.moveTo(e1a.x, e1a.y);
      ctx.lineTo(e1b.x, e1b.y);
      ctx.moveTo(e2a.x, e2a.y);
      ctx.lineTo(e2b.x, e2b.y);
      ctx.stroke();
    }
    // Threshold stripes at the landing end.
    for (let i = -2; i <= 2; i += 1) {
      const a = project(cam, r.x + i * 4 - 1.4, 0.6, r.zTo - 26);
      const b = project(cam, r.x + i * 4 - 1.4, 0.6, r.zTo - 8);
      if (a && b) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    // Windsock beside the strip.
    const sock = project(cam, 34, 0, 120);
    if (sock && sock.z < 1200) {
      const s = FOCAL / sock.z;
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = Math.max(1, 2 * s * 0.4);
      ctx.beginPath();
      ctx.moveTo(sock.x, sock.y);
      ctx.lineTo(sock.x, sock.y - 14 * s * 0.5);
      ctx.stroke();
      ctx.fillStyle = '#ff7a2e';
      ctx.beginPath();
      ctx.moveTo(sock.x, sock.y - 14 * s * 0.5);
      ctx.lineTo(sock.x + 16 * s * 0.5, sock.y - 11 * s * 0.5);
      ctx.lineTo(sock.x, sock.y - 8 * s * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawLighthouse(terrain, cam) {
    const lh = terrain.lighthouse;
    const ground = terrainHeight(terrain, lh.x, lh.z);
    const base = project(cam, lh.x, ground, lh.z);
    if (!base || base.z > 1800) return;
    const s = FOCAL / base.z;
    const h = 34 * s * 0.55;
    ctx.fillStyle = '#f2ede2';
    ctx.fillRect(base.x - 3.5 * s * 0.5, base.y - h, 7 * s * 0.5, h);
    ctx.fillStyle = '#d8433a';
    ctx.fillRect(base.x - 3.5 * s * 0.5, base.y - h * 0.62, 7 * s * 0.5, h * 0.18);
    ctx.fillRect(base.x - 3.5 * s * 0.5, base.y - h * 0.24, 7 * s * 0.5, h * 0.18);
    ctx.fillStyle = '#22303c';
    ctx.fillRect(base.x - 4.5 * s * 0.5, base.y - h - 4 * s * 0.4, 9 * s * 0.5, 4 * s * 0.4);
    ctx.fillStyle = 'rgba(255, 240, 170, 0.85)';
    ctx.beginPath();
    ctx.arc(base.x, base.y - h - 2 * s * 0.4, 3 * s * 0.4, 0, TAU);
    ctx.fill();
  }

  function drawRings(flight, cam) {
    const rings = flight.terrain.rings;
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      const done = i < flight.ringIndex;
      const next = i === flight.ringIndex && flight.stage === STAGE_RINGS;
      const centre = project(cam, ring.x, ring.alt, ring.z);
      if (!centre || centre.z > 2400) continue;
      // Course direction: from the previous waypoint (runway for ring 0).
      const prev = i === 0 ? { x: 0, z: 280 } : rings[i - 1];
      const dx = ring.x - prev.x;
      const dz = ring.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      const R = 28;
      const color = done ? PALETTE.ringDone : next ? PALETTE.ringNext : PALETTE.ringLater;
      ctx.strokeStyle = color;
      ctx.globalAlpha = done ? 0.35 : next ? 0.95 : 0.5;
      ctx.lineWidth = next ? 7 : 4;
      ctx.beginPath();
      for (let a = 0; a <= 28; a += 1) {
        const t = (a / 28) * TAU;
        const p = project(cam, ring.x + px * Math.cos(t) * R, ring.alt + Math.sin(t) * R, ring.z + pz * Math.cos(t) * R);
        if (!p) continue;
        if (a === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (next) {
        const dist = Math.round(Math.hypot(flight.x - ring.x, flight.z - ring.z));
        const ringH = (R * FOCAL) / centre.z;
        // Keep the label clear of the top HUD panels: below the ring when near the top.
        const labelY = centre.y - ringH - 14 < 130 ? centre.y + ringH + 24 : centre.y - ringH - 14;
        text(`RING ${i + 1} — ${dist}m`, centre.x, labelY, 17, '#ffd27a', 'center', MONO);
        // Drop line to the sea so the pilot can read the ring's height.
        const foot = project(cam, ring.x, 0, ring.z);
        if (foot) {
          ctx.strokeStyle = 'rgba(255, 176, 46, 0.5)';
          ctx.setLineDash([6, 8]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(centre.x, centre.y);
          ctx.lineTo(foot.x, foot.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  function drawClouds(terrain, cam) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    for (let i = 0; i < terrain.clouds.length; i += 1) {
      const c = terrain.clouds[i];
      const p = project(cam, c.x, c.alt, c.z);
      if (!p || p.z > 2600 || p.z < 10) continue;
      const s = (FOCAL / p.z) * (c.size / 60);
      ctx.globalAlpha = clamp(1.1 - p.z / 2600, 0.25, 0.9);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 52 * s, 15 * s, 0, 0, TAU);
      ctx.ellipse(p.x - 30 * s, p.y + 4 * s, 30 * s, 11 * s, 0, 0, TAU);
      ctx.ellipse(p.x + 32 * s, p.y + 5 * s, 32 * s, 12 * s, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- The aircraft ----------------------------------------------------------
  function drawPlane(flight) {
    const cx = W / 2;
    const cy = H * 0.55 - flight.pitch * 1.4;
    const scale = 1.05;
    const blink = Math.floor(flight.time * 2) % 2 === 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((flight.roll * Math.PI) / 180);
    ctx.scale(scale, scale);
    // Exhaust glow at full throttle.
    if (flight.throttle > 0.55 && flight.airborne) {
      const glow = ctx.createRadialGradient(0, 58, 2, 0, 58, 26 + flight.throttle * 14);
      glow.addColorStop(0, 'rgba(255, 170, 60, 0.8)');
      glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 58, 26 + flight.throttle * 14, 0, TAU);
      ctx.fill();
    }
    // Main wings, swept back, teal tips.
    ctx.fillStyle = '#c9d2d8';
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.lineTo(-108, 26);
    ctx.lineTo(-100, 40);
    ctx.lineTo(-10, 18);
    ctx.lineTo(10, 18);
    ctx.lineTo(100, 40);
    ctx.lineTo(108, 26);
    ctx.lineTo(14, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0e7d8c';
    ctx.beginPath();
    ctx.moveTo(-108, 26);
    ctx.lineTo(-100, 40);
    ctx.lineTo(-84, 36);
    ctx.lineTo(-90, 28);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(108, 26);
    ctx.lineTo(100, 40);
    ctx.lineTo(84, 36);
    ctx.lineTo(90, 28);
    ctx.closePath();
    ctx.fill();
    // Fuselage: nose away (up-screen), tail toward the camera.
    const body = ctx.createLinearGradient(-16, 0, 16, 0);
    body.addColorStop(0, '#f4f7f8');
    body.addColorStop(0.5, '#ffffff');
    body.addColorStop(1, '#d7dee2');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -78);
    ctx.quadraticCurveTo(10, -60, 13, -30);
    ctx.quadraticCurveTo(16, 10, 17, 46);
    ctx.quadraticCurveTo(17, 58, 10, 60);
    ctx.lineTo(-10, 60);
    ctx.quadraticCurveTo(-17, 58, -17, 46);
    ctx.quadraticCurveTo(-16, 10, -13, -30);
    ctx.quadraticCurveTo(-10, -60, 0, -78);
    ctx.closePath();
    ctx.fill();
    // Teal cheatline and Kestrel titles.
    ctx.fillStyle = '#0e7d8c';
    ctx.fillRect(-13, -18, 26, 5);
    ctx.fillStyle = '#12303a';
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('KESTREL K-7', 0, -26);
    // Canopy.
    ctx.fillStyle = '#16324a';
    ctx.beginPath();
    ctx.ellipse(0, -52, 7, 14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(180, 225, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(-2, -56, 3, 6, 0, 0, TAU);
    ctx.fill();
    // Tailplane and fin.
    ctx.fillStyle = '#b7c2c9';
    ctx.beginPath();
    ctx.moveTo(-8, 44);
    ctx.lineTo(-52, 66);
    ctx.lineTo(-46, 74);
    ctx.lineTo(-6, 56);
    ctx.lineTo(6, 56);
    ctx.lineTo(46, 74);
    ctx.lineTo(52, 66);
    ctx.lineTo(8, 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0e7d8c';
    ctx.beginPath();
    ctx.moveTo(0, 38);
    ctx.lineTo(-9, 66);
    ctx.lineTo(0, 72);
    ctx.lineTo(9, 66);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('K7', 0, 64);
    // Nav lights.
    if (blink) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(-108, 32, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#37d67a';
      ctx.beginPath();
      ctx.arc(108, 32, 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- Instruments -----------------------------------------------------------
  function drawGauge(x, y, radius, label, value, max, unit, warnAt) {
    ctx.fillStyle = PALETTE.gaugeFace;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4a5560';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Tick ring.
    ctx.strokeStyle = '#7d8b96';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 10; i += 1) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      const x1 = x + Math.cos(a) * (radius - 4);
      const y1 = y + Math.sin(a) * (radius - 4);
      const x2 = x + Math.cos(a) * (radius - 11);
      const y2 = y + Math.sin(a) * (radius - 11);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    const frac = clamp(value / max, 0, 1);
    const angle = Math.PI * 0.75 + frac * Math.PI * 1.5;
    const danger = warnAt !== undefined && value >= warnAt;
    ctx.strokeStyle = danger ? PALETTE.gaugeBad : PALETTE.gaugeLit;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * (radius - 13), y + Math.sin(angle) * (radius - 13));
    ctx.stroke();
    ctx.fillStyle = '#dfe9ef';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, TAU);
    ctx.fill();
    text(label, x, y + radius - 12, 11, '#9fb4c2', 'center', MONO);
    text(String(Math.round(value)), x, y - radius + 22, 15, '#eaf6ff', 'center', MONO);
    if (unit) text(unit, x, y + radius + 15, 10, '#7d8b96', 'center', MONO);
  }

  function drawAttitude(flight, x, y, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((-flight.roll * Math.PI) / 180);
    ctx.translate(0, flight.pitch * 1.1);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-radius, 0, radius * 2, radius);
    ctx.fillStyle = '#eaf6ff';
    ctx.fillRect(-radius, -1.5, radius * 2, 3);
    ctx.restore();
    // Fixed aircraft symbol.
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 16, y);
    ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 16, y);
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x, y + 6);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#4a5560';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();
    text('ATT', x, y + radius - 12, 11, '#9fb4c2', 'center', MONO);
  }

  function drawLamp(x, y, label, on, color) {
    ctx.fillStyle = on ? color : '#2a2f36';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, TAU);
    ctx.fill();
    if (on) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(x - 2, y - 2, 3, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#4a5560';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, TAU);
    ctx.stroke();
    text(label, x, y + 22, 10, on ? '#eaf6ff' : '#7d8b96', 'center', MONO);
  }

  function drawCockpit(flight) {
    const panelY = H - 168;
    // Panel body.
    const grad = ctx.createLinearGradient(0, panelY, 0, H);
    grad.addColorStop(0, '#2b313a');
    grad.addColorStop(0.08, PALETTE.panel);
    grad.addColorStop(1, '#171b20');
    ctx.fillStyle = grad;
    ctx.fillRect(0, panelY, W, H - panelY);
    ctx.fillStyle = '#454e58';
    ctx.fillRect(0, panelY, W, 3);
    // Compass tape across the top of the panel.
    const headingDeg = ((flight.heading * 180) / Math.PI + 360) % 360;
    ctx.fillStyle = '#10151c';
    ctx.fillRect(0, panelY + 3, W, 26);
    const points = ['N', '030', '060', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
    for (let i = -6; i <= 6; i += 1) {
      const deg = Math.round((headingDeg + i * 10) / 10) * 10;
      const norm = ((deg % 360) + 360) % 360;
      const label = points[(norm / 30) % 12] || String(norm).padStart(3, '0');
      const x = W / 2 + i * 64 - (((headingDeg % 10) / 10) * 64);
      ctx.fillStyle = norm % 90 === 0 ? '#ffd27a' : '#9fb4c2';
      ctx.font = `bold 12px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, panelY + 21);
      ctx.fillRect(x - 0.5, panelY + 24, 1, 5);
    }
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 7, panelY + 3);
    ctx.lineTo(W / 2 + 7, panelY + 3);
    ctx.lineTo(W / 2, panelY + 12);
    ctx.closePath();
    ctx.fill();

    // Gauges.
    drawGauge(150, panelY + 96, 52, 'AIRSPEED', knots(flight.speed), 200, 'KT');
    drawAttitude(flight, 330, panelY + 96, 52);
    drawGauge(510, panelY + 96, 52, 'ALTITUDE', feet(flight.alt), 1000, 'FT');
    // Vertical speed needle.
    text('V/S', 640, panelY + 62, 11, '#9fb4c2', 'center', MONO);
    const vs = clamp(flight.verticalSpeed, -12, 12);
    ctx.strokeStyle = PALETTE.gaugeLit;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(640, panelY + 128);
    ctx.lineTo(640 + vs * 4, panelY + 128);
    ctx.stroke();
    ctx.strokeStyle = '#4a5560';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(640, panelY + 78);
    ctx.lineTo(640, panelY + 128);
    ctx.stroke();
    text(`${vs >= 0 ? '+' : ''}${Math.round(vs * 3.28 * 60)} fpm`, 640, panelY + 148, 10, '#eaf6ff', 'center', MONO);

    // Throttle lever.
    text('THROTTLE', 760, panelY + 62, 11, '#9fb4c2', 'center', MONO);
    ctx.fillStyle = '#10151c';
    ctx.fillRect(748, panelY + 70, 24, 64);
    ctx.strokeStyle = '#4a5560';
    ctx.strokeRect(748, panelY + 70, 24, 64);
    const leverY = panelY + 70 + (1 - flight.throttle) * 56;
    ctx.fillStyle = '#ffb02e';
    ctx.fillRect(744, leverY, 32, 8);
    text(`${Math.round(flight.throttle * 100)}%`, 760, panelY + 152, 11, '#eaf6ff', 'center', MONO);

    // Fuel bar.
    text('FUEL', 850, panelY + 62, 11, '#9fb4c2', 'center', MONO);
    ctx.fillStyle = '#10151c';
    ctx.fillRect(820, panelY + 70, 60, 14);
    ctx.fillStyle = flight.fuel < 20 ? PALETTE.gaugeBad : PALETTE.gaugeLit;
    ctx.fillRect(820, panelY + 70, 60 * (flight.fuel / 100), 14);
    text(`${Math.round(flight.fuel)}%`, 850, panelY + 100, 11, '#eaf6ff', 'center', MONO);
    text('DAMAGE', 850, panelY + 118, 11, '#9fb4c2', 'center', MONO);
    ctx.fillStyle = '#10151c';
    ctx.fillRect(820, panelY + 132, 60, 10);
    ctx.fillStyle = flight.damage > 0 ? PALETTE.gaugeBad : '#3a4048';
    ctx.fillRect(820, panelY + 132, 60 * (flight.damage / 100), 10);

    // Gear / flaps lamps.
    drawLamp(950, panelY + 84, 'GEAR', flight.gear, '#37d67a');
    drawLamp(1010, panelY + 84, 'FLAPS', flight.flaps, '#37d67a');
    drawLamp(1070, panelY + 84, 'STALL', flight.airborne && flight.speed < 27, '#ff5a4e');

    // Score block on the panel's right.
    text('SCORE', 1150, panelY + 62, 11, '#9fb4c2', 'center', MONO);
    text(String(flight.score), 1150, panelY + 92, 26, '#ffd27a', 'center', MONO);
    text(`RING ${Math.min(flight.ringIndex, 6)}/6`, 1150, panelY + 116, 12, '#eaf6ff', 'center', MONO);
    text('C camera · F flaps · G gear', 1150, panelY + 140, 10, '#7d8b96', 'center', MONO);
  }

  function drawHud(flight) {
    // Top-left: the three numbers the judge looks for, big and lit.
    roundedPanel(18, 16, 384, 92, 10, 'rgba(10, 16, 22, 0.88)', 'rgba(140, 180, 205, 0.45)');
    const headingDeg = ((flight.heading * 180) / Math.PI + 360) % 360;
    const cells = [
      ['ALT', `${Math.round(feet(flight.alt)).toLocaleString('en-US')} FT`],
      ['SPD', `${Math.round(knots(flight.speed))} KT`],
      ['HDG', `${String(Math.round(headingDeg)).padStart(3, '0')}°`],
    ];
    cells.forEach((cell, i) => {
      const x = 38 + i * 126;
      text(cell[0], x, 42, 12, PALETTE.hudDim, 'left', MONO);
      text(cell[1], x, 76, 21, PALETTE.hudText, 'left', MONO);
    });
    // Top-right: clock, fuel, stage.
    roundedPanel(W - 378, 16, 360, 92, 10, 'rgba(10, 16, 22, 0.88)', 'rgba(140, 180, 205, 0.45)');
    const mins = Math.floor(flight.timeLeft / 60);
    const secs = Math.floor(flight.timeLeft % 60);
    text('TIME', W - 356, 42, 12, PALETTE.hudDim, 'left', MONO);
    text(`${mins}:${String(secs).padStart(2, '0')}`, W - 356, 76, 21, flight.timeLeft < 60 ? '#ff8a7a' : PALETTE.hudText, 'left', MONO);
    text('FUEL', W - 232, 42, 12, PALETTE.hudDim, 'left', MONO);
    ctx.fillStyle = '#10151c';
    ctx.fillRect(W - 232, 56, 110, 12);
    ctx.fillStyle = flight.fuel < 20 ? PALETTE.gaugeBad : PALETTE.gaugeLit;
    ctx.fillRect(W - 232, 56, 110 * (flight.fuel / 100), 12);
    text('STAGE', W - 96, 42, 12, PALETTE.hudDim, 'left', MONO);
    const stageName = flight.stage === STAGE_TAKEOFF ? 'TAKEOFF' : flight.stage === STAGE_RINGS ? 'RINGS' : flight.stage === STAGE_LANDING ? 'LANDING' : 'DONE';
    text(stageName, W - 40, 76, 21, '#ffd27a', 'right', MONO);

    // Top-centre: mission banner.
    const objective =
      flight.stage === STAGE_TAKEOFF
        ? 'THROTTLE UP — ROTATE AT 70 KT'
        : flight.stage === STAGE_RINGS
          ? `FLY RING ${flight.ringIndex + 1} OF 6`
          : flight.stage === STAGE_LANDING
            ? 'GEAR DOWN — LAND ON RIDGE RUNWAY'
            : 'SORTIE COMPLETE';
    ctx.font = `bold 17px ${MONO}`;
    const bannerW = ctx.measureText(objective).width + 36;
    roundedPanel(W / 2 - bannerW / 2, 16, bannerW, 36, 18, 'rgba(10, 16, 22, 0.88)', 'rgba(255, 210, 122, 0.55)');
    text(objective, W / 2, 40, 17, '#ffd27a', 'center', MONO);

    // Centre message.
    if (flight.messageTime > 0 && flight.message) {
      ctx.globalAlpha = clamp(flight.messageTime, 0, 1);
      ctx.font = `bold 24px ${MONO}`;
      const mw = ctx.measureText(flight.message).width + 40;
      roundedPanel(W / 2 - mw / 2, 118, mw, 44, 12, 'rgba(10, 16, 22, 0.78)', 'rgba(255, 210, 122, 0.6)');
      text(flight.message, W / 2, 148, 24, '#ffe9a8', 'center', MONO);
      ctx.globalAlpha = 1;
    }
    // Ring flash.
    if (flight.ringFlash > 0) {
      ctx.globalAlpha = clamp(flight.ringFlash, 0, 0.5);
      ctx.fillStyle = '#37d67a';
      ctx.fillRect(0, 0, W, 10);
      ctx.fillRect(0, H - 10, W, 10);
      ctx.globalAlpha = 1;
    }
  }

  function drawWorld(flight, terrain, view) {
    const cam = camera(flight, view);
    drawSky(flight, cam);
    const horizon = horizonY(cam);
    drawRidgeLayer(flight.heading, 0, horizon - 6, 46, 'rgba(90, 120, 150, 0.55)');
    drawRidgeLayer(flight.heading, 900, horizon - 2, 30, 'rgba(70, 100, 130, 0.7)');
    drawSea(horizon);
    const sorted = [...terrain.islands].sort((a, b) => {
      const da = Math.hypot(a.x - cam.cam.x, a.z - cam.cam.z);
      const db = Math.hypot(b.x - cam.cam.x, b.z - cam.cam.z);
      return db - da;
    });
    for (const island of sorted) drawIsland(terrain, cam, island);
    drawRunway(terrain, cam);
    drawLighthouse(terrain, cam);
    drawCity(terrain, cam);
    drawClouds(terrain, cam);
    drawRings(flight, cam);
  }

  function drawTitle(flight, terrain, best) {
    drawWorld(flight, terrain, 'chase');
    drawPlane(flight);
    box(0, 0, W, H, '#0a1016', 0.45);
    text('SKYHOOK RIDGE', W / 2, 150, 64, '#ffffff', 'center', FONT);
    text('A KESTREL K-7 ISLAND SORTIE', W / 2, 190, 20, '#ffd27a', 'center', MONO);
    roundedPanel(W / 2 - 330, 240, 660, 250, 14, 'rgba(10, 16, 22, 0.82)', 'rgba(140, 180, 205, 0.5)');
    const lines = [
      'Take off from Ridge Runway, thread all 6 glowing rings',
      'over the islands, then bring her home and land.',
      '',
      '↑ / W  climb      ↓ / S  descend      ← → / A D  bank & turn',
      'SHIFT  throttle up      CTRL  throttle down',
      'F  flaps      G  gear      C  camera      P  pause',
      'Click the throttle lever, or use the mouse to start.',
    ];
    lines.forEach((line, i) => {
      text(line, W / 2, 282 + i * 30, line.startsWith('↑') || line.startsWith('SHIFT') || line.startsWith('F  ') || line.startsWith('Click') ? 16 : 17, line === '' ? '#fff' : '#dfe9ef', 'center', MONO);
    });
    if (best > 0) text(`BEST SCORE  ${best}`, W / 2, 520, 18, '#8ef0b2', 'center', MONO);
    const pulse = 0.65 + Math.sin(flight.time * 4) * 0.35;
    ctx.globalAlpha = pulse;
    text('PRESS ENTER OR CLICK TO FLY', W / 2, 580, 24, '#ffd27a', 'center', MONO);
    ctx.globalAlpha = 1;
  }

  function drawOver(flight, best) {
    drawWorld(flight, flight.terrain, 'chase');
    if (!flight.crashed) drawPlane(flight);
    box(0, 0, W, H, '#0a1016', 0.55);
    const won = flight.landed;
    text(won ? 'SORTIE COMPLETE' : flight.failed ? 'MISSION FAILED' : 'CRASHED', W / 2, 190, 56, won ? '#8ef0b2' : '#ff8a7a', 'center', FONT);
    text(won ? 'The Kestrel is back on Ridge Runway.' : flight.failReason, W / 2, 232, 20, '#dfe9ef', 'center', MONO);
    roundedPanel(W / 2 - 260, 280, 520, 190, 14, 'rgba(10, 16, 22, 0.85)', 'rgba(140, 180, 205, 0.5)');
    const rows = [
      ['SCORE', String(flight.score)],
      ['BEST', String(Math.max(best, flight.score))],
      ['RINGS', `${Math.min(flight.ringIndex, 6)} / 6`],
      ['DISTANCE FLOWN', `${(flight.distanceFlown / 1000).toFixed(1)} km`],
      ['TIME', `${Math.floor(flight.time / 60)}:${String(Math.floor(flight.time % 60)).padStart(2, '0')}`],
    ];
    rows.forEach((row, i) => {
      text(row[0], W / 2 - 220, 322 + i * 32, 16, '#9fb4c2', 'left', MONO);
      text(row[1], W / 2 + 220, 322 + i * 32, 16, '#eaf6ff', 'right', MONO);
    });
    text('PRESS ENTER TO FLY AGAIN', W / 2, 530, 22, '#ffd27a', 'center', MONO);
  }

  function draw(flight, terrain, screen, best, view) {
    ctx.clearRect(0, 0, W, H);
    if (screen === SCREEN_TITLE) {
      drawTitle(flight, terrain, best);
      return;
    }
    if (screen === SCREEN_OVER) {
      drawOver(flight, best);
      return;
    }
    drawWorld(flight, terrain, view);
    if (view !== 'cockpit') drawPlane(flight);
    drawCockpit(flight);
    drawHud(flight);
    if (screen === SCREEN_PAUSED) {
      box(0, 0, W, H, '#0a1016', 0.5);
      text('PAUSED', W / 2, H / 2 - 10, 56, '#ffffff', 'center', FONT);
      text('Press P or Enter to resume', W / 2, H / 2 + 34, 20, '#dfe9ef', 'center', MONO);
    }
  }

  return { draw, resize };
}
