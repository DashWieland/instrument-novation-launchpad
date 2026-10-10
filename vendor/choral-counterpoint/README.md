# Vendored: choral-counterpoint

These files are copied from [DashWieland/choral-counterpoint](https://github.com/DashWieland/choral-counterpoint), `instrument/web/`, at commit `47ad95a7da7ead9b60e2252eef9517da10e56ee8` (2026-10-04). They are used here by `choir/`.

| File | What it is |
|---|---|
| `engine.js` | The chorale engine: oracle, voicings, checker, composer |
| `tables.js` | The tables mined from the Bach corpus |
| `log1p.js` | The engine's deterministic `log1p` |
| `audio.js` | The hurdy-gurdy's barrel organ |

**One change.** A single `export { … }` line is appended to `engine.js`. It exposes the internals the live harmonizer uses: `CHORDS`, `SCALES`, `PAIRS`, `oracleMoves`, `voicings`, `concretize`, `pairParallel` and `isChromatic`. Nothing else differs. `composePiece(1…300)` was checked identical to upstream on 2026-10-10.

**Updating.** Re-copy the four files from upstream, then re-append the export line.

License: MIT (see `LICENSE`).
