// The melody layout: a two-octave keyboard. The eight columns are the scale
// from do to do' in every key, so the first column is always home and the
// fifth always sol. The bottom four rows are the lower octave, the top four
// the upper, each key a bar four pads tall: right is one scale step, up is an
// octave.
//
// In minor the sixth and seventh are sung as a singer sings them: raised (la,
// ti) when the melody climbs to them, natural (le, te) when it comes down. So
// a rising line leans into do and a falling one relaxes, and the melody never
// makes le-to-ti's augmented second.

const mod12 = x => ((x % 12) + 12) % 12;

export const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
export const MINOR = [0, 2, 3, 5, 7, 8, 10, 12];
export const SOLFEGE = {
  major: ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti', 'do'],
  minor: ['do', 're', 'me', 'fa', 'sol', 'le', 'te', 'do'],
};

// The lower octave's do is the tonic between C4 and B4. Below C4 the choir is
// squeezed: phrases ending on a do there closed on I only about half the time
// (tools/choir-eval.mjs, 2026-10-10), against ~80% from C4 up. Keys above E6
// stay dark: at most four, in B♭ and B.
export const LOWEST = 60;
export const TOP_NOTE = 88;
export const lowerDo = tonicPc => LOWEST + mod12(tonicPc - LOWEST);
export const playable = m => m >= LOWEST && m <= TOP_NOTE;

// Pad (x, y) in the kit's coordinates (y = 0 is the top row) → key.
export const keyAt = (x, y) => ({ col: x, octave: y >= 4 ? 0 : 1 });

// The pitch a key sings, given the soprano note before it (minor's 6th and 7th
// depend on the direction the melody arrives from).
export function pitchOf(tonicPc, mode, col, octave, prev = null) {
  const base = lowerDo(tonicPc) + 12 * octave;
  if (mode === 'major') return base + MAJOR[col];
  let m = base + MINOR[col];
  if ((col === 5 || col === 6) && prev !== null && prev < m) {
    const fromLe = mod12(prev - tonicPc) === 8;          // le → ti would leap an augmented second
    if (!(col === 6 && fromLe)) m += 1;
  }
  return m;
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = m => `${NAMES[mod12(m)]}${Math.floor(m / 12) - 1}`;
export const pcName = pc => NAMES[mod12(pc)];

// What a key sings in solfège, given the pitch it actually took (la/ti in minor when raised).
export function syllable(tonicPc, mode, m) {
  const r = mod12(m - tonicPc);
  return { 0: 'do', 2: 're', 3: 'me', 4: 'mi', 5: 'fa', 7: 'sol', 8: 'le', 9: 'la', 10: 'te', 11: 'ti' }[r] ?? '?';
}
