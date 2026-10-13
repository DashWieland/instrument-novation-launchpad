import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Harmonizer, functionOf } from '../choir/harmonizer.js';
import { chooseFigure, surfaceOf } from '../choir/figures.js';
import { playedWithPads } from '../tools/choir-eval.mjs';

const chord = (s, a, t, b, extra = {}) => ({ s, a, t, b, tonicPc: 0, mode: 'major', cadence: false, ...extra });

test('options: a second chord with another name, usually another colour', () => {
  const h = new Harmonizer(7, 'major');
  for (const s of [67, 71, 74]) h.next(s);
  let n = 0, other = 0, differentFn = 0;
  for (const s of [72, 74, 76, 78, 79, 81, 83, 84]) {
    const { a, b } = h.options(s);
    n++;
    if (!b) continue;
    other++;
    assert.notEqual(a.name, b.name);
    assert.equal(b.s, s);
    if (functionOf(a.name) !== functionOf(b.name)) differentFn++;
  }
  assert.ok(other >= 6 && differentFn >= 4, `${other}/${n} with a second chord, ${differentFn} in another colour`);
});

test('figures follow the melody first: suspension, anticipation, passing note, neighbour', () => {
  const prev = chord(74, 67, 59, 43);                                   // D5 over G
  assert.deepEqual(chooseFigure(prev, chord(72, 64, 60, 45)), { type: 'suspension', voice: 's', pitch: 74 });
  assert.deepEqual(chooseFigure(prev, chord(76, 67, 60, 48)), { type: 'anticipation', voice: 's', pitch: 76 });
  assert.deepEqual(chooseFigure(prev, chord(77, 69, 62, 50)), { type: 'passing', voice: 's', pitch: 76 });
  assert.deepEqual(chooseFigure(prev, chord(74, 65, 59, 43)), { type: 'neighbour', voice: 's', pitch: 76 });
  assert.equal(chooseFigure(null, prev), null);                          // nothing to move from
  // after a cadence the next chord starts a phrase: no suspension across it
  assert.notEqual(chooseFigure({ ...prev, cadence: true }, chord(72, 64, 60, 45))?.type, 'suspension');
});

test('surface: a suspension takes the new beat, a lead-in the old off-beat', () => {
  const a = chord(74, 67, 59, 43);
  const b = chord(72, 64, 60, 45, { figure: { type: 'suspension', voice: 's', pitch: 74 } });   // D held over, resolves to C
  const c = chord(74, 66, 62, 48, { figure: { type: 'bass passing', voice: 'b', pitch: 47 } });  // A → B → C in the bass
  const { events } = surfaceOf([a, b, c]);
  assert.deepEqual(events.s, [[74, 2], [74, 1], [72, 1], [74, 2]]);
  assert.deepEqual(events.b, [[43, 2], [45, 1], [47, 1], [48, 2]]);
  // and a figure never leads into a voice still resolving a suspension
  assert.notEqual(chooseFigure(b, chord(74, 65, 60, 46))?.voice, 's');
});

test('all four pads at random: no chord rule broken, and the figures add nothing the ornament checker rejects', () => {
  let figures = 0, tries = 0;
  for (let i = 1; i <= 200; i++) {
    const p = playedWithPads(i);
    assert.deepEqual(p.h.check().V.filter(v => !v.startsWith('s:')), [], `melody ${i}: chords`);
    assert.deepEqual(p.surface.V, [], `melody ${i}: figures`);
    figures += p.used.figure; tries += p.used.figure + p.used.none;
  }
  assert.ok(figures / tries > 0.85, `a figure fitted ${figures}/${tries}`);
});
