// Plans the bytes that turn the Mini's LEDs into a given frame, flicker-free.
// Pure: it tracks what the Mini is showing and returns messages; it never sends.
//
// Double buffering: the Mini holds two LED buffers. We write the hidden one,
// then swap with copy, so every changed LED appears at once and the new hidden
// buffer starts as a copy of what is on screen (the manual's 0x31/0x34 cycle).
// Small changes go as one message per LED; when more than 40 LEDs change, a
// rapid update (40 messages for all 80 LEDs) is cheaper.

import { SIZE, MSG, FLAGS_NONE } from './launchpad.js';

const UNKNOWN = 0xFF;            // no colour code is 0xFF, so this forces a write

export class Renderer {
  constructor() {
    this.shown = new Uint8Array(SIZE).fill(UNKNOWN);
    this.display = 0;
  }

  // Messages for a freshly connected Mini: reset (all LEDs off), then show
  // buffer 0 and write buffer 1.
  init() {
    this.shown.fill(0);
    this.display = 0;
    return [...MSG.reset(), ...MSG.buffers({ display: 0, update: 1, copy: true })];
  }

  // Forget what the Mini shows (after a text scroll, which takes over the LEDs)
  // and re-enter buffered mode; the next plan() redraws everything.
  invalidate() {
    this.shown.fill(UNKNOWN);
    this.display = 0;
    return MSG.buffers({ display: 0, update: 1, copy: true });
  }

  // Bytes that make the Mini show `frame` (a Frame or a Uint8Array of 80
  // colour codes), or null if it already does.
  plan(frame) {
    const data = frame.data ?? frame;
    const changed = [];
    for (let i = 0; i < SIZE; i++) if (data[i] !== this.shown[i]) changed.push(i);
    if (!changed.length) return null;

    const out = changed.length > 40
      ? MSG.rapid(data, FLAGS_NONE)
      : changed.flatMap(i => MSG.led(i, data[i], FLAGS_NONE));

    // Swap: show the buffer we just wrote, write the other, copy shown → other.
    const next = 1 - this.display;
    out.push(...MSG.buffers({ display: next, update: this.display, copy: true }));
    this.display = next;
    this.shown.set(data);
    return out;
  }
}
