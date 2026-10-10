import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../kit/renderer.js';
import { C, Frame, SIZE, topIndex } from '../kit/launchpad.js';

const split = bytes => { const out = []; for (let i = 0; i < bytes.length; i += 3) out.push(bytes.slice(i, i + 3)); return out; };

test('init resets, then shows buffer 0 and writes buffer 1', () => {
  const r = new Renderer();
  assert.deepEqual(r.init(), [0xB0, 0, 0, 0xB0, 0, 0x34]);
});

test('an unchanged frame costs nothing', () => {
  const r = new Renderer(); r.init();
  assert.equal(r.plan(new Frame()), null);
});

test('small changes: one message per LED (hidden buffer only), then a swap that alternates 0x31/0x34', () => {
  const r = new Renderer(); r.init();
  const f = new Frame().grid(2, 1, C.GREEN).top(0, C.RED);
  assert.deepEqual(split(r.plan(f)), [[0x90, 0x12, 0x30], [0xB0, 104, 0x03], [0xB0, 0, 0x31]]);
  f.grid(2, 1, C.OFF);
  assert.deepEqual(split(r.plan(f)), [[0x90, 0x12, 0x00], [0xB0, 0, 0x34]]);
  f.grid(0, 0, C.AMBER);
  assert.deepEqual(split(r.plan(f)).at(-1), [0xB0, 0, 0x31]);
});

test('more than 40 changes: one rapid update of all 80 LEDs, then the swap', () => {
  const r = new Renderer(); r.init();
  const f = new Frame().fill(C.GREEN);
  const msgs = split(r.plan(f));
  assert.equal(msgs.length, 41);
  assert.ok(msgs.slice(0, 40).every(m => m[0] === 0x92 && m[1] === 0x30 && m[2] === 0x30));
  assert.deepEqual(msgs[40], [0xB0, 0, 0x31]);
});

test('invalidate forces a full redraw from buffered mode', () => {
  const r = new Renderer(); r.init();
  const f = new Frame().grid(0, 0, C.RED);
  r.plan(f);
  assert.deepEqual(r.invalidate(), [0xB0, 0, 0x34]);
  const msgs = split(r.plan(f));
  assert.equal(msgs.length, 41);                    // all 80 rewritten via rapid update
  assert.deepEqual(msgs[0], [0x92, C.RED, C.OFF]);
});

test('accepts a raw Uint8Array and copies it (later mutation does not leak)', () => {
  const r = new Renderer(); r.init();
  const data = new Uint8Array(SIZE); data[topIndex(7)] = C.YELLOW;
  r.plan(data);
  data[topIndex(7)] = C.OFF;
  assert.deepEqual(split(r.plan(data))[0], [0xB0, 111, C.OFF]);
});
