import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signature, distance, closeness, destinations, keyName } from '../choir/keys.js';
import { Harmonizer } from '../choir/harmonizer.js';
import { journey } from '../tools/choir-eval.mjs';

const K = (tonicPc, mode = 'major') => ({ tonicPc, mode });

test('key signatures and distances', () => {
  assert.deepEqual([0, 7, 2, 5, 10, 6].map(pc => signature(K(pc))), [0, 1, 2, -1, -2, 6]);
  assert.equal(signature(K(9, 'minor')), 0);                       // A minor, like C major
  assert.equal(distance(K(7), K(4, 'minor')), 0);                  // G major and E minor: same notes
  assert.equal(distance(K(7), K(7, 'minor')), 3);                  // G major and G minor
  assert.deepEqual([0, 1, 2, 3, 4, 6].map(closeness), ['near', 'near', 'middle', 'middle', 'far', 'far']);
});

test('destinations: home, the five closely related keys, the parallel key, one far key', () => {
  const g = destinations(K(7));
  assert.deepEqual(g.map(keyName), ['G', 'D', 'C', 'Em', 'Am', 'Bm', 'Gm', 'E♭']);
  assert.deepEqual(g.map(d => closeness(distance(K(7), d))), ['near', 'near', 'near', 'near', 'near', 'near', 'middle', 'far']);
  const a = destinations(K(9, 'minor'));
  assert.deepEqual(a.map(keyName), ['Am', 'C', 'Em', 'Dm', 'F', 'G', 'A', 'Fm']);
  assert.deepEqual(a.map(d => closeness(distance(K(9, 'minor'), d))), ['near', 'near', 'near', 'near', 'near', 'near', 'middle', 'far']);
});

test('a key change keeps the history; each chord remembers its key, and the checker uses it', () => {
  const h = new Harmonizer(7, 'major');
  for (const s of [71, 72, 74]) h.next(s);
  h.modulate(2, 'major');
  const c = h.next(73);
  assert.equal(h.chords.length, 4);
  assert.deepEqual([h.chords[0].tonicPc, c.tonicPc], [7, 2]);
  // Two F♯s: a doubled leading tone in G major, but F♯ is mi in D major.
  const fsharps = { s: 78, a: 66, t: 62, b: 50, ci: 0, name: 'I', cadence: false, stage: 0 };
  const doubled = key => { const g = new Harmonizer(7, 'major'); g.chords = [{ ...fsharps, ...key }]; return g.check().W.some(w => /doubled leading tone/.test(w)); };
  assert.equal(doubled({ tonicPc: 7, mode: 'major' }), true);
  assert.equal(doubled({ tonicPc: 2, mode: 'major' }), false);
});

test('journeys between keys: no rule broken, and following the lights arrives in two notes', () => {
  let trips = 0, inTwo = 0, inFour = 0, inEight = 0, onTonic = 0;
  for (let i = 1; i <= 120; i++) {
    const { h, trips: T } = journey(i);
    assert.deepEqual(h.check().V.filter(v => !v.startsWith('s:')), [], `journey ${i}`);
    assert.ok(h.chords.every(c => c.stage < 2), `journey ${i} needed the last-resort search`);
    for (const t of T) { trips++; if (t.steps <= 2) inTwo++; if (t.steps <= 4) inFour++; if (t.steps <= 8) inEight++; if (t.closed) onTonic++; }
  }
  assert.ok(inTwo / trips > 0.9, `${inTwo}/${trips} in two notes`);
  assert.ok(inFour / trips >= 0.99, `${inFour}/${trips} in four notes`);
  assert.equal(inEight, trips);
  assert.equal(onTonic, trips);
});
