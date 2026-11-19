// Ambient sounds generated with the Web Audio API — no audio files to host.
export const AMBIENT = [
  { id: 'none', label: 'Silence', icon: 'volume-x' },
  { id: 'rain', label: 'Soft rain', icon: 'cloud-rain' },
  { id: 'waves', label: 'Ocean waves', icon: 'waves' },
  { id: 'brown', label: 'Brown noise', icon: 'wind' },
  { id: 'night', label: 'Night crickets', icon: 'moon-star' },
];

let ctx = null;
let master = null;
let nodes = [];
let current = 'none';

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(type) {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function noiseSource(type) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(type);
  src.loop = true;
  return src;
}

function lfo(freq, depth, target) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = freq;
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  nodes.push(o);
}

export function stopAmbient() {
  nodes.forEach((n) => {
    try {
      n.stop?.();
      n.disconnect();
    } catch {
      /* already stopped */
    }
  });
  nodes = [];
  current = 'none';
}

export function playAmbient(id, volume = 0.4) {
  stopAmbient();
  if (id === 'none' || !audio()) return;
  master.gain.value = volume;
  current = id;
  if (id === 'rain') {
    const src = noiseSource('white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    src.connect(hp).connect(lp).connect(g).connect(master);
    src.start();
    nodes.push(src);
  } else if (id === 'waves') {
    const src = noiseSource('brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    lfo(0.09, 0.3, g.gain);
    src.connect(lp).connect(g).connect(master);
    src.start();
    nodes.push(src);
  } else if (id === 'brown') {
    const src = noiseSource('brown');
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(g).connect(master);
    src.start();
    nodes.push(src);
  } else if (id === 'night') {
    const src = noiseSource('brown');
    const g = ctx.createGain();
    g.gain.value = 0.15;
    src.connect(g).connect(master);
    src.start();
    nodes.push(src);
    // crickets: a high tone gated by a fast square LFO, pulsing slowly
    const tone = ctx.createOscillator();
    tone.frequency.value = 4400;
    const gate = ctx.createGain();
    gate.gain.value = 0;
    const chirp = ctx.createOscillator();
    chirp.type = 'square';
    chirp.frequency.value = 28;
    const chirpDepth = ctx.createGain();
    chirpDepth.gain.value = 0.02;
    chirp.connect(chirpDepth).connect(gate.gain);
    lfo(0.5, 0.02, gate.gain);
    tone.connect(gate).connect(master);
    tone.start();
    chirp.start();
    nodes.push(tone, chirp);
  }
}

export function setVolume(v) {
  if (master) master.gain.value = v;
}

export const currentAmbient = () => current;

/** A gentle two-note chime for session completion. */
export function chime() {
  if (!audio()) return;
  const t = ctx.currentTime;
  [523.25, 783.99].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t + i * 0.18);
    g.gain.linearRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 1.4);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.18);
    o.stop(t + i * 0.18 + 1.5);
  });
}
