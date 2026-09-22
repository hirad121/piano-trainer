import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { PianoEngine } from '../src/audio/pianoEngine'
import type { Song } from '../src/midi/types'
import type { FallingNotesRenderer } from '../src/practice/fallingNotes'
import { PracticeEngine } from '../src/practice/practiceEngine'

// Three notes back to back, each 0.5s, so we can drive several matches in a row.
const song: Song = {
  name: 'score test song',
  notes: [
    { midi: 60, time: 0.0, duration: 0.5, velocity: 0.8, hand: 'right' },
    { midi: 62, time: 0.5, duration: 0.5, velocity: 0.8, hand: 'right' },
    { midi: 64, time: 1.0, duration: 0.5, velocity: 0.8, hand: 'right' },
  ],
  durationSeconds: 10.0, // long tail so the clock never auto-finishes mid-test
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

/** Matches the given midi (freezes at it, then holds it) without releasing. */
function matchNote(engine: PracticeEngine, midi: number): void {
  engine.tick(new Set())
  engine.tick(new Set([midi]))
}

describe('PracticeEngine score tracking', () => {
  let now: number

  beforeEach(() => {
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts at all zeros', () => {
    const { engine } = makeEngine()
    expect(engine.getScore()).toEqual({
      totalNotes: 0,
      good: 0,
      short: 0,
      long: 0,
      miss: 0,
      wrong: 0,
      currentStreak: 0,
      bestStreak: 0,
    })
  })

  it('tallies a good hold and builds a streak', () => {
    const { engine } = makeEngine()

    matchNote(engine, 60)
    now += 500 // exact duration - "good"
    engine.noteReleased(60)

    const score = engine.getScore()
    expect(score.totalNotes).toBe(1)
    expect(score.good).toBe(1)
    expect(score.currentStreak).toBe(1)
    expect(score.bestStreak).toBe(1)
  })

  it('a short/long hold resets the current streak but keeps the best', () => {
    const { engine } = makeEngine()

    matchNote(engine, 60)
    now += 500 // good
    engine.noteReleased(60)

    // release the next required key so the following note can be freshly struck
    engine.tick(new Set())
    matchNote(engine, 62)
    now += 100 // way under 0.5s - "short"
    engine.noteReleased(62)

    const score = engine.getScore()
    expect(score.totalNotes).toBe(2)
    expect(score.good).toBe(1)
    expect(score.short).toBe(1)
    expect(score.currentStreak).toBe(0) // broken by the short hold
    expect(score.bestStreak).toBe(1) // still remembers the earlier good streak
  })

  it('two goods in a row push the streak past the previous best', () => {
    const { engine } = makeEngine()

    matchNote(engine, 60)
    now += 500
    engine.noteReleased(60)

    engine.tick(new Set())
    matchNote(engine, 62)
    now += 500
    engine.noteReleased(62)

    const score = engine.getScore()
    expect(score.currentStreak).toBe(2)
    expect(score.bestStreak).toBe(2)
  })

  it('getScore() returns a snapshot, not a live reference', () => {
    const { engine } = makeEngine()
    const before = engine.getScore()

    matchNote(engine, 60)
    now += 500
    engine.noteReleased(60)

    expect(before.totalNotes).toBe(0) // the earlier snapshot must be untouched
    expect(engine.getScore().totalNotes).toBe(1)
  })

  it('reset() clears the score back to zero', () => {
    const { engine } = makeEngine()

    matchNote(engine, 60)
    now += 500
    engine.noteReleased(60)
    expect(engine.getScore().totalNotes).toBe(1)

    engine.reset()
    expect(engine.getScore()).toEqual({
      totalNotes: 0,
      good: 0,
      short: 0,
      long: 0,
      miss: 0,
      wrong: 0,
      currentStreak: 0,
      bestStreak: 0,
    })
  })

  it('loadSong() clears the score back to zero', () => {
    const { engine } = makeEngine()

    matchNote(engine, 60)
    now += 500
    engine.noteReleased(60)
    expect(engine.getScore().totalNotes).toBe(1)

    engine.loadSong({ ...song })
    expect(engine.getScore().totalNotes).toBe(0)
  })

  it('releasing a key that was never matched does not affect the score', () => {
    const { engine } = makeEngine()

    engine.noteReleased(72) // never held, never matched
    expect(engine.getScore().totalNotes).toBe(0)
  })

  describe('notePressed() in practice-wait mode', () => {
    it('a press that is not part of the current wait group is recorded as wrong', () => {
      const { engine } = makeEngine()
      engine.tick(new Set()) // establishes the wait group for midi 60 at t=0

      engine.notePressed(99)

      expect(engine.getScore().wrong).toBe(1)
      expect(engine.getScore().totalNotes).toBe(0) // wrong is not a judgment of a specific note
    })

    it('a wrong press does not disturb the still-pending correct match', () => {
      const { engine } = makeEngine()
      engine.tick(new Set())
      engine.notePressed(99) // wrong, held alongside the correct key below

      engine.tick(new Set([99, 60])) // correct key now also held
      now += 500 // exact duration - "good"
      engine.noteReleased(60)

      const score = engine.getScore()
      expect(score.wrong).toBe(1)
      expect(score.good).toBe(1)
    })

    it('pressing the actually-required key is never recorded as wrong', () => {
      const { engine } = makeEngine()
      engine.tick(new Set())

      engine.notePressed(60) // the correct, currently-required key

      expect(engine.getScore().wrong).toBe(0)
    })

    it('does not false-positive before any wait group has been established', () => {
      const { engine } = makeEngine()
      // no tick() yet - waitGroup is still empty

      engine.notePressed(60)

      expect(engine.getScore().wrong).toBe(0)
    })

    it('a wrong press breaks the current streak but keeps the best', () => {
      const { engine } = makeEngine()
      matchNote(engine, 60)
      now += 500
      engine.noteReleased(60) // builds a streak of 1
      expect(engine.getScore().currentStreak).toBe(1)

      engine.tick(new Set())
      engine.notePressed(99) // wrong

      const score = engine.getScore()
      expect(score.currentStreak).toBe(0)
      expect(score.bestStreak).toBe(1)
    })
  })
})
