import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoEngine } from '../src/audio/pianoEngine'
import type { Song } from '../src/midi/types'
import type { FallingNotesRenderer } from '../src/practice/fallingNotes'
import { PracticeEngine } from '../src/practice/practiceEngine'

// A solo note, then a two-note chord a second later - enough to exercise independent
// grading of simultaneous due notes as well as the solo case.
const song: Song = {
  name: 'play mode test song',
  notes: [
    { midi: 60, time: 0.5, duration: 0.5, velocity: 0.8, hand: 'right' }, // solo C4
    { midi: 62, time: 1.5, duration: 0.5, velocity: 0.8, hand: 'right' }, // chord: D4
    { midi: 64, time: 1.5, duration: 0.5, velocity: 0.8, hand: 'right' }, // chord: E4
  ],
  durationSeconds: 3.0,
}

function makeFakePiano() {
  return { noteOn: vi.fn(), noteOff: vi.fn(), noteOnFor: vi.fn(), stopAll: vi.fn() }
}

function makeFakeRenderer() {
  return { render: vi.fn(), resize: vi.fn() }
}

function makeEngine(testSong: Song = song) {
  const piano = makeFakePiano()
  const renderer = makeFakeRenderer()
  const engine = new PracticeEngine(piano as unknown as PianoEngine, renderer as unknown as FallingNotesRenderer)
  engine.loadSong(testSong)
  engine.setMode('play')
  engine.play() // Play mode's clock only runs once started, same as listen/free-play used to
  return { engine, piano, renderer }
}

describe('PracticeEngine play mode', () => {
  let now: number

  beforeEach(() => {
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('grades a correct in-window press exactly like practice-wait: hold-duration based', () => {
    const { engine } = makeEngine()

    now += 500 // clock reaches t=0.5 - the solo note becomes due
    engine.tick(new Set())
    engine.notePressed(60)

    now += 500 // held for exactly its 0.5s duration - "good"
    engine.noteReleased(60)

    const score = engine.getScore()
    expect(score.good).toBe(1)
    expect(score.totalNotes).toBe(1)
  })

  it('a due note whose deadline passes with no press becomes a miss and breaks the streak', () => {
    const { engine } = makeEngine()

    now += 500 // the solo note becomes due at t=0.5
    engine.tick(new Set())
    // never pressed

    now += 600 // 1.1s total - past the note's 0.5 + MISS_DEADLINE_SECONDS (0.5) deadline
    engine.tick(new Set())

    const score = engine.getScore()
    expect(score.miss).toBe(1)
    expect(score.totalNotes).toBe(1)
    expect(score.currentStreak).toBe(0)
  })

  it('a press for a pitch that is not currently due is recorded as wrong, not matched', () => {
    const { engine } = makeEngine()

    now += 500 // the solo note (60) is due; 62/64 are not due until t=1.5
    engine.tick(new Set())
    engine.notePressed(62) // wrong - not due yet

    expect(engine.getScore().wrong).toBe(1)
    expect(engine.getScore().totalNotes).toBe(0) // wrong is not a judgment of a specific note
  })

  it('a wrong press does not affect totalNotes but does break the current streak', () => {
    const { engine } = makeEngine()

    now += 500
    engine.tick(new Set())
    engine.notePressed(60)
    now += 500
    engine.noteReleased(60) // builds a streak of 1
    expect(engine.getScore().currentStreak).toBe(1)

    now += 1000 // t=1.5 - the chord is due
    engine.tick(new Set())
    engine.notePressed(99) // wrong pitch entirely

    const score = engine.getScore()
    expect(score.wrong).toBe(1)
    expect(score.currentStreak).toBe(0)
  })

  it('two simultaneous due notes (a chord) grade independently', () => {
    // A dedicated chord-only fixture - the shared `song`'s earlier solo note would
    // otherwise also become overdue (and silently miss) when jumping straight to t=1.5.
    const chordSong: Song = {
      name: 'chord test song',
      notes: [
        { midi: 62, time: 1.5, duration: 0.5, velocity: 0.8, hand: 'right' },
        { midi: 64, time: 1.5, duration: 0.5, velocity: 0.8, hand: 'right' },
      ],
      durationSeconds: 3.0,
    }
    const { engine } = makeEngine(chordSong)

    now += 1500 // both chord notes (62, 64) become due at t=1.5
    engine.tick(new Set())
    engine.notePressed(62)
    engine.notePressed(64)

    now += 500 // held exactly right - "good" for 62
    engine.noteReleased(62)
    now += 300 // 64 held 0.8s total from its press - past the 0.65s upper tolerance, "long"
    engine.noteReleased(64)

    const score = engine.getScore()
    expect(score.good).toBe(1)
    expect(score.long).toBe(1)
    expect(score.totalNotes).toBe(2)
  })

  it('pressing a pitch before its own scheduled time counts as wrong (no early-hit grace window)', () => {
    const { engine } = makeEngine()

    // Still before t=0.5 - the solo note hasn't become due yet.
    now += 200
    engine.tick(new Set())
    engine.notePressed(60)

    expect(engine.getScore().wrong).toBe(1)
    expect(engine.getScore().good).toBe(0)
  })

  it('a press while loaded but not yet playing (e.g. during a pre-start countdown) is not judged at all', () => {
    const piano = makeFakePiano()
    const renderer = makeFakeRenderer()
    const engine = new PracticeEngine(piano as unknown as PianoEngine, renderer as unknown as FallingNotesRenderer)
    engine.loadSong(song)
    engine.setMode('play')
    // deliberately not calling engine.play() - nothing should be "due" yet

    engine.notePressed(60)

    const score = engine.getScore()
    expect(score.wrong).toBe(0)
    expect(score.totalNotes).toBe(0)
  })

  it('a press while paused mid-song is also not judged', () => {
    const { engine } = makeEngine()

    now += 500 // solo note becomes due
    engine.tick(new Set())
    engine.pause()

    engine.notePressed(60)

    expect(engine.getScore().wrong).toBe(0)
  })

  it('auto-stops and clamps at the song duration, same as listen/practice-wait', () => {
    const { engine, piano } = makeEngine()

    now += 3000 // past the 3.0s duration
    engine.tick(new Set())

    expect(engine.isFinished()).toBe(true)
    expect(engine.currentTime()).toBe(3.0)
    expect(piano.stopAll).toHaveBeenCalledOnce()
  })
})

describe('PracticeEngine play mode: repeated-note behavior', () => {
  // Two same-pitch notes close together - closer than MISS_DEADLINE_SECONDS (0.5s), so
  // the second becomes due before the first note's grace window would have expired.
  const repeatedNoteSong: Song = {
    name: 'play mode repeated note test song',
    notes: [
      { midi: 60, time: 0.5, duration: 0.2, velocity: 0.8, hand: 'right' },
      { midi: 60, time: 0.7, duration: 0.2, velocity: 0.8, hand: 'right' },
    ],
    durationSeconds: 2.0,
  }

  function makeRepeatedNoteEngine() {
    const piano = makeFakePiano()
    const renderer = makeFakeRenderer()
    const engine = new PracticeEngine(piano as unknown as PianoEngine, renderer as unknown as FallingNotesRenderer)
    engine.loadSong(repeatedNoteSong)
    engine.setMode('play')
    engine.play()
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

  it('holding a key through two consecutive same-pitch due notes only matches the first - the second times out as a miss', () => {
    const { engine } = makeRepeatedNoteEngine()

    now += 500 // first note (t=0.5) becomes due
    engine.tick(new Set())
    engine.notePressed(60) // fresh press - matches the first note
    // key held continuously from here on, never released, never pressed again -
    // KeyboardInput would never fire a second onNoteOn for a held key in real usage.

    now += 200 // t=0.7 - the second same-pitch note becomes due while the first is
    // still an open match (not yet released)
    engine.tick(new Set())

    now += 600 // t=1.3 - past the second note's 0.7 + 0.5 deadline
    engine.tick(new Set())

    // Resolve the first note now, well after the second timed out.
    engine.noteReleased(60)

    const score = engine.getScore()
    expect(score.miss).toBe(1) // the second occurrence
    expect(score.totalNotes).toBe(2) // one hold-graded, one miss
  })

  it('a same-pitch note becoming due again before the previous instance was resolved judges the earlier one a miss first', () => {
    // Same song, but the key is never pressed at all - both instances become due,
    // the first is immediately displaced into a miss when the second arrives.
    const { engine } = makeRepeatedNoteEngine()

    now += 500 // first note due
    engine.tick(new Set())
    now += 200 // second note (t=0.7) becomes due before the first (deadline 1.0) has timed out
    engine.tick(new Set())

    expect(engine.getScore().miss).toBe(1) // the first instance, displaced immediately

    now += 600 // past the second instance's own deadline (0.7 + 0.5 = 1.2)
    engine.tick(new Set())

    expect(engine.getScore().miss).toBe(2)
    expect(engine.getScore().totalNotes).toBe(2)
  })
})
