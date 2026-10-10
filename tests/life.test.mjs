import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, parseRule, step, changes, population, key, seeded, neighbours } from '../omen-life/life.js';

const LIFE = parseRule('B3/S23');
const board = cells => { const b = new Uint8Array(64); for (const [x, y] of cells) b[y * 8 + x] = 1; return b; };

test('parses B/S rules, including an empty survive set', () => {
  assert.deepEqual(LIFE.born.flatMap((v, n) => v ? [n] : []), [3]);
  assert.deepEqual(LIFE.survive.flatMap((v, n) => v ? [n] : []), [2, 3]);
  assert.ok(parseRule('B2/S').survive.every(v => !v));
  assert.throws(() => parseRule('23/3'));
  for (const r of RULES) assert.doesNotThrow(() => parseRule(r.code));
  assert.equal(RULES.length, 8);
});

test('neighbours wrap around the torus', () => {
  const b = board([[7, 7], [0, 7], [7, 0]]);
  assert.equal(neighbours(b, 0, 0), 3);
});

test('a block is still, a blinker has period 2', () => {
  const block = board([[2, 2], [3, 2], [2, 3], [3, 3]]);
  assert.deepEqual(step(block, LIFE), block);
  const blinker = board([[3, 2], [3, 3], [3, 4]]);
  const once = step(blinker, LIFE);
  assert.notDeepEqual(once, blinker);
  assert.deepEqual(once, board([[2, 3], [3, 3], [4, 3]]));
  assert.deepEqual(step(once, LIFE), blinker);
});

test('a glider crosses the 8×8 torus and returns after 32 generations', () => {
  const glider = board([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]);
  let b = glider;
  for (let g = 1; g <= 32; g++) {
    b = step(b, LIFE);
    assert.equal(population(b), 5, `generation ${g}`);
    if (g < 32) assert.notDeepEqual(b, glider);
  }
  assert.deepEqual(b, glider);
});

test('seeds (B2/S): nothing survives a generation', () => {
  const b = seeded(42);
  const next = step(b, parseRule('B2/S'));
  for (let i = 0; i < 64; i++) if (b[i]) assert.equal(next[i], 0);
});

test('changes() splits born, died and kept', () => {
  const now = board([[0, 0], [1, 0]]), next = board([[1, 0], [2, 0]]);
  assert.deepEqual(changes(now, next), { born: [2], died: [0], kept: [1] });
});

test('seed No. N is deterministic; key() tells boards apart', () => {
  assert.deepEqual(seeded(7), seeded(7));
  assert.notDeepEqual(seeded(7), seeded(8));
  assert.equal(key(seeded(7)), key(seeded(7)));
  assert.notEqual(key(seeded(7)), key(seeded(8)));
  assert.equal(key(new Uint8Array(64)), '0'.repeat(16));
  const p = population(seeded(7));
  assert.ok(p > 8 && p < 34, `density near 0.3, got ${p}`);
});
