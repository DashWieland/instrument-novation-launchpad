import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Harmonizer, functionOf, CADENTIAL } from '../choir/harmonizer.js';
import { lowerDo, keyAt, pitchOf, playable, LOWEST, TOP_NOTE } from '../choir/layout.js';
import { run, playedMelody, bachMelody, cadencesByRegister } from '../tools/choir-eval.mjs';

const choirBreaks = V => V.filter(v => !v.startsWith('s:'));     // 's:' = the melody's own leaps

test('layout: columns are do…do\' in every key; bottom half the lower octave, top half the upper', () => {
  for (let pc = 0; pc < 12; pc++) {
    const d = lowerDo(pc);
    assert.ok(d >= LOWEST && d <= LOWEST + 11 && d % 12 === pc, `tonic ${pc} → ${d}`);
  }
  assert.deepEqual(Array.from({ length: 8 }, (_, c) => pitchOf(7, 'major', c, 0)), [67, 69, 71, 72, 74, 76, 78, 79]);
  assert.equal(pitchOf(7, 'major', 0, 1), 79);                    // the upper half starts at do'
  assert.deepEqual(keyAt(0, 7), { col: 0, octave: 0 });           // bottom-left: low do
  assert.deepEqual(keyAt(0, 4), { col: 0, octave: 0 });           // the key is four pads tall
  assert.deepEqual(keyAt(7, 0), { col: 7, octave: 1 });           // top-right: do''
  assert.ok(playable(TOP_NOTE) && !playable(TOP_NOTE + 1) && !playable(LOWEST - 1));
});

test('minor: the 6th and 7th rise when the melody climbs to them, fall when it comes down', () => {
  // A minor: lower do is A4 (69); col 5 is le/la (F/F♯), col 6 te/ti (G/G♯)
  assert.equal(pitchOf(9, 'minor', 6, 0, 76), 80);                // E → up to G♯ (ti)
  assert.equal(pitchOf(9, 'minor', 6, 0, 81), 79);                // A → down to G (te)
  assert.equal(pitchOf(9, 'minor', 6, 0, 77), 79);                // from F (le): G, not the augmented second
  assert.equal(pitchOf(9, 'minor', 5, 0, 76), 78);                // E → up to F♯ (la)
  assert.equal(pitchOf(9, 'minor', 5, 0, 81), 77);                // A → down to F (le)
  assert.equal(pitchOf(9, 'minor', 6, 0, null), 79);              // first note: natural
});

test('every playable key can open a piece, in every key and mode', () => {
  for (let pc = 0; pc < 12; pc++) for (const mode of ['major', 'minor']) {
    for (const octave of [0, 1]) for (let col = 0; col < 8; col++) for (const prev of [null, 40, 90]) {
      const s = pitchOf(pc, mode, col, octave, prev);
      if (!playable(s)) continue;
      const c = new Harmonizer(pc, mode).next(s);
      assert.equal(c.s, s);
      assert.ok(c.s >= c.a && c.a >= c.t && c.t >= c.b, `${pc} ${mode} ${s}: ${JSON.stringify(c)}`);
      assert.ok(c.s - c.b > 3);
    }
  }
});

test('peek previews the chord next() will sing, and sings nothing', () => {
  const h = new Harmonizer(2, 'minor');
  for (const s of [62, 65, 64]) h.next(s);
  const before = h.chords.length;
  const seen = h.peek(69, { cadence: true });
  assert.equal(h.chords.length, before);
  assert.deepEqual(h.next(69, { cadence: true }), seen);
});

test('chords sort into home, away and tension', () => {
  for (const n of ['I', 'vi', 'i', 'VI', 'III']) assert.equal(functionOf(n), 'home', n);
  for (const n of ['ii', 'IV', 'ii7', 'iio', 'iv', 'iio7', 'bVII']) assert.equal(functionOf(n), 'away', n);
  for (const n of ['V', 'V7', 'viio', 'viio7', 'v', 'iii', 'V/V', 'V7/V', 'viio/V', 'V/ii', 'V/vi', 'V7/vi', 'V7/IV', 'V/iv', 'V7/iv'])
    assert.equal(functionOf(n), 'tension', n);
});

test('random played melodies: the choir breaks no hard rule', () => {
  let chords = 0;
  for (let i = 1; i <= 300; i++) {
    const r = run(playedMelody(i));
    chords += r.h.chords.length;
    assert.deepEqual(choirBreaks(r.V), [], `melody ${i}`);
    assert.ok(r.stages.every(s => s < 2), `melody ${i} needed the last-resort search`);
  }
  assert.ok(chords > 10000);
});

test("Bach's own sopranos, harmonized live: no hard rule broken", () => {
  for (let n = 1; n <= 60; n++) assert.deepEqual(run(bachMelody(n)).V, [], `piece ${n}`);
});

test('fast enough to play: median well under a millisecond per note', () => {
  const times = [];
  for (let i = 1; i <= 50; i++) times.push(...run(playedMelody(i)).times);
  times.sort((a, b) => a - b);
  assert.ok(times[times.length >> 1] < 1, `median ${times[times.length >> 1]} ms`);
});

test('deterministic, and cadences become fermatas for the checker', () => {
  const m = playedMelody(42);
  const a = run(m).h.chords, b = run(m).h.chords;
  assert.deepEqual(a, b);
  const h = new Harmonizer(0, 'major');
  for (const s of [72, 71, 69, 67]) h.next(s);
  h.next(67, { cadence: true });
  assert.deepEqual(h.fermatas, [5]);
  assert.equal(h.chords.at(-1).cadence, true);
});

test('an armed cadence ends only on I, V, vi (minor: i, V, VI, III), root in the bass', () => {
  const ROOT = { major: { I: 0, V: 7, vi: 9 }, minor: { i: 0, V: 7, VI: 8, III: 3 } };
  let endings = 0;
  for (let i = 1; i <= 300; i++) {
    const { tonicPc, mode, melody } = playedMelody(i);
    const h = new Harmonizer(tonicPc, mode);
    for (const { s, cadence } of melody) {
      const c = h.next(s, { cadence });
      if (!c.cadence) continue;
      endings++;
      assert.ok(CADENTIAL[mode].has(c.name), `${mode}: ended on ${c.name}`);
      assert.equal(((c.b - tonicPc) % 12 + 12) % 12, ROOT[mode][c.name], `${c.name} not in root position`);
    }
    assert.equal(h.fermatas.length, h.chords.filter(c => c.cadence).length);
  }
  assert.ok(endings > 1000);
});

test('a note that cannot end a phrase plays on, and the cadence is still owed', () => {
  const h = new Harmonizer(0, 'major');                   // C major
  h.next(72); h.next(71);
  const c = h.next(77, { cadence: true });                // fa: in none of I, V, vi
  assert.equal(c.cadence, false);
  assert.deepEqual(h.fermatas, []);
  assert.equal(h.next(72, { cadence: true }).cadence, true);
});

test('phrases close on I as surely on the low do as on the middle do', () => {
  const by = cadencesByRegister(150);
  const band = (lo, hi) => { let n = 0, c = 0, e = 0; for (let m = lo; m <= hi; m++) { const r = by.get(m); if (r) { n += r.n; c += r.closed; e += r.ended; } } return { closed: c / n, ended: e / n }; };
  const low = band(60, 71), mid = band(72, 83);
  assert.ok(low.ended > 0.95 && mid.ended > 0.95, JSON.stringify({ low, mid }));
  assert.ok(low.closed > 0.75 && low.closed > mid.closed - 0.1, JSON.stringify({ low, mid }));
  for (const r of by.values()) { assert.equal(r.broke, 0); assert.equal(r.invalid, 0); }
});
