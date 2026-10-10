// On-screen twin of the Launchpad Mini: shows the same frame as the hardware
// and sends the same press and release events, so instruments can be built,
// played and checked without the device.

import { SIZE, levels, describe } from './launchpad.js';

// Hand-tuned to what this unit looks like (HARDWARE.md): red at full with any
// green reads as one orange; dim levels sit close to the dark pad.
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

export class Twin {
  constructor(container, { labels = {}, onInput = null } = {}) {
    this.onInput = onInput;
    this.root = document.createElement('div');
    this.root.className = 'twin';
    this.cells = new Array(SIZE);
    this.codes = new Int16Array(SIZE).fill(-1);
    this.labelEls = { top: [], right: [], bottom: [] };

    const place = (el, col, row) => { el.style.gridColumn = col; el.style.gridRow = row; this.root.append(el); };
    for (let x = 0; x < 8; x++) {
      const l = document.createElement('div'); l.className = 'twin-label top';
      place(l, x + 1, 1); this.labelEls.top.push(l);
    }
    for (let i = 0; i < SIZE; i++) {
      const d = describe(i);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `twin-key ${d.kind}`;
      b.dataset.index = i;
      b.setAttribute('aria-label', d.kind === 'grid' ? `pad ${d.x + 1},${d.y + 1}` : `${d.kind} button ${(d.kind === 'top' ? d.x : d.y) + 1}`);
      if (d.kind === 'grid') place(b, d.x + 1, d.y + 3);
      else if (d.kind === 'right') place(b, 9, d.y + 3);
      else place(b, d.x + 1, 2);
      this.cells[i] = b;
    }
    for (let y = 0; y < 8; y++) {
      const l = document.createElement('div'); l.className = 'twin-label right';
      place(l, 10, y + 3); this.labelEls.right.push(l);
    }
    for (let x = 0; x < 8; x++) {
      const l = document.createElement('div'); l.className = 'twin-label bottom';
      place(l, x + 1, 11); this.labelEls.bottom.push(l);
    }
    this.setLabels(labels);

    // Pointer input; capture so a release lands on the key that was pressed.
    const down = new Map();                       // pointerId → index
    this.root.addEventListener('pointerdown', e => {
      const key = e.target.closest('.twin-key'); if (!key) return;
      e.preventDefault();
      try { key.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      const i = Number(key.dataset.index);
      down.set(e.pointerId, i);
      key.classList.add('pressed');
      this.onInput?.('press', i);
    });
    const up = e => {
      if (!down.has(e.pointerId)) return;
      const i = down.get(e.pointerId); down.delete(e.pointerId);
      this.cells[i].classList.remove('pressed');
      this.onInput?.('release', i);
    };
    this.root.addEventListener('pointerup', up);
    this.root.addEventListener('pointercancel', up);
    this.root.addEventListener('contextmenu', e => e.preventDefault());
    container.append(this.root);
  }

  // Labels: above the top row, right of the right column, and under the grid
  // (a string per column, may contain a line break).
  setLabels({ top = [], right = [], bottom = [] } = {}) {
    this.labelEls.top.forEach((el, i) => { el.textContent = top[i] ?? ''; });
    this.labelEls.right.forEach((el, i) => { el.textContent = right[i] ?? ''; });
    this.labelEls.bottom.forEach((el, i) => { el.textContent = bottom[i] ?? ''; });
    this.root.classList.toggle('labelled', top.some(Boolean) || right.some(Boolean));
    this.root.classList.toggle('labelled-bottom', bottom.some(Boolean));
  }

  render(frame) {
    const data = frame.data ?? frame;
    for (let i = 0; i < SIZE; i++) {
      if (this.codes[i] === data[i]) continue;
      this.codes[i] = data[i];
      const css = cssColour(data[i]);
      const el = this.cells[i];
      el.style.setProperty('--led', css ?? 'transparent');
      el.classList.toggle('lit', css !== null);
    }
  }

  // Outline a key while it is held on the hardware.
  mark(index, held) { this.cells[index]?.classList.toggle('held', held); }
}
