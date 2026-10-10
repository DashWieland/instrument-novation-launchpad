# Launchpad Mini instruments: ideas

**Goal:** a browser instrument (Web MIDI, Chrome) whose main surface is the Launchpad grid and that can be played from the grid alone.

Written 2026-10-10. Inputs:
- a survey of grid-controller instruments (see Sources);
- probes of this unit (`HARDWARE.md`);
- a skim of `choral-counterpoint`, `pdharness`, `pdbuild`, `py2pd`, `pdverify`, `symphonia`, tend and Cast & Wrap.

## Takeaways

1. **Treat the Mini as a two-layer display, not a weak RGB grid.** It has a red layer and a green layer, each with 4 levels; where they overlap you see amber. The strongest ideas below give each layer its own meaning: two players, now and next, idiomatic and forbidden, otonal and utonal. This shaped the picks more than anything else. *(Inference from the hardware. The palette was checked by eye once.)*
2. **Expression has to come from timing and shape, because the pads are on/off.** Hold length, press order, sweep speed and chord shapes are the expressive tools. The monome repertoire (mlr, kria, meadowphysics, earthsea) is built entirely on unweighted keys. The `midigrid` library already runs it on Launchpads, original Mini included, so that body of design carries over. *(Survey, verified.)*
3. **Open ground, as far as the survey covered:**
   - The survey found **no browser instrument where several physical Launchpads share one grid over a network**.
   - It found **no rain or gravity sequencer** beyond Tenori-on's Bounce mode and the norns bouncers.
   - Lighting the grid by what a rule checker thinks of each move isn't something I saw anywhere, but I didn't search for it specifically. *(The survey did not search Reddit.)*
4. **Suggested order:** a small grid kit, then **Omen Life** as a one-day hardware test, then **Traffic-Light Counterpoint** as the first serious instrument. The reasoning is in [Recommendation](#recommendation).

## Hardware features to design with

| Feature | What it buys |
|---|---|
| Red and green layers, 4 levels each | Two overlaid meanings; amber marks where they agree |
| 4 brightness levels | A quantity per pad: depth, age, probability, recency |
| Hardware flash (buffer swap every 280 ms) | Show two whole-grid states at once with no CPU work, e.g. *now* against *next* |
| Global brightness | Whole-grid breath, a day/night cycle, a metronome pulse |
| Built-in scrolling text, with a done signal | The instrument can speak: a piece number, a chord name, a rule it just broke |
| 16 round buttons | Modifiers and modes; kria's bottom-row trick, moved to the edges |
| 28-pad outer ring | A circular strip: crank, dial or clock face |

---

## The ideas

Each idea gives the mechanic, the sound, why it suits this grid, what it builds on, and the open question that decides whether it's good.

### Family 1: Rule systems you can see

#### 1. Traffic-Light Counterpoint
You write a chorale one chord at a time on the grid, and the grid shows the rule system's opinion of every possible next note before you press:
- **green**: Bach does this often (corpus oracle);
- **amber**: legal but rare;
- **red**: breaks a hard rule (parallel fifths or octaves, a leading tone left unresolved).

Red pads still play. When you press one, the broken rule scrolls across the grid in text. The right column picks the voice (S/A/T/B); the top row holds undo, play phrase, cadence and "let the engine finish".

- **Sound.** The hurdy-gurdy's WebAudio organ (`Organ` in `audio.js`).
- **Fit.** The Mini's palette really is a traffic light, and "good is checkable" is the premise of `choral-counterpoint`. The grid becomes a map of legal moves, like move hints in chess.
- **Builds on.** `choral-counterpoint/instrument/web/engine.js` exports `checkChorale(v, tonicPc, mode, fermatas)`, which runs on any four voice arrays. `oracleMoves` and `legalMotion` are internal and would need exporting. *(Checked 2026-10-10.)*
- **Effort.** Medium.
- **Open question.** Is choosing chords one at a time play or homework? A possible fix is a veto mode: the engine proposes and you only override.
- **Pitch layout.** Not decided. In-key rows a third or fourth apart are the first guess.

**Dropped after discussion, 2026-10-10.** Lighting the grid with the rules' verdict fails both ways. Played fast, it tells you that you were wrong with no time to find what's right. Played slow, it becomes a hunt for green pads. Either way, the player is the one serving the rules.

#### 1b. Choir *(built: `choir/`)*
The reversal: the rules serve the player. You play the melody freely, in any rhythm, and nothing moves until you press. Bach's oracle and the engine's voice-leading laws harmonize each note the moment it is played, with no lookahead. The grid shows the harmony (the chord's tones), not a verdict. A held round button marks a cadence.

Measured: 0 hard-rule breaks in 80,172 chords played live, and 0.04 ms per note (README).

#### 2. Babel Grid
The 64 pads are the bits of an address. Toggling pads changes the piece number, the deterministic engine plays piece No. *N*, and the hardware scroller shows *N*.
- **Fit.** Numbered, deterministic infinity: "No. *N* is the same for everyone", and `mcv-lang`.
- **Effort.** Low. It is a good first exercise for the kit's scrolling text.
- **Open question.** With hashed seeds, a one-bit change yields an unrelated piece, so the grid is a lottery ticket. It becomes an instrument only if bits mean something (bit groups set key, mode, density and melody contour), so that neighbouring patterns sound related.

### Family 2: Mechanisms

#### 3. Perimeter Crank
The 28 outer pads form a ring, and tapping or rolling around it turns a crank: successive presses give speed and direction. The inner 6×6 shows the barrel's pins passing under the playhead.
- **Builds on.** The hurdy-gurdy's master clock is tape position, and it already plays both forwards and backwards. Whether `machine.js` can be split from its DOM drawing is untested; I only read its header.
- **Fit.** It turns binary pads into continuous control, which the survey found no one else doing. If it feels good, the ring is a reusable input for every other idea.
- **Effort.** Low to medium.
- **Open question.** Can the Mini's firm buttons be rolled across, or only tapped? This needs a quick feel test before anything else.

#### 4. Cistern
Drops fall from the top row. You press pads to place ledges; water pools behind them, with green brightness showing depth. When a pool overflows it spills down a level.
- **Sound.** Drips are plucks. Each pool is a resonator whose pitch follows its depth.
- **Fit.** It fills the survey's gravity gap, and 4 brightness levels map directly to depth. It is a natural candidate for the Pd/pd4web route (the tend stack, verified with `pdverify`).
- **Effort.** Medium.
- **Open question.** Does the system settle into something you can steer, or just drain away?

#### 5. Cast & Wrap, stage 5
The pads place stones; hold length sets stone size. The band appears as a shrinking ring of lit pads, contacts flash, and the round buttons pick the read mode and the scan.
- **Fit.** Cast & Wrap's README lists hardware controllers as unbuilt. The grid kit from this repo would plug in.
- **Caveat.** 8×8 is too coarse to draw the band, so the LEDs show events and the screen stays the main display.
- **Effort.** Low, since the engine exists. It belongs in that repo rather than this one.

### Family 3: Life and time

#### 6. Omen Life *(built: `omen-life/`)*
Game of Life, using the hardware's two buffers: buffer 0 holds *now* and buffer 1 holds *next*. In flash mode the Mini alternates them every 280 ms on its own, so cells about to be born or die blink. *As built, the page swaps the buffers itself, so the flicker follows the tempo and speeds up into each turn; see the README.*

**Played 2026-10-10.** Very good to watch, and the rules give recognisably different trajectories. Musically it sounds like wind chimes:
- Life decides which pitches sound, through each cell's position, and Life scrambles positions. The scale is fine; the result has no line, no repetition and no harmony.
- Toggling a cell has consequences you can't hear coming, so the player's choices barely register.

Lesson for the rest of this list: let the emergent process decide *when*, and let a musical grammar or the player decide *what*. Between ticks you intervene: revive a cell, kill one. That is Live Intervention's puzzle loop, but played.
- **Sound.** Births are green notes and deaths are red notes. Expensive Notes sends births and deaths to different synths, and zellen's "ghost" mode sounds the dying cells.
- **Fit.** It uses a hardware feature the MK3 doesn't have, and the name nods to Cast & Wrap's *omen* reading.
- **Effort.** Low, about a day once the kit exists.
- **Open question.** Life on an 8×8 grid stalls quickly, which the survey also reports. Wrapped edges and slow automatic reseeding would help.

#### 7. Garden
A slow instrument about holding. Hold a pad to water it:
- a plant grows through the green levels, flowers amber, and wilts red if neglected;
- each plant is a drone voice whose timbre changes with age;
- global brightness runs a day/night cycle, and some growth happens only at night.
- **Fit.** It makes hold length the main expressive dimension, and global brightness gives a whole-grid rhythm at no cost.
- **Effort.** Medium.
- **Open question.** Can a drone ensemble reached only through holding stay interesting for more than five minutes?

### Family 4: Two people, two colours

#### 8. Two Grids
Two Launchpads in different places share one 8×8 field. You are green and they are red; a pad you have both pressed is amber; brightness fades with how recently it was pressed. Each person hears the other's presses in a different timbre, so it works as call and response.
- **Transport.** WebRTC (JZZ-midi-RTC) or a tiny WebSocket relay; Keyboardia uses a Cloudflare Durable Object.
- **Fit.** The bi-colour hardware gives each player a whole LED layer. It is the open space the survey found, and it echoes the 52-hertz whale essay: calling out and being heard.
- **Effort.** Medium to high: networking and latency.
- **Open question.** It needs a second person with a grid. An on-screen twin could let a friend without hardware join.

#### 9. Tonality Diamond
Rotate the grid 45° into a just-intonation diamond, after Daniel Corral's Launchpad pieces. Green marks otonal rows, red utonal rows, and amber the 1/1 diagonal, so the two LED layers show harmonic polarity.
- **Effort.** Low: a layout plus a synth.
- **Open question.** An 8×8 diamond gives about an 8-limit lattice. Is that enough harmonic room?

### Considered and set aside

| Idea | Why set aside |
|---|---|
| A plain clip launcher | Novation Intro already does it |
| Spectrum visualiser | Display only, not an instrument |
| Webcam to grid | The grid becomes output only |
| Snake or Tetris as games | Fun, but not instruments. Pit Orchisstra's snake-as-sequencer is the musical version if it's wanted later. |

---

## Recommendation

**0. Grid kit first (about half a day).** One ES module that:
- opens the port and handles hot-plug;
- maps X-Y to `(x, y)`;
- keeps a double-buffered frame sent through rapid update;
- has named colours for the 6–7 usable states;
- provides `scroll(text)` with its done signal;
- includes an on-screen twin, so instruments can be built and screenshotted without the hardware.

Done means: all 80 buttons report the right `(x, y)` from both hardware and twin, and we have a measured full-frame rate on this unit.

**1. Omen Life (about a day).** It's cheap, it exercises double buffering and flash mode, and it shows quickly whether hardware tricks feel good or gimmicky.

**2. Traffic-Light Counterpoint (the first serious one).** It fits your work best: it reuses a verified engine and gives the palette a meaning instead of decoration. It is riskier than 1 because of the homework question, which is why it comes second.

**After that:** Perimeter Crank, if the feel test passes, because the ring would improve every other idea. Two Grids, when there's a second person to play with.

**Limits of this list.**
- None of these has been prototyped.
- The "no prior art" claims cover only what the survey searched.
- The usable palette rests on one look.
- Grid throughput is unmeasured. It matters for Cistern and Omen Life, and not much for the others.

## Sources

**Hardware**
- Launchpad S Programmer's Reference (the protocol): https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/novation/downloads/4700/launchpad-s-prm.pdf
- Chrome Web MIDI permission change: https://developer.chrome.com/blog/web-midi-permission-prompt

**Monome and grid instruments**
- Monome grid apps: https://monome.org/docs/ansible/kria · https://monome.org/docs/ansible/meadowphysics · https://monome.org/docs/earthsea · https://monome.org/docs/grid/app/terms
- midigrid (Launchpad as monome): https://github.com/miker2049/midigrid
- Bouncers and life: https://norns.community/corners · https://norns.community/rebound · https://norns.community/zellen · https://norns.community/pit-orchisstra · https://norns.community/animator
- Live Intervention (Life as a puzzle): https://mx7f.itch.io/live-intervention-proof-of-concept
- Expensive Notes (Life births and deaths to two synths): https://forum.core-electronics.com.au/t/teensy-controlled-launchpad-uses-conway-s-game-of-life-to-generate-notes/12729
- Daniel Corral, *Polytope*: https://xenharmonikon.org/2022/01/04/polytope

**Web and multiplayer**
- Keyboardia (multiplayer step sequencer): https://garden.cloudflare.dev/keyboardia
- JZZ (MIDI over WebRTC): https://github.com/jazz-soft/JZZ
- launchpad-webmidi (targets the legacy red/green protocol, so it fits this unit): https://github.com/mrl808/launchpad-webmidi
- TacTile 64 jam (browser games for 8×8 grids): https://itch.io/jam/tactile-64
