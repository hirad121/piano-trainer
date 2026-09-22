import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoEngine } from '../src/audio/pianoEngine'
import type { Song } from '../src/midi/types'
import type { FallingNotesRenderer } from '../src/practice/fallingNotes'
import { PracticeEngine } from '../src/practice/practiceEngine'

// Two chords, one second apart: a C4 note, then a C4+E4 chord.
const song: Song = {
  name: 'wait mode test song',
  notes: [
    { midi: 60, time: 0.0, duration: 0.5, velocity: 0.8, hand: 'right' },
    { midi: 60, time: 1.0, duration: 0.5, velocity: 0.8, hand: 'right' },
    { midi: 64, time: 1.0, duration: 0.5, velocity: 0.8, hand: 'right' },
  ],
  durationSeconds: 1.5,
}

function makeFakePiano() {
  return { noteOn: vi.fn(), noteOff: vi.fn(), noteOnFor: vi.fn(), stopAll: vi.fn() }
}

function makeFakeRenderer() {
  return { render: vi.fn(), resize: vi.fn() }
}

function makeEngine() {
  const piano = makeFakePiano()
  const renderer = makeFakeRenderer()
  const engine = new PracticeEngine(
    piano as unknown as PianoEngine,
    renderer as unknown as FallingNotesRenderer,
  )
  engine.loadSong(song)
  engine.setMode('practice-wait')
  return { engine, piano, renderer }
}

describe('PracticeEngine practice-wait mode', () => {
  let now: number

  beforeEach(() => {
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not advance while the wrong key (or no key) is held', () => {
    const { engine } = makeEngine()

    engine.tick(new Set())
    expect(engine.currentTime()).toBe(0)

    engine.tick(new Set([62])) // D4, not the required C4
    expect(engine.currentTime()).toBe(0)
  })

  it('releases the clock (isPlaying) the instant the matching key is held, without waiting for the next tick', () => {
    const { engine } = makeEngine()

    engine.tick(new Set()) // establishes the wait-group for the first note
    engine.tick(new Set([60])) // holds the correct key

    expect(engine.isPlaying()).toBe(true)
  })

  it('advances currentTime smoothly in real time toward the next note, not as an instant jump', () => {
    const { engine } = makeEngine()

    engine.tick(new Set())
    engine.tick(new Set([60])) // matched at t=0, clock released toward the t=1.0 chord

    now += 300 // 0.3s of real time passes
    engine.tick(new Set([60])) // still holding - nothing new required yet
    expect(engine.currentTime()).toBeCloseTo(0.3) // clock has moved, not jumped to 1.0
    expect(engine.isPlaying()).toBe(true) // still running, hasn't reached the chord yet

    now += 700 // total 1.0s of real time - now at the chord's timestamp
    engine.tick(new Set([60])) // only one of the two chord notes held
    expect(engine.currentTime()).toBe(1.0) // arrived and froze exactly at the chord
    expect(engine.isPlaying()).toBe(false)
  })

  it('requires every note in a chord to be held before advancing past it', () => {
    const { engine } = makeEngine()

    engine.tick(new Set())
    engine.tick(new Set([60])) // matched at t=0
    now += 1000 // real time catches up to the t=1.0 chord
    engine.tick(new Set([60])) // arrives at and freezes on the chord; only one note held

    expect(engine.currentTime()).toBe(1.0) // still frozen at the chord
    expect(engine.isPlaying()).toBe(false)

    // 60 is carried over from the previous note (never released) - it's blocked
    // until released, so adding 64 on top of it must NOT match yet.
    engine.tick(new Set([60, 64]))
    expect(engine.isPlaying()).toBe(false)

    engine.tick(new Set([64])) // release 60
    engine.tick(new Set([60, 64])) // re-press 60 alongside 64
    expect(engine.isPlaying()).toBe(true) // chord matched, clock released
  })

  it('does not auto-sound notes the way listen mode does', () => {
    const { engine, piano } = makeEngine()

    engine.tick(new Set([60]))
    now += 1000
    engine.tick(new Set([60, 64]))

    expect(piano.noteOnFor).not.toHaveBeenCalled()
  })

  it('play() is a no-op while frozen waiting for a key - the clock must not drift without a real match', () => {
    const { engine } = makeEngine()

    engine.tick(new Set()) // freezes at the first note (t=0), waiting for a key
    expect(engine.isPlaying()).toBe(false)

    engine.play() // e.g. the transport Play button - must not start the clock
    expect(engine.isPlaying()).toBe(false)

    now += 500 // real time passes with no key ever pressed
    engine.tick(new Set()) // still no key held

    expect(engine.currentTime()).toBe(0) // must still be frozen at the first note, not drifted
    expect(engine.isPlaying()).toBe(false)
  })

  it('togglePlay() while frozen waiting for a key is also a no-op', () => {
    const { engine } = makeEngine()

    engine.tick(new Set())
    engine.togglePlay()

    expect(engine.isPlaying()).toBe(false)
    now += 500
    engine.tick(new Set())
    expect(engine.currentTime()).toBe(0)
  })
})

describe('PracticeEngine practice-wait mode: repeated-note re-attack', () => {
  // Two back-to-back notes at the SAME pitch - the exact "C then C again" case.
  const repeatedNoteSong: Song = {
    name: 'repeated note test song',
    notes: [
      { midi: 60, time: 0.0, duration: 0.5, velocity: 0.8, hand: 'right' },
      { midi: 60, time: 0.5, duration: 0.5, velocity: 0.8, hand: 'right' },
    ],
    durationSeconds: 1.0,
  }

  function makeRepeatedNoteEngine() {
    const piano = makeFakePiano()
    const renderer = makeFakeRenderer()
    const engine = new PracticeEngine(
      piano as unknown as PianoEngine,
      renderer as unknown as FallingNotesRenderer,
    )
    engine.loadSong(repeatedNoteSong)
    engine.setMode('practice-wait')
    return { engine, piano }
  }

  let now: number

  beforeEach(() => {
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('holding the key continuously through a repeated note does NOT satisfy the second occurrence', () => {
    const { engine } = makeRepeatedNoteEngine()

    engine.tick(new Set()) // freeze at note 1 (t=0)
    engine.tick(new Set([60])) // fresh press - matches, clock released toward note 2

    now += 500 // real time catches up to note 2 (t=0.5)
    engine.tick(new Set([60])) // arrives and freezes; 60 has been held the whole time

    expect(engine.currentTime()).toBe(0.5)
    expect(engine.isPlaying()).toBe(false) // must NOT have matched just by continuing to hold

    // Still holding, several more ticks later - still must not match.
    now += 200
    engine.tick(new Set([60]))
    expect(engine.currentTime()).toBe(0.5)
    expect(engine.isPlaying()).toBe(false)
  })

  it('releasing and re-pressing the held-over key matches the repeated note', () => {
    const { engine } = makeRepeatedNoteEngine()

    engine.tick(new Set())
    engine.tick(new Set([60]))
    now += 500
    engine.tick(new Set([60])) // frozen at note 2, 60 blocked (carried over)

    engine.tick(new Set()) // release
    expect(engine.isPlaying()).toBe(false)

    engine.tick(new Set([60])) // fresh press again
    expect(engine.isPlaying()).toBe(true) // now it counts
  })

  it('a key NOT carried over (freshly pressed for this note) is never blocked', () => {
    const { engine } = makeRepeatedNoteEngine()

    engine.tick(new Set()) // freeze at note 1 - nothing held yet
    engine.tick(new Set([60])) // fresh press for note 1 itself - must match immediately

    expect(engine.isPlaying()).toBe(true)
  })

  it('a key already held before the very first wait-group also requires release + re-press', () => {
    const { engine } = makeRepeatedNoteEngine()

    // 60 is already held (e.g. left over from before entering practice-wait
    // mode) at the moment the first wait-group is established.
    engine.tick(new Set([60]))
    expect(engine.isPlaying()).toBe(false) // must not match just because it happens to be held

    engine.tick(new Set()) // release
    engine.tick(new Set([60])) // fresh press
    expect(engine.isPlaying()).toBe(true)
  })
})
