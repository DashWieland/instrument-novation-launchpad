# Launchpad instruments

Browser instruments for the **original Launchpad Mini** (2013, red/green LEDs), over Web MIDI.

- `kit/` is a small grid kit.
- `choir/` (**choir**) is a melody instrument harmonized live by the choral-counterpoint engine (vendored in `vendor/`), styled on [apophenia.blog](https://apophenia.blog)'s design system and mountable there.
- `omen-life/` was the first experiment.

There is no build step and there are no dependencies.

- Hardware facts: [HARDWARE.md](HARDWARE.md)
- Where this could go next: [IDEAS.md](IDEAS.md)

## Run

```bash
npm run serve
```

Then open http://localhost:8766 in **Chrome or Edge**. Safari has no Web MIDI.

- Chrome asks for MIDI permission, including SysEx, the first time. SysEx is used only for scrolling text and diagnostics.
- Only one page drives the Mini at a time: the one you last clicked or focused. Others say *another page has the Launchpad*. Open every page from the same address, because the hand-over only works within one origin.

```bash
npm test
```

The tests use Node's built-in runner and cover the protocol bytes, the renderer and the Life rules.

## choir

**How it's built.** `choir/mount.js` exports `mountChoir(container, { recording })`, which returns `{ dispose, retheme }`. It's framework-free, so the site can mount it from a thin React wrapper, as it does the Choral Hurdy-Gurdy.

- **Styling.** Every colour and size in `choir/choir.css` comes from the host page's design tokens (`--color-*`, `--space-*`, the `--type-*` roles), so it follows both faces of the site's coin. It has no literal colours, no shadows or gradients, corners of at most 2px, and a container query for layout.
- **The twin's colours are tokens too.** The Launchpad's codes map to what they mean: home is verdigris, away Pompeian red, tension ochre. The Launchpad itself keeps red, green and amber.
- **Cleanup.** `dispose()` silences the organ, closes its AudioContext, darkens and releases the Launchpad, and removes its timers, listeners and DOM.
- **The standalone page.** `choir/index.html` previews it as it will look on the site, using a copy of the site's tokens (`choir/site-tokens.css`, from dash_website `c38a312`; not copied to the site) and a "turn the coin" toggle. Only this page has the "record into a DAW" output menus (`recording: true`); the site blocks the microphone, which Chrome needs before it will name output devices.
- **Sound starts with your first note on screen.** That's your own gesture, not autoplay. **connect a Launchpad** asks for MIDI, and **hush** silences a latched chord.
- **Reduced motion.** With `prefers-reduced-motion` set, the screen shows still marks where the lights would pulse or blink. The Launchpad still blinks.
- **Pads on a phone.** At 390px the pads are about 27px across, under the 44px touch guideline. Sixty-four pads don't fit larger on a phone.

You play the melody on the grid, one note at a time, in any rhythm. Each note gets a four-part chord the moment you press it, chosen by the choral-counterpoint engine's own machinery and played on the Choral Hurdy-Gurdy's organ.

**How each chord is chosen** (`choir/harmonizer.js`). It works the way the engine composes, but one chord at a time, from what has already been played. It never looks ahead.
- **Bass.** It comes from Bach's outer-voice oracle: the bass notes Bach wrote after the same soprano move from the same bass, weighted by frequency.
- **Alto and tenor.** They come from every voicing of every chord over that bass, under the engine's voice-leading laws and scoring: common tones held, leading tones and sevenths resolved, no false relations.
- **When the rules box it in** (a big melodic leap from a cramped chord), it relaxes in stages. First any bass is allowed, then a stretched soprano–alto spacing (Bach's own escape). As a last resort the rules become penalties, so a chord always comes out.

**On the grid: a two-octave keyboard** (`choir/layout.js`).
- **Columns.** The eight columns are do re mi fa sol la ti do in every key, so the left column is always home. The note names are printed under the twin.
- **Octaves.** The bottom four rows are the lower octave and the top four the upper. Right is one scale step, up is an octave.
- **Four pads per key: a tension ladder** (`Harmonizer.ladder`). Four chords for the same note, from the most settled at the bottom to the most tense at the top, each lit in its colour:
  - settled: the tonic (I) where it fits, otherwise vi;
  - away: IV, ii;
  - tense: V, vii°, iii;
  - most tense: V7, vii°7, secondary dominants.

  To resolve, press lower; to build, press higher. Each rung is the best chord of its kind under the same hard rules. If a kind can't fit under a note, the next best chord fills in.
- **Clues: where the last chord wants to go** (`wants()`). Those pads pulse, and a line under the chord says why:
  - after a dominant, its tonic;
  - after a secondary dominant (V/ii), its target (ii);
  - after an away chord, a dominant.

  An earlier version gave each key's top two pads a figure (press, then lift to resolve) and a rolled chord. In play that read as a "bounce", and the unlit pads didn't say what they did. `choir/figures.js` is kept for a possible "flow" setting.
- **Range.** The lower do is the tonic between C4 and B4. Below C4 the choir was squeezed: phrases ending on a do there closed on I only about half the time. Keys above E6 stay dark (at most four, in B♭ and B).
- **Minor.** The 6th and 7th rise (la, ti) when the melody climbs to them and fall (le, te) when it comes down, as singers do. So the melody never makes le-to-ti's augmented second.

**What the lights show: where each note leads.** Before you press, each key's lower half shows the chord the choir *would* give it now, worked out with the same harmonizer through `peek`:
- **Green, home:** the tonic or its relative (I vi; i VI III).
- **Red, away:** a pre-dominant (ii IV ii7; ii° iv ii°7 ♭VII).
- **Amber, tension:** a dominant (V V7 vii° v), a secondary dominant, or iii. Over ti, iii pulls to I as a dominant does: iii→I was the third most common move into a cadence.

A phrase is a short trip: settle on green, step out to red, lean on amber, then come home. The key now sounding fills its whole bar. The colors describe what a note brings, not whether it's right.

**Where the phrase goes: the right column** (`choir/keys.js`, `choir/trip.js`).
- **The eight buttons** are keys: home at the top, the five closely related keys Bach's chorales modulate to, the parallel key, and one far key. For G major that's G, D, C, Em, Am, Bm, Gm and E♭; for A minor, Am, C, Em, Dm, F, G, A and Fm.
- **Colors show distance from where you are**, counted in sharps and flats: green for one apart (all notes shared but one), amber for two or three, red for four or more. The key you're in pulses.
- **Press one to take the phrase there:**
  - The choir changes key at once but keeps its voice leading, so it pivots instead of starting over.
  - The keyboard re-centres on the new key; do is now its tonic, and the labels change.
  - Only two kinds of key light up, in turn. First **amber**, the way in: whichever you play, the choir sings the new key's dominant (V, V7, vii°) on it. Then **green**: it lands on the new tonic, root in the bass, as a cadence.
- **The dominant first is the point.** It's what makes a key change sound intended, and it's how Bach closes a phrase in a new key. Pressing the key you're already in is a cadence the same way, and pressing the blinking button again cancels the trip.

| Controls | |
|---|---|
| Grid keys | play the soprano; each key's four pads are its tension ladder, settled at the bottom to tense at the top |
| Right column | **destinations:** press a key to take the phrase there (amber keys, then green); your own key is a cadence |
| Top row | the piece's home key down a fifth · up a fifth · major/minor · new piece (back home) · latch · alto · tenor · bass on/off |
| N / L / C | new piece / latch / cadence in the key you're in |

**Recording into a DAW** (`choir/output.js`). The Output card has two menus:
- **Hear it on:** your headphones or speakers.
- **Also send to:** a copy of exactly Choir's sound on a second device, e.g. [BlackHole 2ch](https://github.com/ExistentialAudio/BlackHole) (`brew install --cask blackhole-2ch`).

Record that device's input in your DAW; the rest of the Mac keeps its own output. How it's wired: the organ gets a stand-in audio context whose `destination` is a bus, which feeds both `AudioContext.setSinkId` and an audio element's `setSinkId`. Needs Chrome 110 or later. Chrome names output devices only after the page has had microphone permission once; the page asks, then closes the microphone at once. The page has step-by-step Ableton instructions.

**Latch** is on by default: each chord rings until your next note, so you don't have to keep time. Turn it off to sound chords only while held. The side panel names each chord and its function, shows the four voices and the history (colored by function), and runs the engine's checker live.

**Measured** with `node tools/choir-eval.mjs 2000`, which feeds melodies in note by note, as a player would:

| Melodies | Chords | The choir's hard-rule breaks | Warnings per 100 chords | ms per note |
|---|---|---|---|---|
| Random walks over the keyboard, all 12 keys, major and minor | 71,152 | **0** | 50.9, of which 27.8 are "soprano out of range" and 12.1 "soprano-alto spacing" (the keyboard runs C4–E6, higher than Bach's soprano) | 0.06 median, 1.6 max |
| Sopranos of the engine's pieces 1–200, played live | 9,020 | **0** | 7.6 | 0.07 median |
| The same sopranos as the engine harmonizes them, planning each phrase | 9,020 | 0 | 3.3 | n/a |

- **Hard rules** are the checker's violations: parallel fifths and octaves, sevenths and leaps over an octave, and augmented seconds.
- **Not counted:** leaps in the melody itself, which are the player's. The random walks contain 367 of them, half as many as on the old diagonal layout, because minor now bends its 6th and 7th with the melody's direction.
- **The cost of no lookahead:** warnings roughly double compared with the engine's own harmonizations, and the bass matches the engine's on 37% of chords.

**Phrase endings, by register.** Same tool, 1,000 walks. At each phrase end, step to do from re or ti (choosing the amber one when the grid offers it), arm a cadence, and play do:

| do at | Endings | End the phrase | Close on I/i | Rule breaks | Non-cadential endings |
|---|---|---|---|---|---|
| C4–F♯4 | 3,031 | 99% | 87% | 0 | 0 |
| G4–B4 | 2,263 | 100% | 89% | 0 | 0 |
| C5–F5 | 2,766 | 100% | 86% | 0 | 0 |
| F♯5–B5 | 2,724 | 100% | 83% | 0 | 0 |
| C6–E6 | 1,187 | 99% | 84% | 0 | 0 |

The same check on the old keyboard (low do from G3) closed on I 38–59% of the time below G4. The approach colour matters: approached from a true dominant, a cadence on do closed on I 70% of the time; approached from red, 10%. That was measured on the old rules; it's why the grid suggests amber before home.

**The tension ladder.** Same tool, 500 melodies, a random rung on every note (17,714 chords): **0 rule breaks**. On average 3.9 of a key's four pads are different chords. 55% of notes span settled to tense; the rest are notes no tonic chord contains (re, fa, ti). In 11,984 cases the last chord wanted somewhere, and some key on the grid offered it in all of them.

**All four pads (the earlier version, figures and a second chord).** Same tool, 1,000 melodies with a random one of the four pads on every note (35,437 chords):

| | |
|---|---|
| Second chord taken | 8,510 times, **0 rule breaks** |
| Figure pad pressed | 8,747 times. A figure fitted 92% of the time: 2,943 suspensions, 2,187 anticipations, 1,332 neighbours, 1,305 passing notes, 249 bass passing notes. |
| Ornament-checker violations the figures added | **0**. That's the decorated surface checked against the same chords undecorated; the undecorated ones carry only the melody's own leaps. |

**Journeys between keys.** Same tool: 1,000 pieces, each opening at home and then changing key four times, to a random one of the other seven destinations. The simulated player follows the lights: the nearest lit key within a fourth, or a step toward the new do when none is lit.

| Destination | Trips | Arrive in 2 notes | Within 3 | Within 4 | Land on the new I |
|---|---|---|---|---|---|
| near (green) | 1,884 | 96% | 100% | 100% | 100% |
| middle (amber) | 1,240 | 98% | 99% | 100% | 100% |
| far (red) | 876 | 95% | 99% | 100% | 100% |

That's 32,007 chords with **0 rule breaks** and no last-resort chords. "100%" within four is rounded: one trip in roughly 500 takes up to six notes. Two findings shaped the design:

- **Arrivals were abrupt.** At first, green lit straight away, so the music jumped to the new tonic with no dominant in between, and half the arrivals were deceptive (vi). Making amber the way in, and green the tonic only, fixed both.
- **"Amber" first meant the choir *would* choose a dominant**, which held only 58% of the time. Now an amber key *guarantees* the dominant (any inversion the rules allow), and there's one within a fourth 96% of the time.

A key change can move the keyboard by up to most of an octave, since each key's low do sits between C4 and B4. About 1% of key changes left the melody out of reach, forcing a leap.

**Checker across keys.** The engine's checker assumes one key, and only two of its rules depend on it: a doubled leading tone, and the augmented second in minor. `Harmonizer.check()` reruns those two with each chord's own key. With no key change, its output matched the engine's on all 500 runs tested.

**Unisons.** The first search never puts neighbouring voices in unison; later stages pay a penalty for it instead. A unison is a trap: when the melody then leaps an octave, the voices that share a pitch move together into parallels. This removed the last rule breaks, all of which came after octave-plus leaps.

## Omen Life

The Game of Life on the 8×8 grid, wrapped into a torus. Every generation lasts four beats, and in that time the next generation shows itself as an *omen*:

- **red** pads are cells about to die;
- **amber** pads are cells about to be born.

The omen flickers on the off-beats and speeds up through the last beat, so you can see the turn coming and change it. Pressing a pad brings a cell to life or kills it, and the omen updates straight away.

**Sound.** Births play as plucks and deaths as low ghost tones. Each generation's changes play as a short phrase from the downbeat, with pitch rising rightward and upward (D dorian).

| Controls | |
|---|---|
| Grid pads | toggle cells |
| Top row | play · step · slower · faster · omen mode (flicker / steady / off) · auto-reseed · reseed (next seed No.) · clear |
| Right column | rule: Life, HighLife, Day & Night, Morley, 2×2, Maze, Diamoeba, Seeds |
| Space | play / pause |

**Starting it.** Click *Begin* once: browsers won't start audio from MIDI input alone. After that, everything can be played from the grid. The on-screen twin mirrors the grid and can be clicked, so the instrument also works without the hardware.

**Reseeding.** Seed No. *N* gives the same opening board for everyone. When the board stalls (empty, still, or looping for three generations), auto-reseed sprinkles in five cells, shown in yellow.

**How the omen is drawn.** IDEAS.md planned to use the Mini's hardware flash, which swaps buffers every 280 ms. That rate is fixed and can't follow the tempo, so instead the page swaps the Mini's two buffers itself, one message per swap. That lets the omen lock to the beat and speed up into the turn.

## The grid kit

```js
import { Grid } from './kit/grid.js';
import { C } from './kit/launchpad.js';

const grid = new Grid({ twin: document.querySelector('#twin'), labels: { top: [...], right: [...] } });
grid.on('press', e => ...);      // { index, kind: 'grid'|'right'|'top', x, y, source: 'hardware'|'twin', time }
grid.on('release', e => ...);    // ... plus heldMs (no velocity on this hardware; hold time is the expression)
await grid.connect();            // permission prompt; resolves to 'connected' | 'searching' | 'denied' | 'unsupported'

const f = grid.frame();          // 80 colour codes: 0–63 grid, 64–71 right column, 72–79 top row
f.grid(x, y, C.GREEN).top(0, C.AMBER).right(3, C.RED);
grid.show(f);                    // twin now; Mini as soon as allowed (diffed, double-buffered, max 120 fps)

await grid.scroll('hello', { speed: 7, colour: C.AMBER });   // resolves when the Mini says the text ended
```

| File | What it does |
|---|---|
| `launchpad.js` | The protocol. Pure, so it is unit-tested byte for byte against the manual. |
| `renderer.js` | Turns frames into MIDI messages. It sends only changed LEDs, as single-LED messages or one rapid update, and double-buffers so all changes appear at once. |
| `grid.js` | Web MIDI, hot-plug, events, scrolling text, and diagnostics (`identify()`, `measure()`). Pages pass the Mini between them over a `BroadcastChannel`: the one last connected, focused or clicked drives it, and the others show *standby* and ignore its buttons. This only works within one origin, so open every page from the same address (`127.0.0.1:8766`, not a mix with `localhost`). |
| `twin.js` | The on-screen grid. Colours come from the caller (`colour(code)`): the kit pages pass `look.js` (the hand-tuned LED look), and choir passes its tokens. |

**Colours.** `C` names the colours that read as distinct on this unit: `OFF`, `RED_DIM`, `RED`, `GREEN_DIM`, `GREEN`, `AMBER_DIM`, `AMBER`, `YELLOW`. `colour(red, green)` builds any of the 16 codes (each level 0–3).

**Kit bench.** `kit/index.html` has a button test (press all 80; each should light itself), the palette, a drawing mode, a scrolling-text box, device identity, a Web MIDI frame-rate measurement, and global brightness.

## Verification

Done on 2026-10-10:

- `npm test`: 22 tests pass.
  - The protocol bytes match the manual's own examples and the bytes captured from this unit.
  - All 80 buttons decode to distinct, correct indices.
  - The renderer's buffer swaps alternate `0x31`/`0x34` as the manual describes.
  - A glider crosses the 8×8 torus and returns after 32 generations.
- In the in-app Chromium browser, using the twin only:
  - Both pages render.
  - Generations advance on tempo: 2 in 5.0 s at 2.31 s each.
  - Real clicks toggle cells and change the omen mode, rule and tempo.
  - The omen colours match the board.
  - No console errors, after guarding `setPointerCapture`, which throws for pointers the browser isn't tracking.
- On the hardware, through CoreMIDI rather than the browser: identity, scrolling text, the palette and throughput (HARDWARE.md).

- In Chrome, through Web MIDI, on the hardware (run by Dash):
  - The button test read 80 / 80, with every button lighting itself.
  - Scrolling text and Identify worked.
  - Measure gave 200 full frames in 516 ms, about 388 frames/s, the same as CoreMIDI.

- Omen Life, played on the grid: very good to watch, but musically like wind chimes (see IDEAS.md). That led to Choir.
- Choir, in the in-app browser with the twin (organ running, MIDI denied):
  - G A B A G gave I V I V I with 0 rule breaks and 0 warnings.
  - The cadence button, key ±, mode, voice mutes, latch and the N/L shortcuts all work.
  - No console errors.

- Choir, first version, played on the Launchpad by Dash: "much closer and really fun".
  - Wrong colors and drift on the grid: the kit bench was open in another tab and was drawing over it. The page hand-over now prevents that. Tested with two tabs and a simulated Launchpad: the page that loses the device sends nothing and ignores input, and takes it back on focus.
  - Every chord came out a cadence because the button was held. Cadences are now one-shot.
  - The layout and the cadences were hard to learn. The keyboard and the "where it leads" lights are the response.

- Two-octave keyboard and the "where it leads" lights, played by Dash: "getting closer, this is really nice". They asked how to think about the colors, which led to three changes: low do now starts at C4 or above, iii counts as tension, and cadences are real phrase endings that wait for a key that can make one.

- Dash found the armed cadence button unintuitive and proposed keys on the right column, coloured by how smoothly you can reach them. That became the destinations above. It also measured that arming did matter: an armed ending was a root-position I 87% of the time, against 17% unarmed.

- Destinations, played by Dash: "extremely beautiful and fun… I love now moving between the different scales and hearing it sound dissonant and then somehow stepping back into key". But "it is just chords", and the four pads of a key all did the same thing. So each key's pads now give two chords and two figures.

- Four pads per key, played by Dash and others. The four jobs were confusing: the figure pad "bounced the sound", and the unlit pads weren't transparent. They also asked for crescendo and decrescendo; that's on hold. Their idea: choose to build or resolve tension, with clues about where to go. That's now the tension ladder.

**Not yet verified:** the tension ladder, played on the Launchpad.

## License

MIT, see [LICENSE](LICENSE). The vendored choral-counterpoint files are MIT too (`vendor/choral-counterpoint/LICENSE`).
