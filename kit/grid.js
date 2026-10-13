// Grid: the Launchpad Mini over Web MIDI, plus its on-screen twin.
//
//   const grid = new Grid({ twin: document.querySelector('#twin') });
//   grid.on('press', e => ...);              // e: { index, kind, x, y, source, time }
//   grid.on('release', e => ...);            // ... plus heldMs
//   await grid.connect();                    // asks for MIDI permission; status: connected,
//                                            //   searching, standby (another page has it), denied…
//   grid.show(grid.frame().grid(0, 0, C.GREEN));
//   await grid.scroll('hello');              // needs SysEx permission
//
// Hardware and twin produce identical events (source says which), and show()
// drives both, so an instrument works with or without the device.

import { Frame, MSG, C, SIZE, decode, describe } from './launchpad.js';
import { Renderer } from './renderer.js';
import { Twin } from './twin.js';

// The original protocol is shared by the Launchpad, Launchpad S and the 2013
// Mini. Later models (MK2, MK3, Pro, X) speak something else.
const SPEAKS_ORIGINAL = name => /launchpad/i.test(name) && !/mk ?[23]|pro|lpmini|lpx|\bx\b/i.test(name);

export class Grid {
  constructor({ twin = null, labels = {}, colour, maxFps = 120 } = {}) {
    this.current = new Frame();
    this.renderer = new Renderer();
    this.listeners = new Map();
    this.held = new Map();                    // index → { at, source }
    this.status = 'idle';
    this.sysex = false;
    this.access = this.input = this.output = null;
    this.scrolling = null;                    // { resolve, timer } while text scrolls
    this.measuring = false;
    this.identityWaiters = [];
    this.minInterval = 1000 / maxFps;
    this.lastSend = 0;
    this.flushTimer = 0;
    if (twin) {
      this.twin = twin instanceof Twin ? twin : new Twin(twin, { labels, colour });
      this.twin.onInput = (type, index) => this.#input(type, index, 'twin');
    }
    // window listeners, kept so dispose() can take them off again
    this.onPageHide = () => this.close();
    this.onFocus = () => this.claim();
    this.onPointer = () => this.claim();
    this.onState = () => this.#bind();
    addEventListener('pagehide', this.onPageHide);

    // One page drives the Mini at a time. Pages from the same origin pass it
    // between them over a BroadcastChannel: the page last connected, focused
    // or clicked takes it, and the others stop sending and ignore its buttons
    // (two pages writing LEDs at once leave the grid matching neither).
    this.id = Math.random().toString(36).slice(2);
    this.owner = true;
    this.channel = 'BroadcastChannel' in globalThis ? new BroadcastChannel('launchpad-mini') : null;
    if (this.channel) this.channel.onmessage = ({ data }) => {
      if (data?.type === 'claim' && data.id !== this.id) this.#yieldDevice();
    };
    addEventListener('focus', this.onFocus);
    addEventListener('pointerdown', this.onPointer, true);
  }

  // Take the Mini from any other page and redraw it from scratch.
  claim() {
    if (!this.access) return;
    const had = this.owner;
    this.owner = true;
    this.channel?.postMessage({ type: 'claim', id: this.id });
    if (!had && this.output) {
      this.#send(this.renderer.invalidate());
      this.#flush(true);
      this.#setStatus('connected', this.output.name);
    }
  }

  #yieldDevice() {
    if (!this.owner) return;
    this.owner = false;
    clearTimeout(this.flushTimer); this.flushTimer = 0;
    if (this.scrolling) { clearTimeout(this.scrolling.timer); this.scrolling.resolve(false); this.scrolling = null; }
    for (const [index, h] of this.held) if (h.source === 'hardware') this.#input('release', index, 'hardware');
    if (this.output) this.#setStatus('standby', this.output.name);
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type).delete(fn);
  }

  frame() { return new Frame(); }

  // ---------------------------------------------------------- connection --

  // Ask for MIDI access (SysEx too, for scrolling text) and find the Mini.
  // Resolves to the status: connected, searching, denied or unsupported.
  async connect({ sysex = true } = {}) {
    if (!navigator.requestMIDIAccess) return this.#setStatus('unsupported');
    try {
      this.access = await navigator.requestMIDIAccess({ sysex });
      this.sysex = sysex;
    } catch (err) {
      if (!sysex) return this.#setStatus('denied', err.message);
      try {
        this.access = await navigator.requestMIDIAccess();      // try without SysEx
        this.sysex = false;
      } catch (err2) {
        return this.#setStatus('denied', err2.message);
      }
    }
    this.access.addEventListener('statechange', this.onState);
    this.#bind();
    return this.status;
  }

  ports() {
    if (!this.access) return [];
    return [...this.access.inputs.values(), ...this.access.outputs.values()]
      .map(p => `${p.type}: ${p.name} (${p.state})`);
  }

  #bind() {
    const pick = ports => [...ports.values()].find(p => p.state === 'connected' && SPEAKS_ORIGINAL(p.name)) ?? null;
    const input = pick(this.access.inputs), output = pick(this.access.outputs);
    if (input === this.input && output === this.output) return;

    if (this.input) this.input.onmidimessage = null;
    for (const [index, h] of this.held) if (h.source === 'hardware') this.#input('release', index, 'hardware');
    this.#endScroll(false, false);
    this.input = input;
    this.output = output;
    if (input) input.onmidimessage = e => this.#message(e.data);

    if (output) {
      this.owner = true;
      this.channel?.postMessage({ type: 'claim', id: this.id });
      this.#send(this.renderer.init());
      this.#flush(true);
      this.#setStatus('connected', output.name);
    } else {
      this.#setStatus('searching', this.ports().join('; ') || 'no MIDI ports');
    }
  }

  // Leave the Mini dark when the page goes away.
  // Everything off: LEDs dark, MIDI released, listeners and channel gone, the
  // twin removed. For a page that unmounts the instrument (SPA navigation).
  dispose() {
    this.close();
    removeEventListener('pagehide', this.onPageHide);
    removeEventListener('focus', this.onFocus);
    removeEventListener('pointerdown', this.onPointer, true);
    this.access?.removeEventListener('statechange', this.onState);
    if (this.input) this.input.onmidimessage = null;
    if (this.scrolling) { clearTimeout(this.scrolling.timer); this.scrolling = null; }
    this.channel?.close();
    this.channel = null;
    this.listeners.clear();
    this.twin?.destroy();
    this.input = this.output = this.access = null;
  }

  close() {
    clearTimeout(this.flushTimer);
    if (this.output) this.#send(MSG.reset());
  }

  #setStatus(status, detail = '') {
    this.status = status;
    this.#emit('status', { status, detail, sysex: this.sysex });
    return status;
  }

  // --------------------------------------------------------------- input --

  #message(data) {
    if (!this.owner) return;                  // another page has the Mini
    const ev = decode(data);
    this.#emit('midi', { data: Array.from(data), event: ev });
    if (!ev) return;
    if (ev.type === 'press' || ev.type === 'release') this.#input(ev.type, ev.index, 'hardware');
    else if (ev.type === 'scroll-done') this.#endScroll(true);
    else if (ev.type === 'identity') this.identityWaiters.splice(0).forEach(fn => fn(ev));
  }

  #input(type, index, source) {
    const time = performance.now();
    const d = describe(index);
    if (type === 'press') {
      this.held.set(index, { at: time, source });
      if (source === 'hardware') this.twin?.mark(index, true);
      this.#emit('press', { ...d, source, time });
    } else {
      const h = this.held.get(index);
      this.held.delete(index);
      if (source === 'hardware') this.twin?.mark(index, false);
      this.#emit('release', { ...d, source, time, heldMs: h ? time - h.at : 0 });
    }
  }

  #emit(type, detail) { this.listeners.get(type)?.forEach(fn => fn(detail)); }

  // -------------------------------------------------------------- output --

  // Show a frame on the twin now and on the Mini as soon as the frame-rate
  // cap allows. Unchanged frames cost nothing.
  // `twinFrame`, if given, is what the twin shows instead (e.g. a steady mark
  // where the hardware blinks, for a reader who asked for reduced motion).
  show(frame, twinFrame) {
    this.current = frame instanceof Frame ? frame.copy() : new Frame(frame);
    this.twin?.render(twinFrame ?? this.current);
    this.#flush();
  }

  #flush(force = false) {
    if (!this.output || !this.owner || this.scrolling || this.measuring) return;
    const wait = this.lastSend + this.minInterval - performance.now();
    if (wait > 0 && !force) {
      if (!this.flushTimer) this.flushTimer = setTimeout(() => { this.flushTimer = 0; this.#flush(); }, wait);
      return;
    }
    const bytes = this.renderer.plan(this.current);
    if (bytes) { this.#send(bytes); this.lastSend = performance.now(); }
  }

  #send(bytes) {
    try { this.output?.send(bytes); }
    catch (err) { this.#emit('error', err); }
  }

  brightness(numerator, denominator) { this.#send(MSG.brightness(numerator, denominator)); }

  // ------------------------------------------------------------- scrolling --

  // Scroll text across the Mini (see MSG.scroll for speed changes). Frames
  // shown meanwhile reach the twin, and the Mini catches up when the text
  // ends. Resolves true when the Mini reports the end, false if it was stopped,
  // timed out or could not run (no device or no SysEx permission).
  scroll(text, opts = {}) {
    if (!this.output || !this.owner || !this.sysex) return Promise.resolve(false);
    this.#endScroll(false);
    clearTimeout(this.flushTimer); this.flushTimer = 0;
    this.#send(MSG.scroll(text, { ...opts, loop: false }));
    const chars = [].concat(text).filter(t => typeof t === 'string').join('').length;
    return new Promise(resolve => {
      const timer = setTimeout(() => this.#endScroll(false), 4000 + chars * 2500);
      this.scrolling = { resolve, timer };
    });
  }

  stopScroll() { this.#endScroll(false); }

  #endScroll(finished, redraw = true) {
    if (!this.scrolling) return;
    const { resolve, timer } = this.scrolling;
    clearTimeout(timer);
    this.scrolling = null;
    if (!finished) this.#send(MSG.scrollStop());
    if (redraw && this.output) { this.#send(this.renderer.invalidate()); this.#flush(true); }
    resolve(finished);
  }

  // ------------------------------------------------------------ diagnostics --

  // Device inquiry. Resolves to { manufacturer, family } or null.
  identify(timeoutMs = 1000) {
    if (!this.output || !this.owner || !this.sysex) return Promise.resolve(null);
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.identityWaiters = this.identityWaiters.filter(f => f !== done); resolve(null); }, timeoutMs);
      const done = ev => { clearTimeout(timer); resolve(ev); };
      this.identityWaiters.push(done);
      this.#send(MSG.inquiry());
    });
  }

  // Throughput: send `frames` full-surface frames back to back, then a device
  // inquiry. The Mini answers in order, so the reply time bounds how long it
  // took to take in every frame. Needs SysEx.
  async measure(frames = 100) {
    if (!this.output || !this.owner || !this.sysex || this.scrolling) return null;
    this.measuring = true;
    const a = new Frame(), b = new Frame();
    for (let i = 0; i < SIZE; i++) {
      const odd = (i + (i >> 3)) & 1;
      a.data[i] = odd ? C.RED : C.GREEN;
      b.data[i] = odd ? C.GREEN : C.RED;
    }
    const t0 = performance.now();
    for (let k = 0; k < frames; k++) this.#send(this.renderer.plan(k & 1 ? b : a));
    const reply = await this.identify(10000);
    const ms = performance.now() - t0;
    this.measuring = false;
    this.#flush(true);
    return reply ? { frames, ms, fps: frames / (ms / 1000) } : null;
  }
}
