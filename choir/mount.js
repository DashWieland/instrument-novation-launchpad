// choir: you play the soprano, on screen or on a Launchpad Mini (2013); Bach's
// rules harmonize every note in four parts the moment you press it, on the
// Choral Hurdy-Gurdy's organ.
//
//   const { dispose, retheme } = mountChoir(container, { recording })
//
// Framework-free, so the site can mount it from a thin React shell (as the
// Hurdy-Gurdy is mounted) and this repo's standalone page can too. It builds
// its own DOM inside `container`, reads every colour and type size from the
// host page's design tokens (choir.css), and dispose() takes everything down
// again: the sound, MIDI, the Launchpad's lights, timers and listeners.
//
// The grid: a two-octave keyboard (layout.js). The columns are do re mi fa sol
// la ti do; the bottom half is the lower octave, the top half the upper. Each
// key is a bar of four pads, a tension ladder (Harmonizer.ladder): four chords
// for the same note from most settled (bottom) to most tense (top), each lit
// in the colour of what it does: home, away or tension. Where the last chord
// wants to go (wants()), those pads pulse. The right column: eight keys to
// take the phrase to (keys.js, trip.js). The top row: the home key down or up
// a fifth, major/minor, new piece, latch, alto, tenor, bass.

import { Grid } from '../kit/grid.js';
import { C } from '../kit/launchpad.js';
import { Organ } from '../vendor/choral-counterpoint/audio.js';
import { Harmonizer, functionOf, DOMINANT, wants } from './harmonizer.js';
import { SOLFEGE, keyAt, pitchOf, playable, noteName, pcName, syllable, lowerDo, MINOR } from './layout.js';
import { destinations, distance, closeness, sameKey, keyName, keyLongName } from './keys.js';
import { phase, tripView } from './trip.js';
import { Outputs } from './output.js';

const TOP = ['key ♭', 'key ♯', 'mode', 'new', 'latch', 'alto', 'tenor', 'bass'];
const TOP_LABEL = ['♭', '♯', 'mode', 'new', 'latch', 'alto', 'tenor', 'bass'];
const VOICES = ['s', 'a', 't', 'b'];
const VOICE_NAMES = { s: 'soprano', a: 'alto', t: 'tenor', b: 'bass' };
const COLOUR = { home: C.GREEN, away: C.RED, tension: C.AMBER };
const NEAR = { near: C.GREEN, middle: C.AMBER, far: C.RED };
const mod12 = x => ((x % 12) + 12) % 12;
const rungAt = y => 3 - (y % 4);               // a bar's pads: 0 at the bottom (settled) … 3 at the top (tense)

// The Launchpad's red/green LED codes, as the page's tokens: what the code
// means here, not what the diode looks like. Green is home (verdigris), red is
// away (Pompeian red), amber is tension (ochre); the dim codes are the same
// colours let down into the sunken ground. Never a literal colour.
const TOKEN = {
  [C.GREEN]: 'var(--color-accent-3)',
  [C.RED]: 'var(--color-accent-1)',
  [C.AMBER]: 'var(--color-signal)',
  [C.GREEN_DIM]: 'color-mix(in srgb, var(--color-accent-3) 35%, var(--color-surface-sunken))',
  [C.RED_DIM]: 'color-mix(in srgb, var(--color-accent-1) 35%, var(--color-surface-sunken))',
  [C.AMBER_DIM]: 'color-mix(in srgb, var(--color-signal) 35%, var(--color-surface-sunken))',
  [C.YELLOW]: 'var(--color-signal)',
};
const colourOf = code => TOKEN[code] ?? null;

const HTML = recording => `
  <div class="choir-bar">
    <button type="button" class="choir-btn choir-connect" data-part="connect">connect a Launchpad</button>
    <button type="button" class="choir-btn choir-hush" data-part="hush">hush</button>
    <p class="choir-status" data-part="status" role="status">Press any lit pad to play. A Launchpad Mini (2013) works too, in Chrome or Edge.</p>
  </div>
  <div class="choir-stage">
    <div class="choir-board"><div class="choir-grid" data-part="grid"></div></div>
    <div class="choir-readout">
      <p class="choir-key" data-part="key"></p>
      <p class="choir-chord" data-part="chord" aria-live="polite">—</p>
      <p class="choir-fn" data-part="fn"></p>
      <p class="choir-hint" data-part="hint"></p>
      <p class="choir-trip" data-part="trip" hidden></p>
      <dl class="choir-voices">
        ${VOICES.map(v => `<div><dt>${VOICE_NAMES[v]}</dt><dd data-part="v-${v}">—</dd></div>`).join('')}
      </dl>
      <p class="choir-history" data-part="history" aria-label="the chords so far"></p>
      <ul class="choir-legend">
        <li><i data-fn="home"></i><span><b>home</b> · the tonic or its relative. Rest.</span></li>
        <li><i data-fn="away"></i><span><b>away</b> · leaving home (ii, IV).</span></li>
        <li><i data-fn="tension"></i><span><b>tension</b> · wants to resolve (V, vii°).</span></li>
        <li><i data-fn="pulse"></i><span><b>pulsing</b> · where the last chord wants to go.</span></li>
      </ul>
    </div>
  </div>
  <details class="choir-how">
    <summary>how to play</summary>
    <div class="choir-how-body">
      <p><em>The keyboard.</em> The columns are do re mi fa sol la ti do in every key, so the left column is always home. The bottom half of the grid is one octave and the top half the octave above. In minor, the 6th and 7th rise when you climb to them and fall when you come down, as singers do.</p>
      <p><em>Each key is a tension ladder</em>: four chords for the same note, the most settled at the bottom, the most tense at the top. Press lower to resolve, higher to build. After a chord that wants to go somewhere, the pads that take it there pulse.</p>
      <p><em>The right column</em> takes the phrase to another key. Each is lit by how far it is from where you are: green a step away, amber further, red far; the key you're in pulses. Press one, then follow the lights: amber keys are the way in (the new key's dominant), then a green key lands on its tonic. Press the key you're in to end a phrase where you are; press a blinking one again to stay.</p>
      <p><em>The top row</em> moves the home key down or up a fifth, switches major and minor, starts a new piece, and turns latch, alto, tenor and bass on or off. With latch on, each chord rings until your next note. Hush silences the choir. On a keyboard: N new piece, L latch, C end the phrase here.</p>
      <p><em>The Launchpad.</em> An original Launchpad Mini (2013, red and green lights) plugged in before you press <em>connect</em> plays everything above, in Chrome or Edge. The screen and the Launchpad stay in step; play on either.</p>
    </div>
  </details>
  ${recording ? `
  <details class="choir-how choir-record">
    <summary>record into a DAW</summary>
    <div class="choir-how-body">
      <div class="choir-outs">
        <label>hear it on <select data-part="hear" disabled><option>play a note first</option></select></label>
        <label>also send to <select data-part="send" disabled><option value="">nothing</option></select></label>
      </div>
      <p data-part="outnote">Send a copy to BlackHole 2ch and record its input in your DAW (in Ableton: Audio From Ext. In 1/2, Monitor Off). The rest of your computer keeps its own output.</p>
      <button type="button" class="choir-btn" data-part="names" hidden>show device names</button>
    </div>
  </details>` : ''}
`;

export function mountChoir(container, { recording = false } = {}) {
  const root = document.createElement('div');
  root.className = 'choir';
  root.innerHTML = HTML(recording);
  container.append(root);
  const $ = part => root.querySelector(`[data-part="${part}"]`);

  const grid = new Grid({ twin: $('grid'), colour: colourOf });
  const harm = new Harmonizer(7, 'major');
  const state = {
    home: { tonicPc: 7, mode: 'major' },   // the piece's key; the right column is built on it
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
  let ctx = null, organ = null, outputs = null, gone = false;
  const pipes = new Map();        // voice → { midi, handle }
  const here = () => ({ tonicPc: harm.tonicPc, mode: harm.mode });
  const dests = () => destinations(state.home);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // -------------------------------------------------------------- sound --

  // The organ starts on the first note you play on screen (your gesture, not
  // autoplay) or when you connect a Launchpad.
  async function wake() {
    if (gone) return;
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      if (recording && Outputs.supported()) {
        outputs = new Outputs(ctx);
        organ = new Organ(outputs.context);
        fillOutputs(true);
      } else {
        organ = new Organ(ctx);
      }
    }
    if (ctx.state !== 'running') await ctx.resume();
  }

  // Move one voice to a pitch (null: silent). A voice already on that pitch
  // holds it, as a choir holds a common tone, unless `again` re-sounds it.
  function voiceTo(v, midi, { again = false } = {}) {
    if (!organ) return;
    const cur = pipes.get(v);
    if (cur && cur.midi === midi && !again) return;
    if (cur) { organ.noteOff(cur.handle); pipes.delete(v); }
    if (midi !== null) pipes.set(v, { midi, handle: organ.noteOn(v, midi) });
  }

  // The soprano speaks again on every press; muted voices stay silent.
  function sing(chord) {
    state.sounding = true;
    if (!organ) return;
    organ.wind(1);
    for (const v of VOICES) voiceTo(v, v === 's' || state.on[v] ? chord[v] : null, { again: v === 's' });
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

  // ------------------------------------------------------------ preview --

  // Every key: the pitch it would sing now and its ladder of four chords. Off
  // a trip, every rung is lit and the rungs the last chord wants pulse. On a
  // trip, only the rungs that move it on: the new key's dominant (the way in),
  // then its tonic on the bottom rung (arrival).
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

  function play(p, r) {
    const chord = p.rungs[r];
    const arriving = state.trip && phase(harm, state.trip.to) === 'arrive';
    state.chord = harm.commit(chord);
    if (arriving && chord.cadence) state.trip = null;
    sing(chord);
  }

  // -------------------------------------------------------------- input --

  grid.on('press', e => {
    if (e.source === 'twin') wake();
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
      label();
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
      case 'hush': silence(); break;
      case 'alto': case 'tenor': case 'bass': {
        const v = name[0];
        state.on[v] = !state.on[v];
        if (state.sounding && state.chord) sing(state.chord);
        break;
      }
    }
    refresh();
  }

  function setHome(tonicPc, mode) {
    silence();
    state.home = { tonicPc, mode };
    harm.setKey(tonicPc, mode);
    state.chord = null;
    state.trip = null;
    state.held.clear();
    label();
  }

  const onKey = e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    const name = { KeyN: 'new', KeyL: 'latch', KeyC: 'cadence' }[e.code];
    if (name) command(name);
  };
  addEventListener('keydown', onKey);

  $('connect').onclick = async () => {
    $('connect').disabled = true;
    await wake();
    const status = await grid.connect();
    if (status !== 'connected') $('connect').disabled = false;
  };
  $('hush').onclick = () => command('hush');

  grid.on('status', ({ status }) => {
    $('status').textContent = {
      connected: 'Launchpad connected. Play on it or on screen.',
      searching: 'No Launchpad Mini found. Plug it in any time; the screen still plays.',
      standby: 'Another page has the Launchpad. Click here to take it back.',
      denied: 'MIDI permission was refused. The screen still plays.',
      unsupported: 'This browser has no Web MIDI. The screen plays; for the Launchpad, use Chrome or Edge.',
    }[status] ?? '';
    root.dataset.midi = status;
  });

  function refresh() { updatePreview(); updateText(); draw(); }

  // ------------------------------------------------------------- render --

  function draw() {
    if (gone) return;
    const t = performance.now();
    const pulse = t % 1200 < 800, fast = Math.floor(t / 160) % 2 === 0;
    const still = reduce.matches;            // the screen holds still; the Launchpad still blinks
    const f = grid.frame(), tf = grid.frame();
    const mark = new Set();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const { col, octave } = keyAt(x, y);
      const id = `${col}:${octave}`;
      const p = state.preview.get(id), r = rungAt(y);
      let c = C.OFF, steady = C.OFF;
      if (p && state.sounding && state.soundingKey === id) c = steady = r === state.soundingRung ? COLOUR[functionOf(state.chord.name)] : C.OFF;
      else if (p?.lit[r]) {
        steady = COLOUR[functionOf(p.rungs[r].name)];
        c = p.hint[r] && !pulse ? C.OFF : steady;
        if (p.hint[r]) mark.add(y * 8 + x);
      }
      f.grid(x, y, c); tf.grid(x, y, still ? steady : c);
    }
    const held = x => grid.held.has(72 + x);
    const top = [
      held(0) ? C.AMBER : C.AMBER_DIM, held(1) ? C.AMBER : C.AMBER_DIM,
      state.home.mode === 'major' ? C.AMBER : C.RED, held(3) ? C.RED : C.RED_DIM,
      state.latch ? C.GREEN : C.RED_DIM, ...['a', 't', 'b'].map(v => state.on[v] ? C.GREEN : C.RED_DIM),
    ];
    top.forEach((c, x) => { f.top(x, c); tf.top(x, c); });
    // the destinations: the trip's blinks fast (amber, then green once it can
    // land), the key you're in pulses, the rest show how far away they are
    dests().forEach((d, y) => {
      let c, steady;
      if (state.trip && sameKey(state.trip.to, d)) {
        steady = phase(harm, d) === 'arrive' ? C.GREEN : C.AMBER;
        c = fast ? steady : C.OFF;
        mark.add(64 + y);
      } else if (sameKey(d, here())) {
        steady = C.GREEN; c = pulse ? C.GREEN : C.OFF;
        mark.add(64 + y);
      } else c = steady = NEAR[closeness(distance(here(), d))];
      f.right(y, c); tf.right(y, still ? steady : c);
    });
    grid.show(f, tf);
    for (let i = 0; i < 72; i++) grid.twin.flag(i, 'choir-mark', still && mark.has(i));
  }
  const timer = setInterval(draw, 80);       // the pulse and the blink
  const onMotion = () => draw();
  reduce.addEventListener('change', onMotion);

  // --------------------------------------------------------------- page --

  // Under each column its syllable and note (minor's 6th and 7th show both);
  // above the top row what each button does; beside the right column each
  // destination's key. Pads are named for screen readers in updateText().
  function label() {
    const base = lowerDo(harm.tonicPc), names = SOLFEGE[harm.mode];
    const bottom = names.map((syl, col) => {
      if (harm.mode === 'minor' && (col === 5 || col === 6)) {
        const nat = base + MINOR[col];
        return `${syl}/${col === 5 ? 'la' : 'ti'}\n${pcName(nat)}/${pcName(nat + 1)}`;
      }
      return `${syl}\n${pcName(pitchOf(harm.tonicPc, harm.mode, col, 0))}`;
    });
    grid.twin.setLabels({ top: TOP_LABEL, right: dests().map(keyName), bottom });
    grid.twin.labelEls.top.forEach((el, x) => el.classList.toggle('choir-glyph', TOP_LABEL[x].length === 1));
    dests().forEach((d, y) => grid.twin.cells[64 + y].setAttribute('aria-label', `go to ${keyLongName(d)} (${d.role})`));
    TOP.forEach((name, x) => grid.twin.cells[72 + x].setAttribute('aria-label', name));
  }

  function hintText(c) {
    if (!c || state.trip) return '';
    if (DOMINANT.has(c.name)) return `${c.name} wants to go home: the pulsing pads resolve it.`;
    if (c.name.includes('/')) return `${c.name} leans toward ${c.name.split('/')[1]}: the pulsing pads go there.`;
    if (functionOf(c.name) === 'away') return 'Away from home: the pulsing pads build tension toward it.';
    return '';
  }

  function updateText() {
    const cur = here();
    $('key').textContent = keyLongName(cur) + (sameKey(cur, state.home) ? '' : ` · home ${keyLongName(state.home)}`);
    const c = state.chord, fn = c ? functionOf(c.name) : null;
    $('chord').textContent = c ? `${c.name.replace('o', '°')}${c.cadence ? ' 𝄐' : ''}` : '—';
    $('fn').textContent = fn ?? 'play any lit pad';
    $('fn').dataset.fn = fn ?? '';
    $('hint').textContent = hintText(c);
    for (const v of VOICES) $(`v-${v}`).textContent = c
      ? (v === 's' ? `${noteName(c.s)} ${syllable(harm.tonicPc, harm.mode, c.s)}` : state.on[v] ? noteName(c[v]) : 'rests')
      : '—';
    let lastKey = null;
    $('history').innerHTML = harm.chords.slice(-16).map(x => {
      const mark = lastKey && !sameKey(lastKey, x) ? `<span class="choir-mod">→ ${keyName(x)}</span> ` : '';
      lastKey = x;
      return `${mark}<span data-fn="${functionOf(x.name)}">${x.name.replace('o', '°')}${x.cadence ? '𝄐' : ''}</span>`;
    }).join(' ');
    const trip = state.trip;
    $('trip').hidden = !trip;
    if (trip) {
      const to = keyLongName(trip.to), homeward = sameKey(trip.to, state.home) && sameKey(cur, trip.to);
      $('trip').textContent = phase(harm, trip.to) === 'arrive'
        ? `Now a green pad lands ${homeward ? 'home' : `in ${to}`}.`
        : `On the way to ${to}: an amber pad brings its dominant, then a green one lands.`;
    }
    // screen readers: each pad says its note and chord
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const { col, octave } = keyAt(x, y), p = state.preview.get(`${col}:${octave}`);
      const el = grid.twin.cells[y * 8 + x];
      if (!p) { el.setAttribute('aria-label', 'silent'); continue; }
      const ch = p.rungs[rungAt(y)];
      el.setAttribute('aria-label', `${syllable(harm.tonicPc, harm.mode, p.m)} ${noteName(p.m)}, ${ch.name}, ${functionOf(ch.name)}${p.lit[rungAt(y)] ? '' : ' (dark)'}`);
    }
  }

  // ------------------------------------------------- recording (optional) --

  const remember = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage off */ } };
  const recall = k => { try { return localStorage.getItem(k); } catch { return null; } };
  async function fillOutputs(restore = false) {
    if (!recording || !outputs || gone) return;
    const devices = await Outputs.list();
    const named = devices.some(d => d.label);
    const option = (d, i) => `<option value="${d.deviceId}">${d.label || (d.deviceId === 'default' ? 'system default' : `output ${i + 1}`)}</option>`;
    $('hear').innerHTML = devices.map(option).join('');
    $('send').innerHTML = '<option value="">nothing</option>' + devices.filter(d => d.deviceId !== 'default').map(option).join('');
    $('hear').disabled = $('send').disabled = false;
    $('names').hidden = named;
    if (restore) {
      const h = recall('choir.hear'), s = recall('choir.send');
      if (h && devices.some(d => d.deviceId === h)) { $('hear').value = h; await outputs.hearOn(h).catch(() => {}); }
      if (s && devices.some(d => d.deviceId === s)) { $('send').value = s; await outputs.alsoSendTo(s).catch(() => {}); }
    }
  }
  const onDevices = () => fillOutputs();
  if (recording) {
    $('hear').onchange = async e => {
      if (e.target.value === $('send').value) { $('send').value = ''; await outputs.alsoSendTo(null); remember('choir.send', null); }
      await outputs.hearOn(e.target.value);
      remember('choir.hear', e.target.value);
    };
    $('send').onchange = async e => {
      if (e.target.value && e.target.value === $('hear').value) { e.target.value = ''; return; }
      await outputs.alsoSendTo(e.target.value || null);
      remember('choir.send', e.target.value || null);
    };
    $('names').onclick = async () => {
      try { await Outputs.showNames(); } catch { $('outnote').textContent = 'Microphone permission was refused, so the devices stay unnamed.'; return; }
      await fillOutputs();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDevices);
  }

  label();
  refresh();

  return {
    // Everything down: the choir silent, the organ's AudioContext closed, the
    // Launchpad dark and released, timers and listeners off, the DOM gone.
    dispose() {
      gone = true;
      clearInterval(timer);
      reduce.removeEventListener('change', onMotion);
      removeEventListener('keydown', onKey);
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDevices);
      silence();
      outputs?.alsoSendTo(null).catch(() => {});
      ctx?.close().catch(() => {});
      grid.dispose();
      root.remove();
    },
    // Colours are CSS custom properties, so a theme change needs nothing
    // redrawn; this is here for the site shell's onTurn hook.
    retheme() { draw(); },
    debug: { harm, state, grid, command, go, dests, draw, get organ() { return organ; }, get outputs() { return outputs; } },
  };
}
