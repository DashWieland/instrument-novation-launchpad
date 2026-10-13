import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Harmonizer, rungOf, wants, functionOf } from '../choir/harmonizer.js';
import { playedWithLadder } from '../tools/choir-eval.mjs';

test('a ladder is four chords for the note, settled at the bottom, tense at the top', () => {
  const h = new Harmonizer(7, 'major');                      // G major
  for (const s of [67, 71, 74]) h.next(s);
  for (const s of [67, 69, 71, 72, 74, 76, 78, 79]) {
    const L = h.ladder(s);
    assert.equal(L.length, 4);
    assert.ok(L.every(c => c.s === s));
    for (let i = 1; i < 4; i++) assert.ok(rungOf(L[i].name) >= rungOf(L[i - 1].name), `${s}: ${L.map(c => c.name)}`);
  }
  // the bottom rung is the tonic itself where it fits (not vi, a deceptive stand-in)
  assert.equal(h.ladder(74)[0].name, 'I');
});

test('the pulsing pads: a dominant wants its tonic, a secondary dominant its target, an away chord a dominant', () => {
  const h = new Harmonizer(0, 'major');                      // C major
  const at = name => { const c = h.ladder(72).concat(h.ladder(74), h.ladder(76), h.ladder(77), h.ladder(79)).find(x => x.name === name); assert.ok(c, name); return c; };
  h.next(72); h.next(74);
  const V = { ...at('V') }, VofII = h.ladder(76).find(c => c.name === 'V/ii'), IV = at('IV');
  const fake = (name, ci) => ({ name, ci, tonicPc: 0, mode: 'major' });
  assert.equal(wants(V)(fake('I', 0)), true);
  assert.equal(wants(V)(fake('vi', 5)), false);
  if (VofII) assert.equal(wants(VofII)(fake('ii', 1)), true);
  assert.equal(wants(IV)(fake('V', 4)), true);
  assert.equal(wants(fake('I', 0)), null);                   // settled: free to go anywhere
  assert.equal(functionOf('V/ii'), 'tension');
});

test('random rungs: no rule broken; whatever the last chord wants, some key offers it', () => {
  let wanted = 0, offered = 0, distinct = 0, notes = 0;
  for (let i = 1; i <= 120; i++) {
    const { h, stats } = playedWithLadder(i);
    assert.deepEqual(h.check().V.filter(v => !v.startsWith('s:')), [], `melody ${i}`);
    wanted += stats.wanted; offered += stats.offered; distinct += stats.distinct; notes += stats.notes;
  }
  assert.ok(offered / wanted > 0.99, `${offered}/${wanted}`);
  assert.ok(distinct / notes > 3.5, `${(distinct / notes).toFixed(2)} distinct chords per key`);
});
