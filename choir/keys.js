// Keys, the destinations a phrase can end in, and how far apart keys are.
//
// Distance is counted in sharps and flats: G major (one sharp) and D major
// (two) are 1 apart; G major and G minor (two flats) are 3. Keys 1 apart share
// all but one note, which is why Bach's chorales modulate among them.

const mod12 = x => ((x % 12) + 12) % 12;
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// Key signature as a count of sharps (negative: flats), −5 … 6.
export function signature({ tonicPc, mode }) {
  const s = mod12((mode === 'major' ? tonicPc : tonicPc + 3) * 7);
  return s > 6 ? s - 12 : s;
}

export function distance(a, b) {
  const d = mod12(signature(a) - signature(b));
  return Math.min(d, 12 - d);
}

// near: a step away (green) · middle: two or three (amber) · far: four or more (red)
export const closeness = d => d <= 1 ? 'near' : d <= 3 ? 'middle' : 'far';

export const sameKey = (a, b) => a.tonicPc === b.tonicPc && a.mode === b.mode;
export const keyName = ({ tonicPc, mode }) => `${NAMES[mod12(tonicPc)]}${mode === 'minor' ? 'm' : ''}`;
export const keyLongName = ({ tonicPc, mode }) => `${NAMES[mod12(tonicPc)]} ${mode}`;

// The right column, top to bottom: home, the five closely related keys Bach's
// chorales modulate to, the parallel key, and one distant key.
export function destinations({ tonicPc: h, mode }) {
  const K = (offset, m, role) => ({ tonicPc: mod12(h + offset), mode: m, role });
  return mode === 'major'
    ? [K(0, 'major', 'home'), K(7, 'major', 'V'), K(5, 'major', 'IV'), K(9, 'minor', 'vi'),
       K(2, 'minor', 'ii'), K(4, 'minor', 'iii'), K(0, 'minor', 'parallel'), K(8, 'major', 'far')]
    : [K(0, 'minor', 'home'), K(3, 'major', 'III'), K(7, 'minor', 'v'), K(5, 'minor', 'iv'),
       K(8, 'major', 'VI'), K(10, 'major', 'VII'), K(0, 'major', 'parallel'), K(8, 'minor', 'far')];
}
