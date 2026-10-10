// Live four-part harmonizer: the player sings the soprano one note at a time,
// and each note gets a chord at once, from what has already been sung (no
// lookahead). It is the chorale engine's own machinery, run one chord at a
// time instead of as a beam search over a finished melody:
//
//   bass  — Bach's outer-voice oracle: given the soprano's last move and the
//           previous bass, the bass notes Bach wrote, weighted by how often
//           (engine.js bassLine's scoring and hard rules);
//   inner — every alto/tenor voicing of every chord over that soprano and
//           bass, under the voice-leading laws and scored as engine.js
//           harmonize scores them (common tones, leading tones and sevenths
//           resolved, secondary dominants arriving, no false relations).
//
// Bass and voicing are chosen together, best total score wins. If the hard
// rules leave nothing (the player can sing into corners Bach never did), the
// search relaxes in stages and says so in `stage`:
//   0  the oracle's basses, hard rules, first chord a complete tonic
//   1  any bass the soprano can stand over, unforced chromatic chords allowed,
//      and the alto may fall more than an octave below a leaping soprano
//   2  rules become penalties: the least-bad chord, so the choir never fails
// After a cadence the next chord starts a phrase: like the checker, which
// excuses parallels and leaps across a fermata, it is not held to the
// previous chord's voice leading.
//
// The key can change mid-piece (modulate): the history stays, each chord
// remembers the key it was sung in, and the next chord is chosen in the new
// key but voice-led from the last one, so the choir pivots instead of
// starting over.
//
// A cadence is a real phrase ending or nothing: I (or i) closes the phrase, V
// leaves it open (a half cadence), vi (VI) deceives, and in minor III cadences
// in the relative major, each with its root in the bass, chosen from Bach's
// cadence table. A note that can't end a phrase that way is sung as an
// ordinary chord, and the cadence is still owed (peek/next say which).

import { CHORDS, SCALES, PAIRS, oracleMoves, voicings, concretize, pairParallel, isChromatic, checkChorale }
  from '../vendor/choral-counterpoint/engine.js';

const mod12 = x => ((x % 12) + 12) % 12;

// What a chord does, in the three words the grid's colours use:
//   home    — tonic and its relative (I vi; i VI III)
//   away    — pre-dominant, leaving home (ii IV ii7; iio iv iio7 bVII)
//   tension — dominant, wanting home (V V7 vii°, minor v, iii, which over ti
//             pulls to I as a dominant does, and every secondary dominant,
//             which wants its own target)
const HOME = new Set(['I', 'vi', 'i', 'VI', 'III']);
const AWAY = new Set(['ii', 'IV', 'ii7', 'iio', 'iv', 'iio7', 'bVII']);
export const functionOf = name => HOME.has(name) ? 'home' : AWAY.has(name) ? 'away' : 'tension';

// The chords a phrase may end on (root in the bass).
export const CADENTIAL = { major: new Set(['I', 'V', 'vi']), minor: new Set(['i', 'V', 'VI', 'III']) };
// Arriving in a key: only its tonic (cadence: 'arrive').
const ARRIVAL = { major: new Set(['I']), minor: new Set(['i']) };
// The chords that lead into a key's tonic: the way in to an arrival.
export const DOMINANT = new Set(['V', 'V7', 'viio', 'viio7']);

export class Harmonizer {
  constructor(tonicPc = 7, mode = 'major') { this.setKey(tonicPc, mode); }

  setKey(tonicPc, mode) {
    this.tonicPc = mod12(tonicPc);
    this.mode = mode;
    this.reset();
  }

  reset() {
    this.chords = [];        // { s, a, t, b, ci, name, cadence, stage, tonicPc, mode }
    this.fermatas = [];      // 1-based indices of cadence chords, as checkChorale takes them
  }

  // Change key and keep singing: nothing is forgotten.
  modulate(tonicPc, mode) {
    this.tonicPc = mod12(tonicPc);
    this.mode = mode;
  }

  // Harmonize soprano note `s` (MIDI). Returns the chord, which is also kept.
  // With `cadence`, the chord ends the phrase if `s` can (chord.cadence says
  // whether it did): `true` on any real ending (CADENTIAL), 'arrive' only on
  // the tonic. With `dominant`, the chord is the key's dominant (V, V7, vii°,
  // any inversion) if the rules allow one over `s`: the way in to an arrival.
  next(s, { cadence = false, dominant = false } = {}) {
    const chord = this.peek(s, { cadence, dominant });
    this.chords.push(chord);
    if (chord.cadence) this.fermatas.push(this.chords.length);
    return chord;
  }

  // The chord `s` would get now, without singing it (for the grid's preview).
  peek(s, { cadence = false, dominant = false } = {}) {
    let best = null, stage = 0, ends = false;
    if (cadence) {
      const endings = (cadence === 'arrive' ? ARRIVAL : CADENTIAL)[this.mode];
      for (; stage < 2 && !best; stage++) best = this.#search(s, true, stage, endings);
      ends = !!best;
      if (!best) stage = 0;
    } else if (dominant) {
      for (; stage < 2 && !best; stage++) best = this.#search(s, false, stage, DOMINANT, false);
      if (!best) stage = 0;
    }
    for (; stage < 3 && !best; stage++) best = this.#search(s, false, stage);
    if (!best) throw new Error(`no chord for soprano ${s}`);
    return { s, a: best.a, t: best.t, b: best.b, ci: best.ci,
      name: CHORDS[this.mode][best.ci].name, cadence: ends, stage: stage - 1,
      tonicPc: this.tonicPc, mode: this.mode };
  }

  get voices() {
    const v = { s: [], a: [], t: [], b: [] };
    for (const c of this.chords) for (const k of 's a t b'.split(' ')) v[k].push(c[k]);
    return v;
  }

  // The engine's own checker over everything sung so far: { V: [...], W: [...] }.
  // It assumes one key; only two of its rules depend on the key (a doubled
  // leading tone, a minor key's augmented second), so those two are redone
  // here with each chord's own key, and the rest stand as the checker wrote
  // them.
  check() {
    const v = this.voices;
    const keyed = m => /doubled leading tone|augmented second/.test(m);
    const out = checkChorale(v, this.tonicPc, this.mode, this.fermatas);
    const V = out.V.filter(m => !keyed(m)), W = out.W.filter(m => !keyed(m));
    const ferm = new Set(this.fermatas);
    this.chords.forEach((c, i) => {
      const rel = m => mod12(m - c.tonicPc);
      if ([c.s, c.a, c.t, c.b].filter(m => rel(m) === 11).length > 1) W.push(`chord ${i + 1}: doubled leading tone`);
      if (i === 0 || c.mode !== 'minor') return;
      for (const name of ['s', 'a', 't', 'b']) {
        const x = v[name][i - 1], y = v[name][i];
        if (Math.abs(y - x) !== 3) continue;
        const r = new Set([rel(x), rel(y)]);
        if (r.has(8) && r.has(11)) (ferm.has(i) ? W : V).push(`${name}: augmented second (${i})`);
      }
    });
    return { V, W };
  }

  #search(s, cadence, stage, endings = null, rootOnly = true) {
    const { tonicPc: tonic, mode } = this;
    const rel = m => mod12(m - tonic), abspc = r => mod12(r + tonic);
    const pairs = PAIRS[mode], scale = SCALES[mode], vocab = CHORDS[mode];
    const prev = this.chords.at(-1) ?? null;
    const fresh = !prev || prev.cadence;          // phrase start: no voice leading owed
    const strict = stage < 2;

    // ---- bass candidates, weighted by the oracle
    let weights;
    if (!prev) weights = pairs.has(rel(s) * 12) ? { 0: 1 } : {};          // open on the tonic
    else weights = { ...oracleMoves(mode, rel(prev.s), rel(s), cadence ? 1 : 0, rel(prev.b)) };
    if (stage >= 1 || !Object.keys(weights).length)
      for (let p = 0; p < 12; p++) if (!(p in weights)) weights[p] = 0;

    const anchor = prev ? prev.b : 45;
    const lastBass = this.chords.slice(-3).map(c => mod12(c.b));
    const basses = [];
    for (const [pS, count] of Object.entries(weights)) {
      const p = Number(pS);
      if (!pairs.has(rel(s) * 12 + p)) continue;
      for (const b of concretize(abspc(p), anchor).slice(0, 2)) {
        if (s - b <= 3) continue;                                       // room for alto and tenor
        let score = Math.log1p(count), penalty = 0;
        if (prev && !fresh) {
          const dm = b - prev.b, ds = s - prev.s, a = Math.abs(dm);
          const illegal = a === 10 || a === 11 || a > 12 || pairParallel(prev.s, prev.b, s, b) ||
            (mode === 'minor' && a === 3 && new Set([rel(prev.b), p]).has(8) && new Set([rel(prev.b), p]).has(11));
          if (illegal) { if (strict) continue; penalty += 20; }
          if (dm === 0 && ds === 0) score -= 0.2;
          if ((dm < 0 && ds > 0) || (ds < 0 && dm > 0)) score += 0.6;
          else if (dm === 0 || ds === 0) score += 0.2;
          if (a === 6) score -= 1.0;
          score += (a === 1 || a === 2) ? 0.5 : a <= 4 ? 0.2 : a <= 7 ? 0.05 : -0.5;
          if (!scale.has(p) && a === 3) score -= 2.0;
          if (!scale.has(rel(prev.b)) && dm !== 1) score -= 2.0;
        }
        const pcs = lastBass.concat([mod12(b)]);
        if (pcs.length >= 4 && pcs[3] === pcs[1] && pcs[2] === pcs[0] && pcs[3] !== pcs[2]) score -= 1.4;
        if (pcs.filter(x => x === mod12(b)).length >= 3) score -= 0.8;
        if (b < 40 || b > 60) score -= 0.3;
        const ic = mod12(s - b);
        if (ic === 1 || ic === 2 || ic === 11) score -= 2.5;
        basses.push({ b, p, score: score - penalty });
      }
    }

    // ---- chords and inner voices over each bass
    // (the previous chord's leading tone, seventh and target, in its own key)
    const pch = prev ? CHORDS[prev.mode][prev.ci] : null;
    const pabs = r => mod12(r + prev.tonicPc);
    const plt = pch?.lt != null ? pabs(pch.lt) : null;
    const psev = pch?.seventh != null ? pabs(pch.seventh) : null;
    const ptarget = pch?.target != null ? pabs(pch.target) : null;
    let best = null;

    for (const { b, score: bassScore } of basses) {
      for (let ci = 0; ci < vocab.length; ci++) {
        const ch = vocab[ci];
        const pcs = new Set(ch.pcs.map(abspc));
        if (!pcs.has(mod12(s)) || !pcs.has(mod12(b))) continue;
        if (endings && (!endings.has(ch.name) || (rootOnly && mod12(b) !== abspc(ch.pcs[0])))) continue;
        if (!prev && ci !== 0 && stage === 0 && !endings) continue;         // the first chord is I or i
        let cost = ch.pcs.length === 4 ? 0.5 : 0;
        if (isChromatic(ch, mode)) {
          const forced = !scale.has(rel(s)) || !scale.has(rel(b));
          if (!forced) { if (stage === 0) continue; cost += 1.5; }
        }
        for (const [a, t, missing] of stage === 0 ? voicings(ch, s, b, tonic) : wideVoicings(ch, s, b, tonic)) {
          if (!prev && missing && stage === 0) continue;
          let score = bassScore - cost - missing - (cadence ? missing : 0);
          if (s - a > 12) score -= 1.5;                                 // stretched under a leap
          // Neighbouring voices in unison thin the chord, and they are a trap:
          // when the melody next leaps, voices sharing a pitch move together,
          // into parallels. The first search does without them; later ones
          // pay for them, most for the alto on the soprano's note.
          if (stage === 0 && (a === s || t === a || t === b)) continue;
          if (a === s) score -= 2.0;
          if (t === a) score -= 0.8;
          if (t === b) score -= 0.8;
          if (prev && !fresh) {
            const broken = innerBreaks(prev, s, a, t, b, scale, tonic);
            if (broken) { if (strict) continue; score -= 20 * broken; }
            score += innerScore(prev, s, a, t, b, pcs, plt, psev, ptarget, scale, tonic);
          } else if (prev) {
            score -= 0.1 * (Math.abs(a - prev.a) + Math.abs(t - prev.t));   // still keep near
          }
          if (!best || score > best.score) best = { a, t, b, ci, score };
        }
      }
    }
    return best;
  }
}

// engine.js voicings, but the soprano may stand up to a twelfth above the
// alto. After a big soprano leap the octave limit forces the alto to leap
// with it, into parallel octaves; Bach stretches the spacing instead, which
// the checker counts as a warning, not a violation.
function wideVoicings(chord, s, b, tonicPc) {
  const pcs = new Set(chord.pcs.map(p => mod12(p + tonicPc)));
  const forbid = new Set([chord.lt, chord.seventh].filter(x => x !== null).map(p => mod12(p + tonicPc)));
  const out = [];
  for (let a = 53; a < 75; a++) {
    if (!pcs.has(mod12(a)) || a > s || s - a > 19) continue;
    for (let t = 48; t < 70; t++) {
      if (!pcs.has(mod12(t)) || t > a || a - t > 12 || t < b) continue;
      const quad = [mod12(s), mod12(a), mod12(t), mod12(b)];
      if ([...forbid].some(f => quad.filter(p => p === f).length > 1)) continue;
      let missing = 0;
      for (const p of pcs) if (!quad.includes(p)) missing++;
      out.push([a, t, missing]);
    }
  }
  return out;
}

// Hard rules between the previous chord and this one (engine.js harmonize's
// `legal`): no parallel fifths or octaves in any pair, no inner leap of a
// seventh or more than an octave, no augmented or chromatic third leap.
// Returns how many are broken.
function innerBreaks(prev, s, a, t, b, scale, tonic) {
  const qp = [prev.s, prev.a, prev.t, prev.b], qc = [s, a, t, b];
  let n = 0;
  for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++)
    if (pairParallel(qp[x], qp[y], qc[x], qc[y])) n++;
  for (const [pp, cp] of [[prev.a, a], [prev.t, t]]) {
    const d = Math.abs(cp - pp);
    if (d === 10 || d === 11 || d > 12) n++;
    if (d === 3) {
      const r1 = mod12(pp - tonic), r2 = mod12(cp - tonic);
      if ((r1 === 8 && r2 === 11) || (r1 === 11 && r2 === 8) || !scale.has(r1) || !scale.has(r2)) n++;
    }
  }
  return n;
}

// engine.js harmonize's scoring of one step.
function innerScore(prev, s, a, t, b, pcs, plt, psev, ptarget, scale, tonic) {
  const pa = prev.a, pt = prev.t;
  let sc = 0;
  if (ptarget !== null && !pcs.has(ptarget)) sc -= 3.0;              // a secondary dominant's target missed
  sc -= 0.25 * (Math.abs(a - pa) + Math.abs(t - pt));
  if (a === pa) sc += 0.3;
  if (t === pt) sc += 0.3;
  if (Math.abs(a - pa) > 7 || Math.abs(t - pt) > 7) sc -= 1.0;
  if (a > prev.s || t > pa || t < prev.b) sc -= 1.2;                  // overlap
  if (ptarget !== null && mod12(b) === ptarget) sc += 1.5;
  for (const [pp, cp] of [[pa, a], [pt, t]]) {
    if (plt !== null && mod12(pp) === plt) sc += cp - pp === 1 ? 0.8 : -2.0;
    if (psev !== null && mod12(pp) === psev) sc += (cp - pp <= -1 && cp - pp >= -2) ? 0.5 : -2.5;
  }
  if (plt !== null && mod12(prev.b) === plt && b - prev.b !== 1) sc -= 2.0;
  if (psev !== null && mod12(prev.b) === psev && !(b - prev.b <= -1 && b - prev.b >= -2)) sc -= 2.5;
  const qp = [prev.s, pa, pt, prev.b], qc = [s, a, t, b];
  for (let vi = 0; vi < 4; vi++) {                                     // false relation
    if (scale.has(mod12(qc[vi] - tonic))) continue;
    for (const nat of [qc[vi] - 1, qc[vi] + 1]) {
      if (!scale.has(mod12(nat - tonic))) continue;
      for (let vj = 0; vj < 4; vj++) if (vj !== vi && mod12(qp[vj]) === mod12(nat)) sc -= 1.5;
    }
  }
  return sc;
}
