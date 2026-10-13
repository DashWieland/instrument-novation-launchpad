// How good is the live harmonizer? Feeds it melodies one note at a time, as
// a player would, and scores the result with the engine's own checker.
//
//   node tools/choir-eval.mjs [melodies=300]
//
// Two kinds of melody:
//   played — random walks over the grid's pitches (mostly steps, some leaps,
//            a cadence every 5–9 notes), in all 12 keys, major and minor;
//   Bach   — the sopranos of the engine's composed pieces, with their fermatas,
//            so the live result can be set beside the engine's own (which
//            plans each phrase ahead).

import { Harmonizer, functionOf, CADENTIAL, wants } from '../choir/harmonizer.js';
import { pitchOf, playable } from '../choir/layout.js';
import { destinations, sameKey, distance } from '../choir/keys.js';
import { tripView, tripPlay } from '../choir/trip.js';
import { chooseFigure, checkFigures } from '../choir/figures.js';
import { composePiece, checkChorale } from '../vendor/choral-counterpoint/engine.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const STEPS = [[0, 8], [1, 30], [-1, 30], [2, 9], [-2, 9], [3, 4], [-3, 4], [4, 2], [-4, 2], [5, 1], [-5, 1], [7, 0.5], [-7, 0.5]];

// The keyboard as a player walks it: key k = 0…14 is do…do'' (k ≥ 7 is the
// upper octave; k = 7 is either half's do'), the pitch as the grid gives it,
// minor's 6th and 7th inflected by direction. Keys above C6 stay unplayed.
const keyPitch = (tonicPc, mode, k, prev) =>
  k < 7 ? pitchOf(tonicPc, mode, k, 0, prev) : pitchOf(tonicPc, mode, k - 7, 1, prev);

export function playedMelody(seed) {
  const r = rng(seed);
  const tonicPc = Math.floor(r() * 12), mode = r() < 0.5 ? 'major' : 'minor';
  let top = 14;
  while (!playable(keyPitch(tonicPc, mode, top, null))) top--;
  const n = 24 + Math.floor(r() * 24);
  let k = 2 + Math.floor(r() * 9), untilCadence = 5 + Math.floor(r() * 5), prev = null;
  const melody = [];
  for (let i = 0; i < n; i++) {
    const s = keyPitch(tonicPc, mode, Math.min(k, top), prev);
    melody.push({ s, cadence: --untilCadence === 0 || i === n - 1 });
    prev = s;
    if (untilCadence === 0) untilCadence = 5 + Math.floor(r() * 5);
    const total = STEPS.reduce((a, [, w]) => a + w, 0);
    let x = r() * total, step = 0;
    for (const [st, w] of STEPS) { x -= w; if (x <= 0) { step = st; break; } }
    k = Math.max(0, Math.min(top, k + step));
  }
  return { tonicPc, mode, melody };
}

export function bachMelody(n) {
  const p = composePiece(n);
  const fermataChords = new Set(fermatasOf(p).map(f => f - 1));
  return {
    tonicPc: p.tonicPc, mode: p.mode, piece: p,
    melody: p.skeleton.s.map((s, i) => ({ s, cadence: fermataChords.has(i) || i === p.skeleton.s.length - 1 })),
  };
}
// composePiece reports fermatas as eighth positions: 2·(f − 1).
const fermatasOf = p => p.fermataEighths.map(e => e / 2 + 1);

export function run({ tonicPc, mode, melody }) {
  const h = new Harmonizer(tonicPc, mode);
  const times = [];
  for (const { s, cadence } of melody) {
    const t0 = performance.now();
    const c = h.next(s, { cadence });
    times.push(performance.now() - t0);
    if (c.s !== s) throw new Error('soprano changed');
    if (!(c.s >= c.a && c.a >= c.t && c.t >= c.b)) throw new Error('voices out of order');
  }
  const { V, W } = h.check();
  return { h, V, W, times, stages: h.chords.map(c => c.stage) };
}

function summarize(label, results) {
  const chords = results.reduce((a, r) => a + r.h.chords.length, 0);
  const own = v => v.startsWith('s:');          // the melody's own leaps: the player's, not the choir's
  const V = results.reduce((a, r) => a + r.V.filter(v => !own(v)).length, 0);
  const VS = results.reduce((a, r) => a + r.V.filter(own).length, 0);
  const W = results.reduce((a, r) => a + r.W.length, 0);
  const stages = [0, 0, 0];
  for (const r of results) for (const s of r.stages) stages[s]++;
  const times = results.flatMap(r => r.times).sort((a, b) => a - b);
  const kinds = {};
  for (const r of results) for (const v of r.V.filter(v => !own(v))) { const k = v.replace(/\s*\(.*$/, ''); kinds[k] = (kinds[k] || 0) + 1; }
  console.log(`${label}: ${results.length} melodies, ${chords} chords`);
  console.log(`  hard-rule breaks ${V} (${(V / chords * 100).toFixed(2)} per 100 chords)${V ? '  ' + JSON.stringify(kinds) : ''}`);
  if (VS) console.log(`  (plus ${VS} in the melody itself: leaps the player made, not the choir)`);
  const wk = {};
  for (const r of results) for (const w of r.W) { const k = w.replace(/^chord \d+: /, '').replace(/\s*\(.*$/, ''); wk[k] = (wk[k] || 0) + 1; }
  const top = Object.entries(wk).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${(n / chords * 100).toFixed(1)}`).join(', ');
  console.log(`  warnings ${(W / chords * 100).toFixed(1)} per 100 chords: ${top}`);
  console.log(`  search stage 0/1/2: ${stages.join(' / ')}`);
  console.log(`  ms per note: median ${times[times.length >> 1].toFixed(2)}, p99 ${times[Math.floor(times.length * 0.99)].toFixed(2)}, max ${times.at(-1).toFixed(2)}`);
  return { chords, V, W, stages, times };
}

// Phrase endings, by register. Walk a melody as `playedMelody` does; at each
// phrase end, aim for each do on the keyboard: step to it from re above or ti
// below, choosing whichever the grid shows amber (tension), as the lights
// suggest, then arm a cadence and play do. Does the phrase end, and on I?
export function cadencesByRegister(N, lo = 60, hi = 88) {
  const by = new Map();
  for (let i = 1; i <= N; i++) {
    const { tonicPc, mode, melody } = playedMelody(i);
    const h = new Harmonizer(tonicPc, mode);
    for (const { s, cadence } of melody) {
      if (!cadence) { h.next(s); continue; }
      const rel = ((s - tonicPc) % 12 + 12) % 12;
      for (const target of [s - rel - 12, s - rel, s - rel + 12]) {
        if (target < lo || target > hi) continue;
        const near = [target + 2, target - 1].filter(m => m >= lo && m <= hi);
        const pick = near.find(m => functionOf(h.peek(m).name) === 'tension') ?? near[0];
        const g = new Harmonizer(tonicPc, mode);
        g.chords = h.chords.slice(); g.fermatas = h.fermatas.slice();
        g.next(pick);
        const c = g.next(target, { cadence: true });
        const n = g.chords.length;
        const broke = g.check().V.some(v => !v.startsWith('s:') && new RegExp(`chords (${n - 2}-${n - 1}|${n - 1}-${n})\\)|\\((${n - 1}|${n})\\)`).test(v));
        const valid = !c.cadence || (CADENTIAL[mode].has(c.name) && true);
        const r = by.get(target) ?? { n: 0, ended: 0, closed: 0, broke: 0, invalid: 0 };
        r.n++; if (c.cadence) r.ended++; if (c.name === 'I' || c.name === 'i') r.closed++;
        if (broke) r.broke++; if (!valid) r.invalid++;
        by.set(target, r);
      }
      h.next(s, { cadence: true });
    }
  }
  return by;
}

// Journeys between keys, played as the grid suggests. Open with a phrase and a
// cadence home; then, four times: press a destination (a random one of the
// other seven) and follow the lights: play the nearest lit key within a
// fourth (amber, the way in; then green, the arrival); if none is lit in
// reach, step toward the new do. Then a few free notes in the new key.
const available = (key, prev) => {
  const out = new Set();
  for (const octave of [0, 1]) for (let col = 0; col < 8; col++) {
    const m = pitchOf(key.tonicPc, key.mode, col, octave, prev);
    if (playable(m)) out.add(m);
  }
  return [...out];
};

// Pitches within `reach` of s, or, if the key change moved the keyboard out
// of reach, the three nearest (a forced leap, counted).
let forcedLeaps = 0;
export const leapsForced = () => forcedLeaps;
const nearby = (pitches, s, reach) => {
  const near = pitches.filter(m => m !== s && Math.abs(m - s) <= reach);
  if (near.length) return near;
  forcedLeaps++;
  return pitches.filter(m => m !== s).sort((a, b) => Math.abs(a - s) - Math.abs(b - s)).slice(0, 3);
};

export function journey(seed, legs = 4) {
  const r = rng(seed);
  const home = { tonicPc: Math.floor(r() * 12), mode: r() < 0.5 ? 'major' : 'minor' };
  const h = new Harmonizer(home.tonicPc, home.mode);
  const key = () => ({ tonicPc: h.tonicPc, mode: h.mode });
  const free = n => {
    for (let i = 0; i < n; i++) {
      const prev = h.chords.at(-1)?.s ?? null;
      const near = prev === null ? available(key(), prev) : nearby(available(key(), prev), prev, 4);
      h.next(near[Math.floor(r() * near.length)]);
    }
  };
  const travel = to => {
    for (let step = 1; step <= 8; step++) {
      const s0 = h.chords.at(-1).s;
      const views = nearby(available(key(), s0), s0, 5).map(m => ({ m, v: tripView(h, to, m) }));
      const lit = views.filter(x => x.v.lit).sort((a, b) => Math.abs(a.m - s0) - Math.abs(b.m - s0));
      let pick = lit[0]?.m;
      if (pick === undefined) {
        const goal = available(key(), s0).filter(m => ((m - h.tonicPc) % 12 + 12) % 12 === 0)
          .sort((a, b) => Math.abs(a - s0) - Math.abs(b - s0))[0];
        pick = views.sort((a, b) => Math.abs(a.m - goal) - Math.abs(b.m - goal))[0].m;
      }
      const { chord, arrived } = tripPlay(h, to, pick);
      if (arrived) return { steps: step, closed: chord.name === 'I' || chord.name === 'i' };
    }
    return { steps: Infinity, closed: false };
  };
  free(6);
  const trips = [travel(home)];
  for (let leg = 0; leg < legs; leg++) {
    const options = destinations(home).filter(d => !sameKey(d, key()));
    const d = options[Math.floor(r() * options.length)];
    const dist = distance(key(), d);
    h.modulate(d.tonicPc, d.mode);
    trips.push({ ...travel(d), dist, role: d.role });
    free(3 + Math.floor(r() * 3));
  }
  return { h, trips: trips.slice(1) };
}

// All four pads of a key, played at random: the first-choice chord, the
// second chord, the figure (falling back to the plain chord when none fits)
// and the roll (no different in pitch). Single key, so the engine's ornament
// checker (one key) can read the result.
export function playedWithPads(seed) {
  const { tonicPc, mode, melody } = playedMelody(seed);
  const r = rng(seed * 31 + 7);
  const h = new Harmonizer(tonicPc, mode);
  const used = { a: 0, b: 0, figure: 0, none: 0, roll: 0 }, types = {};
  for (const { s } of melody) {
    const pad = ['a', 'b', 'figure', 'roll'][Math.floor(r() * 4)];
    const { a, b } = h.options(s);
    let chord = a;
    if (pad === 'b' && b) { chord = b; used.b++; }
    else if (pad === 'figure') {
      const f = chooseFigure(h.chords.at(-1), a);
      if (f) { chord = { ...a, figure: f }; used.figure++; types[f.type] = (types[f.type] || 0) + 1; } else used.none++;
    } else used[pad === 'b' ? 'a' : pad]++;
    h.commit(chord);
  }
  // What the figures added: the checker's complaints about the decorated
  // surface, less those it makes about the same chords undecorated (the
  // melody's own leaps, which the player chose).
  const decorated = checkFigures(h.chords, tonicPc, mode, h.fermatas).V;
  const plain = checkFigures(h.chords.map(({ figure, ...c }) => c), tonicPc, mode, h.fermatas).V;
  const left = [...plain], added = [];
  for (const v of decorated) { const k = left.indexOf(v); if (k >= 0) left.splice(k, 1); else added.push(v); }
  return { h, used, types, surface: { V: added } };
}

// The tension ladder: a random rung of every note's four (single key). Also
// counts how often the ladder spans settled to tense, and whether, when the
// last chord wants somewhere (wants()), some key on the grid offers it.
export function playedWithLadder(seed) {
  const { tonicPc, mode, melody } = playedMelody(seed);
  const r = rng(seed * 17 + 3);
  const h = new Harmonizer(tonicPc, mode);
  const stats = { notes: 0, span: 0, distinct: 0, wanted: 0, offered: 0 };
  for (const { s } of melody) {
    const rungs = h.ladder(s);
    stats.notes++;
    stats.distinct += new Set(rungs.map(c => c.name)).size;
    if (rungs.some(c => functionOf(c.name) === 'home') && rungs.some(c => functionOf(c.name) === 'tension')) stats.span++;
    const want = wants(h.chords.at(-1));
    if (want) {
      stats.wanted++;
      const prev = h.chords.at(-1).s;
      if (available({ tonicPc, mode }, prev).some(m => h.ladder(m).some(want))) stats.offered++;
    }
    h.commit(rungs[Math.floor(r() * 4)]);
  }
  return { h, stats };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const N = Number(process.argv[2] ?? 300);
  summarize('played (random walks)', Array.from({ length: N }, (_, i) => run(playedMelody(i + 1))));
  const bach = [];
  let composedW = 0, composedChords = 0, sameBass = 0;
  for (let n = 1; n <= Math.min(N, 200); n++) {
    const m = bachMelody(n);
    const r = run(m);
    bach.push(r);
    composedW += m.piece.warnings;
    composedChords += m.piece.skeleton.s.length;
    r.h.chords.forEach((c, i) => { if (c.b === m.piece.skeleton.b[i]) sameBass++; });
  }
  const s = summarize('Bach sopranos (composed pieces 1–200), harmonized live', bach);
  console.log(`  the engine's own harmonizations of the same sopranos: 0 hard-rule breaks, ${(composedW / composedChords * 100).toFixed(1)} warnings per 100 chords`);
  console.log(`  live bass = engine's bass on ${(sameBass / s.chords * 100).toFixed(0)}% of chords`);
  const by = cadencesByRegister(Math.min(N, 1000));
  const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'], nm = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
  console.log('phrase endings on do, approached from re/ti (amber when offered), cadence armed:');
  for (const [lo, hi] of [[60, 66], [67, 71], [72, 77], [78, 83], [84, 88]]) {
    const t = { n: 0, ended: 0, closed: 0, broke: 0, invalid: 0 };
    for (let m = lo; m <= hi; m++) for (const k in t) t[k] += by.get(m)?.[k] ?? 0;
    console.log(`  do ${nm(lo)}–${nm(hi)}: ${t.n} endings · ${(100 * t.ended / t.n).toFixed(0)}% end the phrase · ${(100 * t.closed / t.n).toFixed(0)}% close on I/i · ${t.broke} rule breaks · ${t.invalid} non-cadential`);
  }
  const P = Array.from({ length: Math.min(N, 1000) }, (_, i) => playedWithPads(i + 1));
  const pc = (a, b) => (100 * a / b).toFixed(0) + '%';
  const tally = P.reduce((t, p) => { for (const k in p.used) t[k] = (t[k] || 0) + p.used[k]; return t; }, {});
  const types = P.reduce((t, p) => { for (const k in p.types) t[k] = (t[k] || 0) + p.types[k]; return t; }, {});
  const chordBreaks = P.reduce((a, p) => a + p.h.check().V.filter(v => !v.startsWith('s:')).length, 0);
  const surfaceV = P.flatMap(p => p.surface.V);
  const kinds = {}; for (const v of surfaceV) { const k = v.replace(/ slot \d+| \(.*\)|chords? \d+(-\d+)?:? ?/g, '').trim(); kinds[k] = (kinds[k] || 0) + 1; }
  const figTries = (tally.figure || 0) + (tally.none || 0);
  console.log(`all four pads at random: ${P.length} melodies, ${P.reduce((a, p) => a + p.h.chords.length, 0)} chords`);
  console.log(`  second chord taken ${tally.b} times · figure pad ${figTries} times, a figure fitted ${pc(tally.figure, figTries)}: ${Object.entries(types).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(`  chord rule breaks ${chordBreaks} · ornament checker violations the figures added ${surfaceV.length}${surfaceV.length ? ' ' + JSON.stringify(kinds) : ''}`);
  const L = Array.from({ length: Math.min(N, 500) }, (_, i) => playedWithLadder(i + 1));
  const ls = L.reduce((t, l) => { for (const k in l.stats) t[k] = (t[k] || 0) + l.stats[k]; return t; }, {});
  const lBreaks = L.reduce((a, l) => a + l.h.check().V.filter(v => !v.startsWith('s:')).length, 0);
  console.log(`tension ladder, a random rung every note: ${L.length} melodies, ${ls.notes} chords · ${lBreaks} chord rule breaks`);
  console.log(`  distinct chords per key ${(ls.distinct / ls.notes).toFixed(2)} of 4 · spans settled to tense ${pc(ls.span, ls.notes)} · when the last chord wants somewhere (${ls.wanted}), a key offers it ${pc(ls.offered, ls.wanted)}`);
  const J = Array.from({ length: Math.min(N, 1000) }, (_, i) => journey(i + 1));
  const trips = J.flatMap(j => j.trips);
  const breaks = J.reduce((a, j) => a + j.h.check().V.filter(v => !v.startsWith('s:')).length, 0);
  const chords = J.reduce((a, j) => a + j.h.chords.length, 0);
  const stage2 = J.reduce((a, j) => a + j.h.chords.filter(c => c.stage === 2).length, 0);
  console.log(`journeys between keys: ${J.length} pieces, ${trips.length} key changes, ${chords} chords · ${breaks} rule breaks by the choir · ${stage2} last-resort chords · ${leapsForced()} forced leaps`);
  for (const [label, f] of [['near (green)', t => t.dist <= 1], ['middle (amber)', t => t.dist > 1 && t.dist <= 3], ['far (red)', t => t.dist > 3]]) {
    const T = trips.filter(f);
    const within = k => (100 * T.filter(t => t.steps <= k).length / T.length).toFixed(0);
    console.log(`  to a ${label.padEnd(14)} key: ${String(T.length).padStart(4)} trips · arrived in 2 notes ${within(2)}%, ≤3 ${within(3)}%, ≤4 ${within(4)}%, ≤8 ${within(8)}% · on I/i ${(100 * T.filter(t => t.closed).length / T.length).toFixed(0)}%`);
  }
}
