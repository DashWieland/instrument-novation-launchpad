// Omen Life: the Game of Life on a Launchpad Mini, where the next generation
// flickers on the grid before it arrives, and you can change it in time.
//
// Grid pads toggle cells. Top row: play, step, slower, faster, omen mode,
// auto-reseed, reseed, clear. Right column: eight rules.
//
// Colours: green = alive; in the omen, red = about to die, amber = about to
// be born; yellow = cells the auto-reseed just sprinkled in.

import { Grid } from '../kit/grid.js';
import { C, topIndex } from '../kit/launchpad.js';
import { cssColour } from '../kit/look.js';
import { RULES, parseRule, step, changes, population, key, seeded, prng } from './life.js';
import { Sound } from './sound.js';

const TOP = ['play', 'step', 'slower', 'faster', 'omen', 'auto', 'reseed', 'clear'];
const OMEN_MODES = ['flicker', 'steady', 'off'];
const BEATS_PER_GEN = 4;
const STALL_GENS = 3;           // generations of stillness or repetition before a sprinkle
const SCALE = [0, 2, 3, 5, 7, 9, 10];   // D dorian
const ROOT = 50;                        // D3

const $ = id => document.getElementById(id);
const clock = () => performance.now() / 1000;

const grid = new Grid({
  twin: $('twin'),
  colour: cssColour,
  labels: { top: TOP, right: RULES.map(r => r.name) },
});
let sound = null;

const state = {
  seed: 1,
  board: seeded(1),
  next: null,
  ruleIndex: 0,
  rule: parseRule(RULES[0].code),
  playing: false,
  bpm: 104,
  omen: 'flicker',
  auto: true,
  generation: 0,
  genStart: clock(),
  history: [],
  stalled: 0,
  sprinkled: new Set(),
};
state.next = step(state.board, state.rule);

// ---------------------------------------------------------------- music --

function pitch(i) {
  const x = i & 7, y = i >> 3;
  const degree = x + 2 * (7 - y);               // rows two scale steps apart, low at the bottom
  const midi = ROOT + 12 * Math.floor(degree / 7) + SCALE[degree % 7];
  return 440 * 2 ** ((midi - 69) / 12);
}
const pan = i => ((i & 7) - 3.5) / 4.5;

// At most `max` items, spread evenly through the list.
const thin = (list, max) => list.length <= max ? list
  : Array.from({ length: max }, (_, j) => list[Math.floor(j * list.length / max)]);

// A generation's births and deaths as a short phrase from the downbeat:
// births on sixteenths left to right, deaths as ghosts an octave down,
// falling between them right to left.
function voice(born, died, at) {
  if (!sound) return;
  const beat = 60 / state.bpm, sixteenth = beat / 4;
  const start = sound.now + Math.max(0, at - clock()) + 0.03;
  const B = thin([...born].sort((a, b) => (a & 7) - (b & 7) || b - a), 8);
  const D = thin([...died].sort((a, b) => (b & 7) - (a & 7) || a - b), 6);
  const bg = 0.16 / Math.sqrt(Math.max(1, B.length / 3));
  const dg = 0.09 / Math.sqrt(Math.max(1, D.length / 3));
  B.forEach((i, k) => sound.birth(pitch(i), start + k * sixteenth, { gain: bg, pan: pan(i) }));
  D.forEach((i, k) => sound.death(pitch(i) / 2, start + (k + 0.5) * sixteenth, { gain: dg, pan: pan(i) }));
}

// ----------------------------------------------------------------- life --

function advance(at = clock()) {
  const { born, died } = changes(state.board, state.next);
  state.board = state.next;
  state.next = step(state.board, state.rule);
  state.generation++;
  state.sprinkled.clear();
  voice(born, died, at);

  const k = key(state.board);
  state.stalled = population(state.board) === 0 || state.history.includes(k) ? state.stalled + 1 : 0;
  state.history.push(k);
  if (state.history.length > 12) state.history.shift();
  if (state.auto && state.stalled >= STALL_GENS) sprinkle();
  updateText();
}

// Bring a stalled board back: reseed an empty one, or sprinkle five cells
// into a still or looping one. Deterministic from seed and generation.
function sprinkle() {
  const rand = prng(state.seed * 7919 + state.generation);
  if (population(state.board) === 0) {
    state.board = seeded(Math.floor(rand() * 2 ** 31));
  } else {
    const dead = [];
    state.board.forEach((v, i) => { if (!v) dead.push(i); });
    for (let n = 0; n < 5 && dead.length; n++) {
      const i = dead.splice(Math.floor(rand() * dead.length), 1)[0];
      state.board[i] = 1;
      state.sprinkled.add(i);
    }
  }
  state.next = step(state.board, state.rule);
  state.history = [];
  state.stalled = 0;
}

function edited() {
  state.next = step(state.board, state.rule);
  state.history = [];
  state.stalled = 0;
  updateText();
}

// ---------------------------------------------------------------- input --

grid.on('press', e => {
  const t = clock();
  if (e.kind === 'grid') {
    state.board[e.index] ^= 1;
    state.sprinkled.delete(e.index);
    if (sound) {
      const at = sound.now + 0.01;
      if (state.board[e.index]) sound.birth(pitch(e.index), at, { gain: 0.08, pan: pan(e.index), length: 0.6 });
      else sound.death(pitch(e.index) / 2, at, { gain: 0.06, pan: pan(e.index), length: 0.9 });
    }
    edited();
  } else if (e.kind === 'right') {
    state.ruleIndex = e.y;
    state.rule = parseRule(RULES[e.y].code);
    edited();
  } else {
    command(TOP[e.x], t);
  }
});

function command(name, t = clock()) {
  switch (name) {
    case 'play':
      state.playing = !state.playing;
      if (state.playing) state.genStart = t;
      break;
    case 'step':
      advance(t);
      if (state.playing) state.genStart = t;
      break;
    case 'slower': state.bpm = Math.max(40, state.bpm - 8); break;
    case 'faster': state.bpm = Math.min(240, state.bpm + 8); break;
    case 'omen': state.omen = OMEN_MODES[(OMEN_MODES.indexOf(state.omen) + 1) % OMEN_MODES.length]; break;
    case 'auto': state.auto = !state.auto; break;
    case 'reseed':
      state.seed++;
      state.board = seeded(state.seed);
      state.sprinkled.clear();
      edited();
      break;
    case 'clear':
      state.board = new Uint8Array(64);
      state.sprinkled.clear();
      edited();
      break;
  }
  updateText();
}

addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); command('play'); }
});

// --------------------------------------------------------------- render --

// The omen shows on the off-beats of beats 2 and 3, then on every eighth
// off-beat of beat 4, so it flickers faster as the generation turns.
function omenVisible(phase) {
  const b = Math.floor(phase), frac = phase - b;
  if (b === 0) return false;
  if (b < 3) return frac >= 0.5;
  return frac % 0.5 >= 0.25;
}

function frameAt(t) {
  const beat = 60 / state.bpm, genDur = beat * BEATS_PER_GEN;
  const phase = (((t - state.genStart) % genDur) + genDur) % genDur / beat;
  const omen = state.omen === 'steady' || (state.omen === 'flicker' && omenVisible(phase));
  const f = grid.frame();

  for (let i = 0; i < 64; i++) f.set(i, state.board[i] ? C.GREEN : C.OFF);
  for (const i of state.sprinkled) if (state.board[i]) f.set(i, C.YELLOW);
  if (omen) {
    const { born, died } = changes(state.board, state.next);
    for (const i of died) f.set(i, C.RED);
    for (const i of born) f.set(i, C.AMBER);
  }

  const held = name => grid.held.has(topIndex(TOP.indexOf(name)));
  const onBeat = (phase % 1) < 0.15;
  f.top(0, state.playing ? (onBeat ? C.GREEN : C.GREEN_DIM) : C.RED_DIM);
  f.top(1, held('step') ? C.AMBER : C.AMBER_DIM);
  f.top(2, held('slower') ? C.AMBER : C.AMBER_DIM);
  f.top(3, held('faster') ? C.AMBER : C.AMBER_DIM);
  f.top(4, { flicker: C.AMBER, steady: C.RED, off: C.AMBER_DIM }[state.omen]);
  f.top(5, state.auto ? C.GREEN : C.RED_DIM);
  f.top(6, held('reseed') ? C.YELLOW : C.AMBER_DIM);
  f.top(7, held('clear') ? C.RED : C.RED_DIM);
  for (let y = 0; y < 8; y++) f.right(y, y === state.ruleIndex ? C.AMBER : C.GREEN_DIM);
  return f;
}

function tick() {
  const t = clock();
  const genDur = 60 / state.bpm * BEATS_PER_GEN;
  if (state.playing && t >= state.genStart + genDur) {
    // One generation per tick; after a long stall (a sleeping tab), resync.
    state.genStart = t - state.genStart > 2 * genDur ? t : state.genStart + genDur;
    advance(state.genStart);
  }
  grid.show(frameAt(t));
}
setInterval(tick, 10);

// ------------------------------------------------------------------ page --

function updateText() {
  const r = RULES[state.ruleIndex];
  $('gen').textContent = state.generation;
  $('pop').textContent = population(state.board);
  $('rule').textContent = `${r.name} · ${r.code}`;
  $('bpm').textContent = state.bpm;
  $('seed').textContent = state.seed;
  $('omen').textContent = state.omen;
  $('auto').textContent = state.auto ? 'on' : 'off';
  $('playing').textContent = state.playing ? 'playing' : 'paused';
}

grid.on('status', ({ status, detail, sysex }) => {
  const el = $('status');
  el.className = 'status ' + (status === 'connected' ? 'ok' : 'bad');
  el.innerHTML = {
    connected: `<b>Launchpad connected</b> · ${detail}${sysex ? '' : ' · no SysEx'}`,
    searching: '<b>no Launchpad Mini found</b> · the twin still plays; plug it in any time',
    denied: '<b>MIDI permission denied</b> · the twin still plays',
    unsupported: '<b>no Web MIDI here</b> · use Chrome or Edge; the twin still plays',
    standby: '<b>another page has the Launchpad</b> · click this page to take it',
  }[status] ?? status;
});

$('begin').onclick = async () => {
  $('begin').disabled = true;
  if (!sound) { sound = new Sound(); await sound.resume(); }
  const status = await grid.connect();
  if (status === 'connected') await grid.scroll('omen', { speed: 7, colour: C.AMBER });
  state.playing = true;
  state.genStart = clock();
  $('begin').textContent = 'Playing';
  updateText();
};

updateText();
window.omen = { state, grid, advance, command, frameAt, get sound() { return sound; } };
