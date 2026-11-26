// Skyhook Ridge — all sound is synthesised live with WebAudio oscillators and
// filtered noise: no audio files, no network. Engine hum follows the throttle,
// wind rises with speed, a chime marks each ring, and a low thud marks a crash.
// Audio starts only after the first user gesture, as browsers require.
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let started = false;

  function ensure() {
    if (started) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();

      const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = context.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = context.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(context.destination);
      windSource.start();
      started = true;
    } catch {
      started = false;
    }
  }

  function update(throttle, speed, airborne) {
    if (!started || !context) return;
    const now = context.currentTime;
    engineOsc.frequency.setTargetAtTime(52 + throttle * 68, now, 0.1);
    engineGain.gain.setTargetAtTime(airborne ? 0.045 + throttle * 0.05 : 0.03 + throttle * 0.05, now, 0.15);
    windGain.gain.setTargetAtTime(Math.min(0.09, Math.max(0, (speed - 20) * 0.0016)), now, 0.2);
    windFilter.frequency.setTargetAtTime(500 + speed * 9, now, 0.2);
  }

  function blip(frequency, duration, type, volume) {
    if (!started || !context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume || 0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + duration);
  }

  function ringChime() {
    blip(880, 0.35, 'sine', 0.14);
    setTimeout(() => blip(1318, 0.4, 'sine', 0.12), 90);
  }

  function thud() {
    blip(70, 0.5, 'triangle', 0.25);
  }

  function click() {
    blip(1200, 0.06, 'square', 0.05);
  }

  return { ensure, update, ringChime, thud, click };
}
