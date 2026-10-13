// Choir: you play the soprano on the Launchpad; Bach's rules harmonize every
// note in four parts the moment you press it, on the hurdy-gurdy's organ.
//
// Grid: a two-octave keyboard (choir/layout.js). The columns are do re mi fa
// sol la ti do; the bottom half is the lower octave, the top half the upper.
// Each key is a bar of four pads: a tension ladder (Harmonizer.ladder), four
// chords for the same note from most settled (bottom) to most tense (top),
// each lit in the colour of what it does: green = home, red = away, amber =
// tension. Press lower to resolve, higher to build. Where the last chord
// wants to go (wants()), those pads pulse: after a dominant, its tonic; after
// a secondary dominant, its target; after an away chord, a dominant. The key
// sounding now keeps only the pad you pressed lit.
//
// Right column: where the phrase goes (choir/keys.js, choir/trip.js). Eight
// keys: home, the five closely related keys, the parallel key, one far key,
// lit by how far each is from where you are (green near, amber further, red
// far); the key you're in pulses. Press one and the grid re-centres on it:
// amber keys are the way in (its dominant), then green keys land on its
// tonic. The key you're in is a cadence home the same way.
//
// Top row: home key down a fifth, up a fifth, major/minor, new piece, latch,
// alto, tenor, bass.

import { Grid } from '../kit/grid.js';
import { C } from '../kit/launchpad.js';
import { Organ } from '../vendor/choral-counterpoint/audio.js';
import { Harmonizer, functionOf, DOMINANT, wants } from './harmonizer.js';
import { SOLFEGE, keyAt, pitchOf, playable, noteName, pcName, syllable, lowerDo, MINOR } from './layout.js';
import { destinations, distance, closeness, sameKey, keyName, keyLongName } from './keys.js';
import { phase, tripView } from './trip.js';
import { Outputs } from './output.js';

const TOP = ['key ♭', 'key ♯', 'mode', 'new', 'latch', 'alto', 'tenor', 'bass'];
const VOICES = ['s', 'a', 't', 'b'];
const COLOUR = { home: C.GREEN, away: C.RED, tension: C.AMBER };
const NEAR = { near: C.GREEN, middle: C.AMBER, far: C.RED };
const WORD = { home: 'home', away: 'away', tension: 'tension' };
const $ = id => document.getElementById(id);
const mod12 = x => ((x % 12) + 12) % 12;

const grid = new Grid({ twin: $('twin') });
const harm = new Harmonizer(7, 'major');
const state = {
  home: { tonicPc: 7, mode: 'major' },   // the piece's key (G major); the right column is built on it
  trip: null,                   // { to: key } while a phrase is on its way somewhere
  held: new Map(),              // pad index → key ({ col, octave }) of melody pads held now
  chord: null,                  // the chord last sung
  soundingKey: null,            // 'col:octave' of the key that sang it, while it sounds
  soundingRung: 0,              // and which of its four pads
  sounding: false,
  latch: true,                  // the chord rings until the next note: no need to keep time
  on: { a: true, t: true, b: true },
  preview: new Map(),           // 'col:octave' → { m, rungs, lit, hint } for every playable key
};
const rungAt = y => 3 - (y % 4);               // a bar's pads: 0 at the bottom (settled) … 3 at the top (tense)
let ctx = null, organ = null, outputs = null;
const pipes = new Map();        // voice → { midi, handle }

const here = () => ({ tonicPc: harm.tonicPc, mode: harm.mode });
const dests = () => destinations(state.home);

// ---------------------------------------------------------------- sound --

// Move one voice to a pitch (null: silent). A voice already on that pitch
// holds it, as a choir holds a common tone, unless `again` re-sounds it.
function voiceTo(v, midi, { at, again = false } = {}) {
  if (!organ) return;
  const cur = pipes.get(v);
  if (cur && cur.midi === midi && !again) return;
  if (cur) { organ.noteOff(cur.handle, undefined, at); pipes.delete(v); }
  if (midi !== null) pipes.set(v, { midi, handle: organ.noteOn(v, midi, { at }) });
}
const wanted = (v, m) => (v === 's' || state.on[v] ? m : null);

// Sing a chord. The soprano speaks again on every press (unless it is held
// over as a suspension); `roll` brings the voices in from the bass up;
// `hold` keeps one voice on its old note (a suspension, until resolved).
function sing(chord, { roll = false, hold = null } = {}) {
  state.sounding = true;
  if (!organ) return;
  organ.wind(1);
  const now = organ.ctx.currentTime;
  (roll ? ['b', 't', 'a', 's'] : VOICES).forEach((v, k) => {
    const held = hold?.voice === v;
    voiceTo(v, wanted(v, held ? hold.pitch : chord[v]), { at: roll ? now + 0.08 * k : undefined, again: v === 's' && !held });
  });
}

function silence() {
  if (organ) {
    for (const { handle } of pipes.values()) organ.noteOff(handle);
    organ.wind(0);
  }
  pipes.clear();
  state.sounding = false;
  state.soundingKey = null;
}

// -------------------------------------------------------------- preview --

// For every key: the pitch it would sing now and its ladder of four chords.
// Off a trip, every rung is lit and the rungs the last chord wants pulse. On
// a trip, only the rungs that move it on are lit: a dominant of the new key
// (the way in), then the tonic on the bottom rung (arrival). ~16 keys, a few ms.
function updatePreview() {
  state.preview.clear();
  const prev = harm.chords.at(-1)?.s ?? null;
  const want = state.trip ? null : wants(harm.chords.at(-1));
  for (const octave of [0, 1]) for (let col = 0; col < 8; col++) {
    const m = pitchOf(harm.tonicPc, harm.mode, col, octave, prev);
    if (!playable(m)) continue;
    const rungs = harm.ladder(m);
    let lit = [true, true, true, true];
    let hint = rungs.map(c => !!want && want(c));
    if (state.trip) {
      const v = tripView(harm, state.trip.to, m);
      if (phase(harm, state.trip.to) === 'arrive') {
        if (v.lit) rungs[0] = v.chord;
        lit = [v.lit, false, false, false];
      } else {
        if (v.lit && !rungs.some(c => DOMINANT.has(c.name))) rungs[2] = v.chord;
        lit = rungs.map(c => DOMINANT.has(c.name));
      }
      hint = [false, false, false, false];
    }
    state.preview.set(`${col}:${octave}`, { m, rungs, lit, hint });
  }
}

// Play rung r of key p: commit the chord to the choir and sound it.
function play(p, r) {
  const chord = p.rungs[r];
  const arriving = state.trip && phase(harm, state.trip.to) === 'arrive';
  state.chord = harm.commit(chord);
  if (arriving && chord.cadence) state.trip = null;
  sing(chord);
}

// ---------------------------------------------------------------- input --

grid.on('press', e => {
  if (e.kind === 'grid') {
    const key = keyAt(e.x, e.y);
    const p = state.preview.get(`${key.col}:${key.octave}`);
    if (!p) return;                                   // above E6: dark and silent
    state.held.set(e.index, key);
    play(p, rungAt(e.y));
    state.soundingKey = `${key.col}:${key.octave}`;
    state.soundingRung = rungAt(e.y);
  } else if (e.kind === 'right') {
    go(dests()[e.y]);
  } else {
    command(TOP[e.x]);
    return;
  }
  refresh();
});

grid.on('release', e => {
  if (e.kind === 'grid' && state.held.delete(e.index) && !state.held.size && !state.latch) silence();
  draw();
});

// Set off for key d (or, pressed again on the way, stay where you are).
function go(d) {
  if (state.trip && sameKey(state.trip.to, d)) { state.trip = null; return; }
  if (!sameKey(d, here())) {
    harm.modulate(d.tonicPc, d.mode);
    labelColumns();
  }
  state.trip = { to: d };
}

function command(name) {
  switch (name) {
    case 'key ♭': setHome(mod12(state.home.tonicPc - 7), state.home.mode); break;
    case 'key ♯': setHome(mod12(state.home.tonicPc + 7), state.home.mode); break;
    case 'mode': setHome(state.home.tonicPc, state.home.mode === 'major' ? 'minor' : 'major'); break;
    case 'new': setHome(state.home.tonicPc, state.home.mode); break;
    case 'latch': state.latch = !state.latch; if (!state.latch && !state.held.size) silence(); break;
    case 'cadence': go(here()); break;
    case 'alto': case 'tenor': case 'bass': {
      const v = name[0];
      state.on[v] = !state.on[v];
      if (state.sounding && state.chord) sing(state.chord);
      break;
    }
  }
  refresh();
}

// A new piece in a new home key.
function setHome(tonicPc, mode) {
  silence();
  state.home = { tonicPc, mode };
  harm.setKey(tonicPc, mode);
  state.chord = null;
  state.trip = null;
  state.held.clear();
  labelColumns();
}

addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyN') command('new');
  if (e.code === 'KeyL') command('latch');
  if (e.code === 'KeyC') command('cadence');
});

function refresh() { updatePreview(); updateText(); draw(); }

// --------------------------------------------------------------- render --

function draw() {
  const f = grid.frame();
  const pulse = performance.now() % 1200 < 800;      // the pads the last chord wants, and the key you're in
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const { col, octave } = keyAt(x, y);
    const id = `${col}:${octave}`;
    let c = C.OFF;
    const p = state.preview.get(id), r = rungAt(y);
    if (p && state.sounding && state.soundingKey === id) c = r === state.soundingRung ? COLOUR[functionOf(state.chord.name)] : C.OFF;
    else if (p?.lit[r] && !(p.hint[r] && !pulse)) c = COLOUR[functionOf(p.rungs[r].name)];
    f.grid(x, y, c);
  }
  const held = x => grid.held.has(72 + x);
  f.top(0, held(0) ? C.AMBER : C.AMBER_DIM);
  f.top(1, held(1) ? C.AMBER : C.AMBER_DIM);
  f.top(2, state.home.mode === 'major' ? C.AMBER : C.RED);
  f.top(3, held(3) ? C.RED : C.RED_DIM);
  f.top(4, state.latch ? C.GREEN : C.RED_DIM);
  ['a', 't', 'b'].forEach((v, k) => f.top(5 + k, state.on[v] ? C.GREEN : C.RED_DIM));

  // The destinations: the trip's blinks fast (amber, then green once it can
  // land), the key you're in pulses, the rest show how far away they are.
  const t = performance.now();
  const fast = Math.floor(t / 160) % 2 === 0, slow = t % 1200 < 800;
  dests().forEach((d, y) => {
    let c;
    if (state.trip && sameKey(state.trip.to, d))
      c = fast ? (phase(harm, d) === 'arrive' ? C.GREEN : C.AMBER) : C.OFF;
    else if (sameKey(d, here())) c = slow ? C.GREEN : C.OFF;
    else c = NEAR[closeness(distance(here(), d))];
    f.right(y, c);
  });
  grid.show(f);
}
setInterval(draw, 80);           // the pulse and the blink

// ------------------------------------------------------------------ page --

// Under each column: its syllable and note (minor's 6th and 7th show both);
// beside the right column: each destination's key and its relation to home.
function labelColumns() {
  const base = lowerDo(harm.tonicPc), names = SOLFEGE[harm.mode];
  const bottom = names.map((syl, col) => {
    if (harm.mode === 'minor' && (col === 5 || col === 6)) {
      const nat = base + MINOR[col];
      return `${syl}/${col === 5 ? 'la' : 'ti'}\n${pcName(nat)}/${pcName(nat + 1)}`;
    }
    return `${syl}\n${pcName(pitchOf(harm.tonicPc, harm.mode, col, 0))}`;
  });
  grid.twin.setLabels({ top: TOP, right: dests().map(d => `${keyName(d)} · ${d.role}`), bottom });
}

// What the pulsing pads mean after chord c.
function hintText(c) {
  if (!c || state.trip) return '';
  const fn = functionOf(c.name);
  if (DOMINANT.has(c.name)) return `${c.name} wants to go home: the pulsing pads resolve it.`;
  if (c.name.includes('/')) return `${c.name} leans toward ${c.name.split('/')[1]}: the pulsing pads go there.`;
  if (fn === 'away') return 'Away from home: the pulsing pads build tension toward it.';
  return '';
}

function updateText() {
  const cur = here();
  $('key').textContent = keyLongName(cur) + (sameKey(cur, state.home) ? '' : ` · home ${keyLongName(state.home)}`);
  const c = state.chord;
  const fn = c ? functionOf(c.name) : null;
  $('chord').textContent = c ? `${c.name}${c.cadence ? ' 𝄐' : ''}` : '—';
  $('hint').textContent = hintText(c);
  $('fn').textContent = c ? WORD[fn] : '';
  $('fn').dataset.fn = fn ?? '';
  for (const v of VOICES) $(`v-${v}`).textContent = c
    ? (v === 's' ? `${noteName(c.s)} · ${syllable(harm.tonicPc, harm.mode, c.s)}` : noteName(c[v]) + (state.on[v] ? '' : ' (muted)'))
    : '—';
  let lastKey = null;
  $('history').innerHTML = harm.chords.slice(-24).map(x => {
    const mark = lastKey && !sameKey(lastKey, x) ? `<span class="mod">→ ${keyName(x)}</span> ` : '';
    lastKey = x;
    return `${mark}<span data-fn="${functionOf(x.name)}">${x.name}${x.cadence ? '𝄐' : ''}</span>`;
  }).join(' ') || '—';
  const { V, W } = harm.check();
  $('check').textContent = harm.chords.length
    ? `${harm.chords.length} chords · ${V.filter(v => !v.startsWith('s:')).length} rule breaks by the choir · ${W.length} warnings`
    : 'nothing sung yet';
  $('latch').textContent = state.latch ? 'on: the chord rings until your next note' : 'off: the chord sounds while you hold';
  const trip = state.trip;
  $('trip').hidden = !trip;
  if (trip) {
    const to = keyLongName(trip.to), homeward = sameKey(trip.to, state.home) && sameKey(cur, trip.to);
    $('trip').textContent = phase(harm, trip.to) === 'arrive'
      ? `Now a green key lands ${homeward ? 'home' : `in ${to}`}.`
      : `On the way to ${to}: play an amber key (it brings ${to}'s dominant), then a green one. Press the blinking button again to stay where you are.`;
  }
}

grid.on('status', ({ status, detail }) => {
  const el = $('status');
  el.className = 'status ' + (status === 'connected' ? 'ok' : 'bad');
  el.innerHTML = {
    connected: `<b>Launchpad connected</b> · ${detail}`,
    searching: '<b>no Launchpad Mini found</b> · the twin still plays; plug it in any time',
    standby: '<b>another page has the Launchpad</b> · click this page to take it',
    denied: '<b>MIDI permission denied</b> · the twin still plays',
    unsupported: '<b>no Web MIDI here</b> · use Chrome or Edge; the twin still plays',
  }[status] ?? status;
});

$('begin').onclick = async () => {
  $('begin').disabled = true;
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    if (Outputs.supported()) {
      outputs = new Outputs(ctx);
      organ = new Organ(outputs.context);
    } else {
      organ = new Organ(ctx);
    }
    await ctx.resume();
    await fillOutputs(true);
  }
  await grid.connect();
  $('begin').textContent = 'Ready';
};

// ---------------------------------------------------------------- output --

// The two menus: where you hear Choir, and an optional copy (BlackHole 2ch
// for a DAW). Choices are remembered in this browser.
const remember = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
const recall = k => { try { return localStorage.getItem(k); } catch { return null; } };

async function fillOutputs(restore = false) {
  if (!outputs) { $('outnote').textContent = 'This browser can\'t choose an output (Chrome 110 or later can).'; return; }
  const devices = await Outputs.list();
  const named = devices.some(d => d.label);
  const option = (d, i) => `<option value="${d.deviceId}">${d.label || (d.deviceId === 'default' ? 'system default' : `output ${i + 1}`)}</option>`;
  $('hear').innerHTML = devices.map(option).join('');
  $('send').innerHTML = '<option value="">nothing</option>' + devices.filter(d => d.deviceId !== 'default').map(option).join('');
  $('hear').disabled = $('send').disabled = false;
  $('names').hidden = named;
  $('outnote').textContent = named ? '' : 'Chrome names devices only after the page has had microphone permission once. The page closes the microphone straight away and records nothing.';
  if (restore) {
    const hear = recall('choir.hear'), send = recall('choir.send');
    if (hear && devices.some(d => d.deviceId === hear)) { $('hear').value = hear; await outputs.hearOn(hear).catch(() => {}); }
    if (send && devices.some(d => d.deviceId === send)) { $('send').value = send; await outputs.alsoSendTo(send).catch(() => {}); }
  }
}

$('hear').onchange = async e => {
  if (e.target.value === $('send').value) { $('send').value = ''; await outputs.alsoSendTo(null); remember('choir.send', null); }
  await outputs.hearOn(e.target.value);
  remember('choir.hear', e.target.value);
};
$('send').onchange = async e => {
  if (e.target.value && e.target.value === $('hear').value) { e.target.value = ''; return; }   // the same device twice would double it
  await outputs.alsoSendTo(e.target.value || null);
  remember('choir.send', e.target.value || null);
};
$('names').onclick = async () => {
  try { await Outputs.showNames(); } catch { $('outnote').textContent = 'Microphone permission was refused, so the devices stay unnamed.'; return; }
  await fillOutputs();
};
navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (outputs) fillOutputs(); });

labelColumns();
refresh();
window.choir = { harm, state, grid, command, go, dests, draw, get organ() { return organ; }, get outputs() { return outputs; } };
