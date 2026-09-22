import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoEngine } from '../src/audio/pianoEngine'
import type { Song } from '../src/midi/types'
import type { FallingNotesRenderer } from '../src/practice/fallingNotes'
import { PracticeEngine } from '../src/practice/practiceEngine'

// One note ending at 0.5s, but the song's declared duration runs on to 0.8s -
// exercises the "let the tail ring past the last note" case, not just the
// exact-note-end case.
const song: Song = {
  name: 'finish test song',
  notes: [{ midi: 60, time: 0.0, duration: 0.5, velocity: 0.8, hand: 'right' }],
  durationSeconds: 0.8,
}

function makeFakePiano() {
  return { noteOn: vi.fn(), noteOff: vi.fn(), noteOnFor: vi.fn(), stopAll: vi.fn() }
}

function makeFakeRenderer() {
  return { render: vi.fn(), resize: vi.fn() }
}

function makeEngine(onStateChange?: (s: { currentTime: number; playing: boolean; finished: boolean }) => void) {
  const piano = makeFakePiano()
  const renderer = makeFakeRenderer()
  const engine = new PracticeEngine(
    piano as unknown as PianoEngine,
    renderer as unknown as FallingNotesRenderer,
    onStateChange,
  )
  engine.loadSong(song)
  return { engine, piano, renderer }
}

describe('PracticeEngine finishing and reset', () => {
  let now: number

  beforeEach(() => {
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is not finished before playback starts, or while mid-song', () => {
    const { engine } = makeEngine()
    expect(engine.isFinished()).toBe(false)

    engine.setMode('listen')
    engine.play()
    now += 200 // 0.2s < 0.8s duration
    engine.tick(new Set())

    expect(engine.isFinished()).toBe(false)
    expect(engine.isPlaying()).toBe(true)
  })

  it('listen mode: auto-stops exactly at the song duration and reports finished', () => {
    const { engine, piano } = makeEngine()
    engine.setMode('listen')
    engine.play()

    now += 800 // exactly the song's duration
    engine.tick(new Set())

    expect(engine.isFinished()).toBe(true)
    expect(engine.isPlaying()).toBe(false)
    expect(engine.currentTime()).toBe(0.8)
    expect(piano.stopAll).toHaveBeenCalledOnce()
  })

  it('listen mode: clamps currentTime at duration and never overshoots, even with more elapsed time', () => {
    const { engine } = makeEngine()
    engine.setMode('listen')
    engine.play()

    now += 5000 // way past the end
    engine.tick(new Set())
    expect(engine.currentTime()).toBe(0.8)

    now += 5000 // more time passes after finishing
    engine.tick(new Set())
    expect(engine.currentTime()).toBe(0.8) // still clamped, not playing, doesn't drift
  })

  it('play mode: also auto-stops at the end (same clamp logic as listen, via its own tickPlayMode)', () => {
    const { engine, piano } = makeEngine()
    engine.setMode('play')
    engine.play()

    now += 800
    engine.tick(new Set())

    expect(engine.isFinished()).toBe(true)
    expect(engine.isPlaying()).toBe(false)
    expect(piano.stopAll).toHaveBeenCalledOnce()
  })

  it('practice-wait mode: finishes after the last note is matched and the clock catches up to duration', () => {
    const { engine, piano } = makeEngine()
    engine.setMode('practice-wait')

    engine.tick(new Set()) // freezes at the only note (t=0)
    expect(engine.isFinished()).toBe(false)

    engine.tick(new Set([60])) // matched - clock released, no more notes to freeze at
    expect(engine.isFinished()).toBe(false) // hasn't reached the duration tail yet

    now += 800 // real time catches the clock up past the song's duration
    engine.tick(new Set([60]))

    expect(engine.isFinished()).toBe(true)
    expect(engine.isPlaying()).toBe(false)
    expect(engine.currentTime()).toBe(0.8)
    expect(piano.stopAll).toHaveBeenCalledOnce()
  })

  it('onStateChange reports finished:true exactly at the transition, not before', () => {
    const states: boolean[] = []
    const { engine } = makeEngine((s) => states.push(s.finished))
    engine.setMode('listen')
    engine.play()

    now += 400
    engine.tick(new Set())
    now += 400
    engine.tick(new Set())

    expect(states).toEqual([false, true])
  })

  it('reset() rewinds to the start, clears finished, and stops playback', () => {
    const { engine, piano } = makeEngine()
    engine.setMode('listen')
    engine.play()
    now += 800
    engine.tick(new Set())
    expect(engine.isFinished()).toBe(true)

    engine.reset()

    expect(engine.isFinished()).toBe(false)
    expect(engine.isPlaying()).toBe(false)
    expect(engine.currentTime()).toBe(0)
    expect(piano.stopAll).toHaveBeenCalledTimes(2) // once on finish, once on reset
  })

  it('after reset(), the song plays from the beginning again (notes re-fire in listen mode)', () => {
    const { engine, piano } = makeEngine()
    engine.setMode('listen')
    engine.play()
    now += 800
    engine.tick(new Set())
    engine.reset()

    engine.play()
    now += 100 // past the single note's t=0
    engine.tick(new Set())

    expect(piano.noteOnFor).toHaveBeenCalledTimes(2) // once before reset, once after
    expect(engine.isFinished()).toBe(false)
  })

  it('calling play() while finished is a harmless no-op (snaps back to finished on the next tick)', () => {
    const { engine } = makeEngine()
    engine.setMode('listen')
    engine.play()
    now += 800
    engine.tick(new Set())
    expect(engine.isFinished()).toBe(true)

    engine.play() // bypasses the UI, which would normally call reset() instead
    now += 50
    engine.tick(new Set())

    expect(engine.isFinished()).toBe(true)
    expect(engine.isPlaying()).toBe(false)
    expect(engine.currentTime()).toBe(0.8)
  })

  it('an empty song (no notes, zero duration) is immediately finished without erroring', () => {
    const piano = makeFakePiano()
    const renderer = makeFakeRenderer()
    const engine = new PracticeEngine(
      piano as unknown as PianoEngine,
      renderer as unknown as FallingNotesRenderer,
    )
    engine.loadSong({ name: 'empty', notes: [], durationSeconds: 0 })

    expect(() => engine.tick(new Set())).not.toThrow()
    expect(engine.isFinished()).toBe(true)
    expect(engine.currentTime()).toBe(0)
  })
})
