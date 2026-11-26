[![Make the best flight game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/newmrd0003-create/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/newmrd0003-create/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Skyhook Ridge — a Kestrel K-7 island sortie

A complete, original flight game that runs offline in a desktop browser from
static files. Take off from Ridge Runway in the Kestrel K-7, thread six
glowing rings over a recognisable archipelago — harbour city, lighthouse rock,
forested peak and two volcanoes — then bring her home and land on the same
strip before the clock or the fuel runs out.

## How a sortie goes

1. **Takeoff** — throttle up on the runway, rotate at 70 knots, climb away.
2. **The ring course** — fly all 6 rings in order. Each one cleared scores
   250 points and lights the next.
3. **Landing** — return to Ridge Runway, gear down, flaps down, touch down
   gentle and slow. A hard, fast or gear-up arrival is a crash.

Fuel burns with throttle and the sortie clock runs for 6 minutes, so a sortie
is a set of decisions: push the throttle and burn fuel, or cruise and save
it; bank hard and turn fast, or fly smooth and keep speed. A stall warning
lamp lights below 55 knots, and the attitude, airspeed and altitude gauges
on the lit cockpit panel show exactly what the aircraft is doing.

## Controls

- **↑ / W** climb, **↓ / S** descend, **← → / A D** bank and turn
- **Shift** throttle up, **Ctrl** throttle down (or drag the throttle lever
  on the cockpit panel with the mouse)
- **F** flaps, **G** gear, **C** chase / cockpit camera, **P** pause
- **Enter** or click to start, **Enter** to fly again after landing or a crash

## Play it

Serve `game/` with any static server — `node serve.ts` serves it at
http://localhost:8080 — and open `game/index.html` in desktop Chrome.
No network request, no build step, all sound synthesised live with WebAudio.

## Screenshots

`?shot=takeoff|rings|landing|coast&seed=7` stages each scene
deterministically from the real flight rules, so the same seed always gives
the same frame.
