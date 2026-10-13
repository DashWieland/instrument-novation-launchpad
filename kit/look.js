// The twin's look for the kit's own pages (the bench, Omen Life): hand-tuned
// to what this unit's LEDs look like (HARDWARE.md). Red at full with any green
// reads as one orange; dim levels sit close to the dark pad. Instruments that
// live on a themed site pass their own colour function to Twin/Grid instead
// (choir maps its three meanings to the site's tokens).

import { levels } from './launchpad.js';

const LOOK = [
  // green 0     1          2          3          (rows: red 0–3)
  [null,      '#24552a', '#2f9334', '#43d146'],
  ['#5c1f16', '#5f5520', '#6d9a2e', '#8fd33f'],
  ['#9a2a18', '#a3631f', '#b39a28', '#c8d23c'],
  ['#e8361f', '#f07524', '#f48a26', '#f69a2a'],
];
export function cssColour(code) {
  const { red, green } = levels(code);
  return LOOK[red][green];
}
