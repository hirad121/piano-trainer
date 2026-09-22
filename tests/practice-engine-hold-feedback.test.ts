import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoEngine } from '../src/audio/pianoEngine'
import type { Song } from '../src/midi/types'
import type { FallingNotesRenderer } from '../src/practice/fallingNotes'
import type { ReleaseFeedback } from '../src/practice/practiceEngine'
import { PracticeEngine } from '../src/practice/practiceEngine'

// A single note of a known, easy-to-reason-about duration.
const song: Song = {
  name: 'hold feedback test song',
  notes: [{ midi: 60, time: 0.0, duration: 0.5, velocity: 0.8, hand: 'right' }],
  durationSeconds: 5.0, // long tail so the clock never auto-finishes mid-test
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

/** Pulls the releaseFeedback map (render()'s 6th argument) from the fake renderer's last call. */
function lastFeedback(renderer: ReturnType<typeof makeFakeRenderer>): ReadonlyMap<number, ReleaseFeedback> {
  const calls = renderer.render.mock.calls
  return calls[calls.length - 1][5] as ReadonlyMap<number, ReleaseFeedback>
}

describe('PracticeEngine hold-duration feedback', () => {
  let now: number

  beforeEach(() => {
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('grades a hold within tolerance of the note duration as "good"', () => {
    const { engine, renderer } = makeEngine()

    engine.tick(new Set()) // freeze at the note
    engine.tick(new Set([60])) // match - starts timing (duration 0.5)

    now += 500 // held for exactly the written duration
    engine.noteReleased(60)
    engine.tick(new Set())

    expect(lastFeedback(renderer).get(60)?.classification).toBe('good')
  })

  it('grades a release well under the note duration as "short"', () => {
    const { engine, renderer } = makeEngine()

    engine.tick(new Set())
    engine.tick(new Set([60]))

    now += 100 // released far before the 0.5s duration
    engine.noteReleased(60)
    engine.tick(new Set())

    expect(lastFeedback(renderer).get(60)?.classification).toBe('short')
  })

  it('grades a hold well past the note duration as "long"', () => {
    const { engine, renderer } = makeEngine()

    engine.tick(new Set())
    engine.tick(new Set([60]))

    now += 1200 // held far longer than the 0.5s duration
    engine.noteReleased(60)
    engine.tick(new Set())

    expect(lastFeedback(renderer).get(60)?.classification).toBe('long')
  })

  it('the tolerance window is ±30% of the note duration (min 80ms)', () => {
    // duration 0.5, ratio 0.3 => tolerance 0.15 => good range is [0.35, 0.65]
    const { engine, renderer } = makeEngine()

    engine.tick(new Set())
    engine.tick(new Set([60]))
    now += 350 // exactly at the lower edge - still "good"
    engine.noteReleased(60)
    engine.tick(new Set())
    expect(lastFeedback(renderer).get(60)?.classification).toBe('good')
  })

  it('just outside the tolerance window is graded as short/long, not good', () => {
    const { engine, renderer } = makeEngine()

    engine.tick(new Set())
    engine.tick(new Set([60]))
    now += 340 // just under the 350ms lower edge
    engine.noteReleased(60)
    engine.tick(new Set())
    expect(lastFeedback(renderer).get(60)?.classification).toBe('short')
  })

  it('grades against real-time (speed-adjusted) duration, not the note\'s written duration', () => {
    // At 0.5x speed, a note written as 0.5s actually needs ~1s of real held
    // time to be "correct" - the clock (and the falling note) move at half
    // rate, so the tolerance window must scale the same way.
    const { engine, renderer } = makeEngine()
    engine.setSpeed(0.5)

    engine.tick(new Set())
    engine.tick(new Set([60]))
    now += 1000 // "correct" length at 0.5x speed for a 0.5s note
    engine.noteReleased(60)
    engine.tick(new Set())

    expect(lastFeedback(renderer).get(60)?.classification).toBe('good')
  })

  it('grades against real-time (speed-adjusted) duration at faster-than-1x speed too', () => {
    // At 2x speed, a 0.5s note only needs ~0.25s of real held time.
    const { engine, renderer } = makeEngine()
    engine.setSpeed(2)

    engine.tick(new Set())
    engine.tick(new Set([60]))
    now += 250
    engine.noteReleased(60)
    engine.tick(new Set())

    expect(lastFeedback(renderer).get(60)?.classification).toBe('good')
  })

  it('releasing a key that was never matched is a no-op (no feedback recorded)', () => {
    const { engine, renderer } = makeEngine()

    expect(() => engine.noteReleased(72)).not.toThrow() // never held, never matched
    engine.tick(new Set())

    expect(lastFeedback(renderer).has(72)).toBe(false)
  })

  it('feedback is pruned from the map after it ages out', () => {
    const { engine, renderer } = makeEngine()

    engine.tick(new Set())
    engine.tick(new Set([60]))
    now += 500
    engine.noteReleased(60)
    engine.tick(new Set())
    expect(lastFeedback(renderer).has(60)).toBe(true)

    now += 2000 // well past the 1500ms prune threshold
    engine.tick(new Set())
    expect(lastFeedback(renderer).has(60)).toBe(false)
  })

  it('loading a new song clears in-flight matches and past feedback', () => {
    const { engine, renderer } = makeEngine()

    engine.tick(new Set())
    engine.tick(new Set([60])) // matched, now being timed (not yet released)

    engine.loadSong({ ...song, notes: [{ ...song.notes[0], time: 0 }] })

    // The key is still physically held from before the reload; releasing it
    // now must not produce feedback, since the in-flight match was cleared.
    engine.noteReleased(60)
    engine.tick(new Set())
    expect(lastFeedback(renderer).has(60)).toBe(false)
  })
})
