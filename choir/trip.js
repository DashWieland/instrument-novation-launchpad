// A trip to a key: press a destination on the right column, play a key lit
// amber (the choir sings the destination's dominant on it: the way in), then a key lit
// green (it lands on the destination's tonic, root in the bass: arrival).
// The dominant before the tonic is what makes a change of key sound meant;
// it is also how Bach's chorales close a phrase in a new key. The same trip
// to the key you're in is a cadence home.
//
// Shared by the page (choir/main.js) and the measurements (tools/choir-eval.mjs).

import { DOMINANT } from './harmonizer.js';
import { sameKey } from './keys.js';

// 'approach' until the last chord sung is the destination's dominant, then 'arrive'.
export function phase(harm, to) {
  const last = harm.chords.at(-1);
  return last && sameKey(last, to) && DOMINANT.has(last.name) ? 'arrive' : 'approach';
}

// What pitch m would do on the trip now: lit or not, in which colour, and the chord.
export function tripView(harm, to, m) {
  if (phase(harm, to) === 'arrive') {
    const chord = harm.peek(m, { cadence: 'arrive' });
    return { lit: chord.cadence, fn: 'home', chord };
  }
  const chord = harm.peek(m, { dominant: true });
  return { lit: DOMINANT.has(chord.name), fn: 'tension', chord };
}

// Sing m on the trip. An amber key sings the destination's dominant; a green
// one arrives. `arrived` is true when it landed on the tonic.
export function tripPlay(harm, to, m) {
  const arriving = phase(harm, to) === 'arrive';
  const chord = harm.next(m, arriving ? { cadence: 'arrive' } : { dominant: true });
  return { chord, arrived: arriving && chord.cadence };
}
