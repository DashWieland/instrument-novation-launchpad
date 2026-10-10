// Protocol: every expected byte below comes from the Launchpad S Programmer's
// Reference v1.02 or was captured from this unit (HARDWARE.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, C, MSG, Frame, decode, describe, colour, gridIndex, rightIndex, topIndex, FLAGS_BOTH } from '../kit/launchpad.js';

// What the Mini sends when button `index` is pressed (X-Y layout).
function hardwarePress(index) {
  const d = describe(index);
  if (d.kind === 'grid') return [0x90, 16 * d.y + d.x, 127];
  if (d.kind === 'right') return [0x90, 16 * d.y + 8, 127];
  return [0xB0, 104 + d.x, 127];
}

test('all 80 buttons decode to their own index, press and release', () => {
  for (let i = 0; i < SIZE; i++) {
    const down = hardwarePress(i);
    assert.deepEqual([decode(down).type, decode(down).index], ['press', i], `press ${i}`);
    assert.equal(decode([down[0], down[1], 0]).type, 'release', `release ${i}`);
  }
  assert.equal(decode([0x80, 0x00, 0x40]).type, 'release');          // note-off form
  assert.equal(new Set(Array.from({ length: SIZE }, (_, i) => decode(hardwarePress(i)).index)).size, 80);
});

test('index helpers and describe agree', () => {
  assert.equal(gridIndex(0, 0), 0);
  assert.equal(gridIndex(7, 7), 63);
  assert.deepEqual(describe(rightIndex(3)), { index: 67, kind: 'right', x: 8, y: 3 });
  assert.deepEqual(describe(topIndex(5)), { index: 77, kind: 'top', x: 5, y: -1 });
});

test('colours match the manual with copy+clear flags', () => {
  assert.equal(colour(3, 0) | FLAGS_BOTH, 0x0F);   // full red
  assert.equal(colour(0, 3) | FLAGS_BOTH, 0x3C);   // full green
  assert.equal(colour(3, 3) | FLAGS_BOTH, 0x3F);   // full amber
  assert.equal(C.OFF | FLAGS_BOTH, 0x0C);          // off
  assert.equal(colour(2, 3) | FLAGS_BOTH, 0x3E);   // full yellow
});

test('LED messages: second-from-bottom left pad red; cursor-left button green', () => {
  assert.deepEqual(MSG.led(gridIndex(0, 6), C.RED), [0x90, 0x60, 0x0F]);
  assert.deepEqual(MSG.led(topIndex(2), C.GREEN), [0xB0, 0x6A, 0x3C]);
  assert.deepEqual(MSG.led(rightIndex(0), C.AMBER), [0x90, 0x08, 0x3F]);
});

test('buffer control bytes match the manual table', () => {
  assert.deepEqual(MSG.buffers(), [0xB0, 0, 0x20]);                                        // simple
  assert.deepEqual(MSG.buffers({ display: 0, update: 1 }), [0xB0, 0, 0x24]);
  assert.deepEqual(MSG.buffers({ display: 1, update: 0 }), [0xB0, 0, 0x21]);
  assert.deepEqual(MSG.buffers({ display: 0, update: 1, copy: true }), [0xB0, 0, 0x34]);
  assert.deepEqual(MSG.buffers({ display: 1, update: 0, copy: true }), [0xB0, 0, 0x31]);
  assert.deepEqual(MSG.buffers({ flash: true }), [0xB0, 0, 0x28]);
});

test('rapid update: 40 channel-3 messages in index order', () => {
  const data = Uint8Array.from({ length: SIZE }, (_, i) => i % 64);
  const bytes = MSG.rapid(data, 0);
  assert.equal(bytes.length, 120);
  for (let m = 0; m < 40; m++) assert.deepEqual(bytes.slice(3 * m, 3 * m + 3), [0x92, data[2 * m], data[2 * m + 1]]);
  // The manual's top-row example: red, orange-ish, amber, …, green, with flags.
  const top = [15, 31, 47, 63, 63, 62, 61, 60].map(v => v & 0x33);
  const f = new Frame(); top.forEach((c, x) => f.grid(x, 0, c));
  assert.deepEqual(MSG.rapid(f.data).slice(0, 12), [0x92, 15, 31, 0x92, 47, 63, 0x92, 63, 62, 0x92, 61, 60]);
});

test('brightness fractions match the manual', () => {
  assert.deepEqual(MSG.brightness(1, 16), [0xB0, 0x1E, 0x0D]);
  assert.deepEqual(MSG.brightness(1, 11), [0xB0, 0x1E, 0x08]);
  assert.deepEqual(MSG.brightness(1, 5), [0xB0, 0x1E, 0x02]);
  assert.deepEqual(MSG.brightness(1, 3), [0xB0, 0x1E, 0x00]);
  assert.deepEqual(MSG.brightness(9, 3), [0xB0, 0x1F, 0x00]);
});

test('scrolling text matches the manual hello-world, and the probe that ran on this unit', () => {
  const manual = [240, 0, 32, 41, 9, 124, 5, 72, 101, 108, 108, 111, 32, 2, 119, 111, 114, 108, 100, 33, 247];
  assert.deepEqual(MSG.scroll([5, 'Hello ', 2, 'world!'], { colour: C.GREEN, loop: true }), manual);
  const probe = [0xF0, 0x00, 0x20, 0x29, 0x09, 0x3F, 0x07, ...Buffer.from('hi dash'), 0xF7];
  assert.deepEqual(MSG.scroll('hi dash', { colour: C.AMBER, speed: 7 }), probe);
  assert.deepEqual(MSG.scrollStop(), [240, 0, 32, 41, 9, 0, 247]);
});

test('decodes scroll-end and the identity reply captured from this unit', () => {
  assert.deepEqual(decode([0xB0, 0x00, 0x03]), { type: 'scroll-done' });
  const id = decode([0xF0, 0x7E, 0x00, 0x06, 0x02, 0x00, 0x20, 0x29, 0x36, 0x00, 0xF7]);
  assert.deepEqual(id, { type: 'identity', manufacturer: [0x00, 0x20, 0x29], family: [0x36, 0x00] });
  assert.equal(decode([0xB0, 0x07, 0x40]), null);
});
