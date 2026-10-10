// Launchpad Mini (original, 2013) protocol, which it shares with the Launchpad S.
// Pure: frames and bytes in, bytes and events out. No Web MIDI here.
// Source: Launchpad S Programmer's Reference v1.02; probed on this unit (HARDWARE.md).

export const SIZE = 80;          // 64 grid pads + 8 right-column + 8 top-row buttons

// Button index: 0–63 grid (y * 8 + x, y = 0 is the top row), 64–71 the right
// column (by y), 72–79 the top row (by x). This is also the order the Mini's
// rapid-update mode walks, so a frame goes out in index order.
export const gridIndex = (x, y) => y * 8 + x;
export const rightIndex = y => 64 + y;
export const topIndex = x => 72 + x;

export function describe(index) {
  if (index < 64) return { index, kind: 'grid', x: index & 7, y: index >> 3 };
  if (index < 72) return { index, kind: 'right', x: 8, y: index - 64 };
  return { index, kind: 'top', x: index - 72, y: -1 };
}

// ------------------------------------------------------------------ colour --

// A colour is a red level and a green level, each 0–3: code = 16·green + red.
// The two high flag bits (copy, clear) are added at send time, not stored.
export const colour = (red, green) => (green << 4) | red;
export const levels = code => ({ red: code & 3, green: (code >> 4) & 3 });

// The states that read as distinct on this unit (HARDWARE.md). Full red with
// any green looks like one orange, so there is a single AMBER.
export const C = Object.freeze({
  OFF: colour(0, 0),
  RED_DIM: colour(1, 0),
  RED: colour(3, 0),
  GREEN_DIM: colour(0, 1),
  GREEN: colour(0, 3),
  AMBER_DIM: colour(1, 1),
  AMBER: colour(3, 3),
  YELLOW: colour(2, 3),
});

// Velocity flag bits, which tell the Mini what to do with the *other* buffer.
export const FLAGS_BOTH = 12;    // copy + clear: write both buffers (simple mode)
export const FLAGS_NONE = 0;     // write only the update buffer (double-buffered)

// ------------------------------------------------------------------- frame --

export class Frame {
  constructor(data) { this.data = data ? Uint8Array.from(data) : new Uint8Array(SIZE); }
  get(i) { return this.data[i]; }
  set(i, c) { this.data[i] = c; return this; }
  grid(x, y, c) { this.data[gridIndex(x, y)] = c; return this; }
  right(y, c) { this.data[rightIndex(y)] = c; return this; }
  top(x, c) { this.data[topIndex(x)] = c; return this; }
  fill(c) { this.data.fill(c); return this; }
  clear() { return this.fill(C.OFF); }
  copy() { return new Frame(this.data); }
}

// ---------------------------------------------------------------- messages --

const SYSEX_HEAD = [0xF0, 0x00, 0x20, 0x29, 0x09];

export const MSG = {
  // All LEDs off, every setting back to power-on (X-Y layout, simple buffers).
  reset: () => [0xB0, 0x00, 0x00],
  layoutXY: () => [0xB0, 0x00, 0x01],
  layoutDrumRack: () => [0xB0, 0x00, 0x02],

  // Buffer control, from the original Launchpad reference:
  // 0x20 | copy << 4 | flash << 3 | update << 2 | display.
  // 0x31 and 0x34 are the manual's double-buffering pair.
  buffers: ({ display = 0, update = 0, flash = false, copy = false } = {}) =>
    [0xB0, 0x00, 0x20 | (copy ? 16 : 0) | (flash ? 8 : 0) | (update << 2) | display],

  // One LED. Grid and right column are notes on channel 1; the top row is CC 104–111.
  led(index, code, flags = FLAGS_BOTH) {
    const v = code | flags;
    if (index < 64) return [0x90, 16 * (index >> 3) + (index & 7), v];
    if (index < 72) return [0x90, 16 * (index - 64) + 8, v];
    return [0xB0, 104 + index - 72, v];
  },

  // Rapid update: channel-3 note-ons, two LEDs per message, all 80 in index
  // order. Any channel-1 message aborts it and resets the Mini's cursor.
  rapid(data, flags = FLAGS_BOTH) {
    const out = [];
    for (let i = 0; i < SIZE; i += 2) out.push(0x92, data[i] | flags, data[i + 1] | flags);
    return out;
  },

  // Global brightness, as a fraction numerator/denominator (1–16 / 3–18).
  // Default is 1/5; above 1/3 is not much use and loads the USB host.
  brightness(numerator, denominator) {
    const n = clamp(Math.round(numerator), 1, 16), d = clamp(Math.round(denominator), 3, 18);
    return n < 9 ? [0xB0, 0x1E, 16 * (n - 1) + (d - 3)] : [0xB0, 0x1F, 16 * (n - 9) + (d - 3)];
  },

  // Scrolling text. `text` is a string, or an array mixing strings with speed
  // changes (integers 1–7, 1 slowest). The Mini restores the LEDs afterwards
  // and sends CC 0 = 3 when the text ends or loops.
  scroll(text, { colour: code = C.AMBER, loop = false, speed } = {}) {
    const body = [];
    if (speed) body.push(clamp(speed, 1, 7));
    for (const part of Array.isArray(text) ? text : [text]) {
      if (typeof part === 'number') body.push(clamp(part, 1, 7));
      else for (const ch of String(part)) {
        const b = ch.charCodeAt(0);
        body.push(b >= 0x20 && b <= 0x7E ? b : 0x3F);       // non-ASCII → '?'
      }
    }
    return [...SYSEX_HEAD, (code | FLAGS_BOTH) + (loop ? 64 : 0), ...body, 0xF7];
  },
  scrollStop: () => [...SYSEX_HEAD, 0x00, 0xF7],

  inquiry: () => [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7],
};

// ------------------------------------------------------------------- input --

// Decode one incoming MIDI message: a button press or release, the end of a
// text scroll, or a device-inquiry reply. Anything else is null.
export function decode(data) {
  const [status, d1, d2] = data;
  if (status === 0x90 || status === 0x80) {
    const row = d1 >> 4, col = d1 & 15;
    if (row > 7 || col > 8) return null;
    const index = col === 8 ? rightIndex(row) : gridIndex(col, row);
    return { type: status === 0x90 && d2 > 0 ? 'press' : 'release', ...describe(index) };
  }
  if (status === 0xB0) {
    if (d1 >= 104 && d1 <= 111) return { type: d2 > 0 ? 'press' : 'release', ...describe(topIndex(d1 - 104)) };
    if (d1 === 0 && d2 === 3) return { type: 'scroll-done' };
    return null;
  }
  if (status === 0xF0 && data[1] === 0x7E && data[3] === 0x06 && data[4] === 0x02)
    return { type: 'identity', manufacturer: [data[5], data[6], data[7]], family: [data[8], data[9]] };
  return null;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
