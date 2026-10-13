// Figures: one voice moves out of step with the change of chord, the way
// Bach's voices keep moving between chords. Only figures that need nothing
// but the chord before and the chord now are possible live, and only those
// that pass the engine's own ornament checker (checkSurface) are used. That
// checker allows a dissonance on the beat only if it was held over from the
// chord before, so there is no unprepared "sigh" (appoggiatura) here.
//
//   suspension   (on the new chord) a voice holds its old note into the new
//                chord and resolves down a step when you lift your finger
//   anticipation (over the old chord) the melody steps up to its new note
//                early; the new chord arrives when you lift
//   passing note (over the old chord) the melody fills a third with the note
//                between; the new chord arrives when you lift
//   neighbour    (over the old chord) the melody, about to repeat its note,
//                turns to the note above first; the chord arrives on lift
//   bass passing (over the old chord) the bass fills a third
//
// In the checker's terms each chord is two eighths (on the beat, off the
// beat): a suspension takes the new chord's on-beat, a lead-in figure the old
// chord's off-beat. surfaceOf() writes that out so the figures can be checked.

import { SCALES, checkSurface } from '../vendor/choral-counterpoint/engine.js';

const mod12 = x => ((x % 12) + 12) % 12;
const VOICES = ['s', 'a', 't', 'b'];
export const NAMES = {
  suspension: 'suspension', anticipation: 'anticipation', passing: 'passing note',
  neighbour: 'neighbour note', 'bass passing': 'bass passing note',
};
const VOICE_NAMES = { s: 'soprano', a: 'alto', t: 'tenor', b: 'bass' };

// Pitches between x and y (exclusive) that are notes of the key, a step (one
// or two semitones) from each, with no augmented second; minor may use the
// raised 6th (la) when the line climbs.
function between(x, y, key) {
  const scale = new Set(SCALES[key.mode]);
  if (key.mode === 'minor' && y > x) scale.add(9);
  const rel = m => mod12(m - key.tonicPc);
  const aug2 = (p, q) => key.mode === 'minor' && Math.abs(p - q) === 3 && new Set([rel(p), rel(q)]).has(8) && new Set([rel(p), rel(q)]).has(11);
  const out = [];
  for (let m = Math.min(x, y) + 1; m < Math.max(x, y); m++)
    if (scale.has(rel(m)) && Math.abs(m - x) <= 2 && Math.abs(y - m) <= 2 && !aug2(x, m) && !aug2(m, y)) out.push(m);
  return out;
}

// The note of the key a step above m (for a neighbour), or null.
function stepAbove(m, key) {
  for (const n of [m + 1, m + 2]) if (between(m, n + 1, key).includes(n)) return n;
  return null;
}

// The figure for moving from chord `prev` to `chord`, or null if none fits.
// `prev.figure` matters: a voice that resolved a suspension on the old
// chord's off-beat can't also lead into the new one there.
export function chooseFigure(prev, chord) {
  if (!prev) return null;
  const key = { tonicPc: chord.tonicPc, mode: chord.mode };
  const busy = prev.figure?.type === 'suspension' ? prev.figure.voice : null;
  const ds = chord.s - prev.s;
  const pcs = new Set([chord.s, chord.a, chord.t, chord.b].map(mod12));

  // the melody first: these are the figures you hear
  if (!prev.cadence && (ds === -1 || ds === -2))
    return { type: 'suspension', voice: 's', pitch: prev.s };
  if (busy !== 's') {
    if (ds === 1 || ds === 2) return { type: 'anticipation', voice: 's', pitch: chord.s };
    if (Math.abs(ds) === 3 || Math.abs(ds) === 4) {
      const m = between(prev.s, chord.s, key)[0];
      if (m !== undefined) return { type: 'passing', voice: 's', pitch: m };
    }
    if (ds === 0) {
      const m = stepAbove(chord.s, key);
      if (m !== null && m < chord.s + 3) return { type: 'neighbour', voice: 's', pitch: m };
    }
  }
  // then inside the choir: a suspension, dissonant if possible, then the bass
  if (!prev.cadence) {
    const sus = ['a', 't', 'b'].filter(v => prev[v] - chord[v] === 1 || prev[v] - chord[v] === 2)
      .sort((x, y) => Number(pcs.has(mod12(prev[x]))) - Number(pcs.has(mod12(prev[y]))));
    if (sus.length) return { type: 'suspension', voice: sus[0], pitch: prev[sus[0]] };
  }
  if (busy !== 'b' && (Math.abs(chord.b - prev.b) === 3 || Math.abs(chord.b - prev.b) === 4)) {
    const m = between(prev.b, chord.b, key)[0];
    if (m !== undefined) return { type: 'bass passing', voice: 'b', pitch: m };
  }
  return null;
}

export const describe = f => f.type === 'suspension'
  ? `suspension in the ${VOICE_NAMES[f.voice]}: lift to resolve`
  : `${NAMES[f.type]}: lift and the chord arrives`;

// The chords as the checker reads them: two eighths each, figures written in.
export function surfaceOf(chords) {
  const slots = chords.map(c => Object.fromEntries(VOICES.map(v => [v, [[c[v], 2]]])));
  chords.forEach((c, i) => {
    const f = c.figure;
    if (!f) return;
    if (f.type === 'suspension') slots[i][f.voice] = [[f.pitch, 1], [c[f.voice], 1]];
    else slots[i - 1][f.voice] = [[chords[i - 1][f.voice], 1], [f.pitch, 1]];
  });
  const events = Object.fromEntries(VOICES.map(v => [v, slots.flatMap(sl => sl[v])]));
  const skel = Object.fromEntries(VOICES.map(v => [v, chords.map(c => c[v])]));
  return { events, skel };
}

// The engine's ornament checker over a single-key run of chords.
export function checkFigures(chords, tonicPc, mode, fermatas) {
  const { events, skel } = surfaceOf(chords);
  return checkSurface(events, skel, tonicPc, mode, fermatas);
}
