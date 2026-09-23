# Piano Trainer

A browser game for learning to play piano using your **computer keyboard** - songs
fall toward an on-screen piano, Guitar Hero-style, and you play along on your QWERTY
keys instead of a real piano or MIDI keyboard.

## Problem it solves

Learning a song on piano usually means either reading sheet music under real-time
pressure, or scrubbing a hands-cam video back and forth. Most people already have a
computer keyboard and can type without looking at their hands - this repurposes that
existing muscle memory (GarageBand's "Musical Typing" layout) so you can drill a
song's note sequence, rhythm, and hand independence immediately, with instant
feedback on what you got right or wrong, before ever sitting at a real instrument.

## Where this came from

A personal side project, built from scratch (not extracted from a production app,
unlike some of my other repos) - the app started with a single Listen-only mode and
grew a wait-for-correct-note practice mode, then real pass/fail scoring, a small
unlockable song library, and a pre-start countdown, each added and test-covered one
at a time. See `git log` for the actual build order.

## Try it

**[piano.hirad.dev](https://piano.hirad.dev)** - works in any modern desktop
browser, nothing to install. Click **Start Audio** first; browsers block sound
playback until you interact with the page.

## Architecture

```
src/
  midi/       .mid parsing (@tonejs/midi) -> internal Song/NoteEvent model,
              with a pitch-based left/right-hand heuristic
  audio/      PianoEngine - Tone.Sampler wrapping Salamander grand piano samples
  input/      KeyboardInput + keyboardMapping - QWERTY code -> MIDI note,
              octave shifting
  practice/   FallingNotesRenderer (canvas) + PracticeEngine (transport clock,
              the three playback modes, matching/grading logic)
  songs/      the bundled song library (hand-authored NoteEvent[] files)
  progress.ts localStorage-backed unlock progression, storage-injectable for
              testability
  shake.ts    small reusable CSS-animation-restart helper
  main.ts     wires all of the above to the DOM
tests/        Vitest suite - pure-logic modules only
```

`PracticeEngine` owns one source of truth for "song time" - a `performance.now()`
clock, not `Tone.Transport`, since sound is only one consumer (the renderer needs
the same clock). Each module has one job and doesn't reach into another's internals.

## Requirements

- Node.js 18+
- A modern desktop browser with Web Audio support (no mobile/touch support yet)

## Run it

```bash
git clone https://github.com/hirad121/piano-trainer.git
cd piano-trainer
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

```bash
npm run build       # production build to dist/ (also type-checks)
npm run preview     # serve that production build locally
npm run typecheck   # TypeScript check only, no build
npm test            # run the automated test suite once
npm run test:cov    # run tests with coverage
```

Deployed as a Cloudflare Worker (static assets, `wrangler.jsonc`) - `npm run deploy` builds and ships it, if you have your own Cloudflare account and adjust the `routes` domain in `wrangler.jsonc` to match.

## How to play

Your keyboard's home row is the piano's white keys, the row above is the black
keys - GarageBand's "Musical Typing" layout, so your fingers never leave their
normal touch-typing position:

```
Black keys:  W E   T Y U   O P
White keys:  A S D F G H J K L ; '
```

`A` is middle C (C4). **Z**/**X** (or the **←**/**→** arrow keys, or the on-screen
‹ › buttons) shift the whole mapping down or up an octave, so you can reach the full
keyboard without remapping your fingers.

### Modes

- **Listen** - the song plays itself; watch and listen, no grading.
- **Practice (wait for correct note)** - playback pauses at each note/chord until
  you press the right key(s). Good for learning a new song slowly, one note at a
  time, without needing to keep up. Can't structurally fail - it's rehearsal only.
- **Play only** - the song plays at a fixed tempo and you play along in real time,
  no waiting. This is the real test: every note is graded, including notes you miss
  entirely or press wrong. Clearing a song here with a good score is what unlocks
  the next one.

Switching modes mid-song rewinds to the start - each mode tracks its own
pacing/matching state, so resuming mid-song under a different mode wouldn't mean
anything.

### Scoring

Every note is graded as **good** (right key, right timing), **short**/**long**
(right key, held too briefly or too long), **miss** (Play mode only - never pressed
in time), or **wrong** (pressed a key that wasn't due). Clear a song in Play mode
with at least 90% good notes, at normal speed or faster, to unlock the next song in
the library.

### Songs

Six bundled songs, beginner to advanced. The default first song, "Runaway," is the
solo-piano intro to Kanye West's song of the same name, up to where the beat comes
in (transcribed from a real MIDI source - see `src/songs/runawayIntro.ts`). The
rest: Twinkle Twinkle, Mary Had a Little Lamb, Ode to Joy, a two-hand waltz, a fast
étude - unlocked in order. **Load MIDI** lets you load your own `.mid`/`.midi`
file - it plays immediately but doesn't join
the unlock progression.

## What this does and doesn't teach

- **Does teach:** note sequences, rhythm, timing, reading ahead, two-hand
  independence - what actually transfers to playing a real song.
- **Doesn't teach:** physical piano touch - fingering, hand shape, dynamics,
  pedaling. A flat computer key isn't a weighted piano key. Use this to learn a
  song's shape fast, then take it to a real piano or MIDI keyboard for technique.

## Privacy

Fully client-side - there is no server and nothing is ever sent over the network
except the static app files and the (public, unauthenticated) piano sample
download. Song-unlock progress is saved only in your own browser's `localStorage`
and never leaves your machine.

## For agents / automated contributors

- `practiceEngine.ts` is the core state machine (clock, mode dispatch, grading) -
  read it and its tests before changing playback/grading behavior.
- `PianoEngine` and `FallingNotesRenderer` are both faked with plain objects in
  `practiceEngine` tests, and `progress.ts` takes its `Storage` as an injectable
  parameter - none of the test suite needs a browser, jsdom, or a real AudioContext.
- Before proposing a change: `npm run typecheck && npm run build && npm test`.
- `FallingNotesRenderer` (canvas drawing) and `main.ts` (DOM wiring) have no
  automated tests yet - see [Gotchas](#gotchas).

## Testing

```bash
npm test
```

129 tests across 11 files (Vitest, `"node"` environment - no DOM/canvas/audio
polyfills needed, since the tested modules don't touch any of those directly).
Non-trivial logic (clock/finish handling, hold-duration grading, miss/wrong
detection, unlock progression) was mutation-tested by hand during development:
deliberately breaking the implementation and confirming the relevant test actually
fails, then restoring it - not just checking the suite passes once.

## Verified, not just claimed

- `npm run typecheck`, `npm run build`, and `npm test` all pass clean as of the
  current commit.
- What this does **not** claim: end-to-end verification in a real browser
  (audio playback, canvas rendering, keyboard-event timing) for the most recent
  rounds of changes - those are covered by the Vitest suite's logic-level tests
  and by hand-reasoning about the DOM-wiring code in `main.ts`, not by an actual
  browser session. `FallingNotesRenderer` and `main.ts` have zero automated
  coverage (see [Gotchas](#gotchas)) - treat any playback-feel or visual issue as
  plausible until you've tried it yourself.

## Gotchas

- **`FallingNotesRenderer` (canvas drawing) and `main.ts` (DOM wiring) have no
  automated tests.** Both would need jsdom or a real browser to cover
  meaningfully; changes there are currently verified by code review and manual
  play-testing, not CI.
- **Hand-split for MIDI import is a heuristic** (lower-average-pitch track = left
  hand; single-track files split at middle C) - it will guess wrong on unusual
  arrangements. No manual per-track override yet.
- **No early-hit grace window** - pressing a note before its own scheduled time is
  always "wrong" in Play mode, never anticipated as an early hit.
- **`npm audit` flags a moderate `esbuild` advisory** - it's a Vite dev-server-only
  dependency (not present in the production build), left as-is rather than
  force-upgrading Vite to a breaking major version.

## Roadmap / where to contribute

**Good first issues:**
- Web MIDI API support, so a real MIDI keyboard can drive input alongside/instead
  of QWERTY.
- A manual hand-override per track, for when the pitch heuristic guesses wrong.
- Basic automated coverage for `main.ts`'s DOM wiring (jsdom-based).

**Needs a design proposal first:**
- Onset-timing grading (how close to the beat a note was actually struck), beyond
  the current "did the right key eventually land in time" check.
- A user-facing "import and save to the library" flow, so Load MIDI songs can join
  the unlock progression instead of being session-only.
- Mobile/touch support.

## License

MIT - see [LICENSE](LICENSE).

## Author

[@hirad121](https://github.com/hirad121)
