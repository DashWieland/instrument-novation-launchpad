// Omen Life's voices. Births are plucked and bright; deaths are low, breathy
// ghosts that sit mostly in the reverb. Plain Web Audio, no samples.

export class Sound {
  constructor() {
    const ctx = this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(comp).connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = impulse(ctx, 3.2, 2.4);
    this.send = ctx.createGain();
    this.send.gain.value = 0.32;
    this.send.connect(this.verb).connect(this.out);
  }

  get now() { return this.ctx.currentTime; }
  resume() { return this.ctx.resume(); }

  #route(node, pan, dry, wet) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    const d = this.ctx.createGain(); d.gain.value = dry; p.connect(d).connect(this.out);
    const w = this.ctx.createGain(); w.gain.value = wet; p.connect(w).connect(this.send);
  }

  birth(freq, when, { gain = 0.16, pan = 0, length = 1.4 } = {}) {
    const ctx = this.ctx, t = Math.max(when, ctx.currentTime);
    const tri = ctx.createOscillator(); tri.type = 'triangle'; tri.frequency.value = freq;
    const oct = ctx.createOscillator(); oct.type = 'sine'; oct.frequency.value = freq * 2;
    const octGain = ctx.createGain(); octGain.gain.value = 0.28;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(Math.min(freq * 9, 12000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.4, 180), t + length * 0.5);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    tri.connect(lp); oct.connect(octGain).connect(lp); lp.connect(env);
    this.#route(env, pan, 1, 0.8);
    tri.start(t); oct.start(t); tri.stop(t + length + 0.05); oct.stop(t + length + 0.05);
  }

  death(freq, when, { gain = 0.09, pan = 0, length = 2.2 } = {}) {
    const ctx = this.ctx, t = Math.max(when, ctx.currentTime);
    const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = freq;
    const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = freq * 1.006;
    const breath = noise(ctx, length);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 3; bp.Q.value = 6;
    const breathGain = ctx.createGain(); breathGain.gain.value = 0.18;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(freq * 4, 1400);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.09);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    a.connect(lp); b.connect(lp); breath.connect(bp).connect(breathGain).connect(lp); lp.connect(env);
    this.#route(env, pan, 0.45, 1.3);
    for (const s of [a, b, breath]) { s.start(t); s.stop(t + length + 0.05); }
  }
}

function noise(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  return src;
}

function impulse(ctx, seconds, decay) {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
