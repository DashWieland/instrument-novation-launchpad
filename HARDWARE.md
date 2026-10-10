# Launchpad Mini (original): hardware notes

This file records what we know about the unit on the desk, and how each fact was established, so instruments are designed for the hardware we actually have. Probed 2026-10-10 on macOS through CoreMIDI. The scripts are in `tools/midi-probe/`; run them with `swift tools/midi-probe/<name>.swift`.

**This is the original 2013 Launchpad Mini, not the Mini MK3.** It has bi-colour red/green LEDs, not RGB, and speaks the Launchpad S protocol. Facts written for the MK3 do not apply: RGB SysEx, flashing synced to MIDI clock, Programmer mode, note = row×10 + col, and the two ports named "LPMiniMK3 DAW" and "LPMiniMK3 MIDI".

Confidence tags: **[probed]** tested on this unit · **[manual]** from the [Launchpad S Programmer's Reference v1.02](https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/novation/downloads/4700/launchpad-s-prm.pdf), which the Mini shares · **[seen]** reported by eye · **[untested]**

## Identity

| | |
|---|---|
| USB | `1235:0036` "Launchpad Mini", Focusrite A.E. Ltd, 12 Mb/s **[probed]**. The MK3 is `1235:0113`. |
| MIDI ports | One source and one destination, both named `Launchpad Mini` **[probed]** |
| Device inquiry | `F0 7E 7F 06 01 F7` → `F0 7E 00 06 02 00 20 29 36 00 … F7`. Family code `36 00`; the Launchpad S is `20 00` **[probed]**. A second packet, `FF 00 00 00 03 02 F7`, arrived as well; it is probably firmware bytes and has not been decoded. |
| Driver | Class-compliant. No driver needed **[probed]**. |

## Buttons (X-Y layout, the power-on default)

All messages are on MIDI channel 1.

| Control | Message | |
|---|---|---|
| 8×8 grid | note `16·row + col` (row 0 is the top) | **[manual]** |
| Right column (8 round buttons) | note `16·row + 8` | **[manual]** |
| Top row (8 round buttons) | CC `104–111` | **[manual]** |
| Press / release | note-on, velocity 127 / velocity 0 | **[manual]** |

- **The buttons are binary.** There is no velocity and no aftertouch, so expression has to come from timing: hold length, press order and press shapes.
- `B0 00 02` switches to the drum-rack layout and `B0 00 01` switches back. X-Y is the layout to use for free-grid software.
- **[untested]** Whether a finger can slide across adjacent pads and press them in turn. The pads are small, firm buttons.

## LEDs

**Colour.** The velocity byte sets the colour: `16·green + red + flags`, where red and green each run 0–3. Use flags = 12 for normal writes; off is therefore 12 (`0x0C`) **[manual, probed]**.

**Usable palette [seen].** All 16 codes were shown on the grid, and roughly 6–7 are distinguishable:
- Red at full (3) mixed with any green looks like one orange.
- Off looks dark, with no tint.
- Design against: **off · dim red · red · dim green · green · amber · one yellow-green**, with blinking as an extra state.

The manual itself says to assume only red, amber and green are distinguishable.

**Other LED commands:**

| Command | Message | |
|---|---|---|
| Reset (all off, settings to default) | `B0 00 00` | **[probed]** |
| All LEDs amber (low to high) | `B0 00 7D` / `7E` / `7F` | **[manual]** |
| Light a top-row button | `B0 <104–111> <colour>` | **[probed]** |
| Global brightness | `B0 1E/1F <fraction>`; default 1/5, range 1/18 to 6/1 | **[manual]** |

Global brightness is a whole-grid fade. The manual mentions programs using it for fades and metronome pulses.

**Double buffering [manual].**
- `B0 00 31` and `B0 00 34` show one buffer while you write to the other. Alternating between the two swaps buffers, so every LED changes in a single message.
- `B0 00 28` is flash mode: the hardware swaps buffers every **280 ms**. That rate is fixed and is not synced to tempo.
- `B0 00 20` returns to simple mode.
- Velocity bits 2–3 select copy, clear or ignore for the hidden buffer.

**Rapid update [manual].**
- Note-ons on channel 3 (`92 …`) set two LEDs per message: grid row by row, then the right column, then the top row.
- The whole surface takes 40 messages.
- Any channel-1 message aborts it.

**Throughput [probed].** Measured 2026-10-10 with `tools/midi-probe/bench.swift`: 200 double-buffered frames, followed by a device inquiry. The Mini answers in order, so the reply time bounds how long it took to digest the frames. (On its own, the inquiry takes 2.6 ms round trip.)

| Method | Messages per frame | Result |
|---|---|---|
| Rapid update | 40 + swap | 200 frames in 0.52 s: **≈ 390 frames/s** (≈ 16,000 msgs/s) |
| One message per LED | 80 + swap | 200 frames in 1.02 s: **≈ 197 frames/s** (≈ 16,000 msgs/s) |

The limit is about 16,000 messages a second, whatever the message type, so throughput constrains nothing we're likely to build.

Through Chrome's Web MIDI, measured the same way with the kit bench's "Measure frame rate" button: 200 frames in 516 ms, **≈ 388 frames/s**. That matches CoreMIDI, so Web MIDI adds no measurable cost. The kit decides per frame whether to send changed LEDs one by one or the whole grid in one rapid update.

Caveat: these numbers measure how fast the Mini *accepts* messages, not that the LEDs visibly kept up.

## Scrolling text [probed]

- Message: `F0 00 20 29 09 <colour (+64 to loop)> <ASCII…> F7`. Bytes 1–7 inside the text set the speed, from 1 (slowest) to 7.
- Stop with `F0 00 20 29 09 00 F7`.
- Tested with "hi dash" in amber at speed 7. It finished after **5.16 s**, and the Mini then sent `B0 00 03`, so software can tell when a message ends.
- The LEDs return to their previous state afterwards.

## In the browser

- Web MIDI works in Chrome, Edge and Opera. Firefox 108+ needs a site-permission add-on. **Safari has none.**
- Since Chrome 124, *any* MIDI access triggers a permission prompt ([Chrome blog](https://developer.chrome.com/blog/web-midi-permission-prompt)).
- `{sysex: true}` is only needed for scrolling text and device inquiry. Every LED, layout and buffer command is a plain note or CC, so those work without SysEx.
- The page needs a secure context: `localhost` or HTTPS.
- **[untested]** Opening this port from Chrome on this machine.
- **[untested]** Whether the port can be shared while another app (Ableton, Novation Components) has it open.
