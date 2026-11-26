// Keyboard and mouse input: arrows/WASD fly the aircraft, Shift/Ctrl work the
// throttle, F flaps, G gear, C toggles the chase/cockpit camera, P pauses, and
// Enter or a click starts. The mouse also drives the on-screen throttle lever.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_FLAPS = 4;
export const ACTION_GEAR = 8;
export const ACTION_CAMERA = 16;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouse = { x: 0, y: 0, down: false, clicked: false };

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.key.toLowerCase());
    if (event.key === 'Enter' || event.key === ' ') actions |= ACTION_CONFIRM;
    if (event.key.toLowerCase() === 'p' || event.key === 'Escape') actions |= ACTION_PAUSE;
    if (event.key.toLowerCase() === 'f') actions |= ACTION_FLAPS;
    if (event.key.toLowerCase() === 'g') actions |= ACTION_GEAR;
    if (event.key.toLowerCase() === 'c') actions |= ACTION_CAMERA;
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top, down: true, clicked: true };
  }

  function onMouseUp() {
    mouse.down = false;
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onMouseMove);

  function direction() {
    const pitch = (keys.has('arrowup') || keys.has('w') ? 1 : 0) + (keys.has('arrowdown') || keys.has('s') ? -1 : 0);
    const roll = (keys.has('arrowleft') || keys.has('a') ? -1 : 0) + (keys.has('arrowright') || keys.has('d') ? 1 : 0);
    const throttle = (keys.has('shift') ? 1 : 0) + (keys.has('control') ? -1 : 0);
    return { pitch, roll, throttle };
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  function takeClick() {
    const clicked = mouse.clicked;
    mouse.clicked = false;
    return clicked ? { x: mouse.x, y: mouse.y } : null;
  }

  return { direction, takeActions, takeClick, mouse: () => mouse };
}
